import crypto from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import { evaluateText } from "../safety/engine.js";
import { getSticker } from "./stickers.js";
import { createPresignedPlayback, createPresignedUpload, headMediaObject, mediaConfigured } from "../media/storage.js";
import { verifySourceAndQueue } from "./processing.js";

export type VideoVisibility = "PUBLIC" | "FOLLOWERS" | "PRIVATE";
export type VideoStatus = "UPLOADING" | "PROCESSING" | "READY" | "PUBLISHED" | "BLOCKED" | "FAILED";

const ALLOWED_MIME = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const MAX_BYTES = 500 * 1024 * 1024;
const PHOTO_MAX_BYTES = 20 * 1024 * 1024;
const PHOTO_MIME = new Set(["image/jpeg","image/png","image/webp"]);

export async function initializeVideoIndexes(db: Db) {
  await Promise.all([
    db.collection("videos").createIndex({ ownerId: 1, createdAt: -1 }),
    db.collection("videos").createIndex({ status: 1, createdAt: -1 }),
    db.collection("videos").createIndex({ visibility: 1, publishedAt: -1 }),
    db.collection("videos").createIndex({ hashtags: 1, publishedAt: -1 }),
    db.collection("video_uploads").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("video_uploads").createIndex({ uploadId: 1 }, { unique: true }),
    db.collection("video_processing_jobs").createIndex({ status: 1, createdAt: 1 }),
    db.collection("video_remixes").createIndex({ creatorId: 1, createdAt: -1 }),
    db.collection("video_remixes").createIndex({ sourceVideoId: 1, createdAt: -1 })
  ]);
}

function validateUpload(input: { mimeType: string; sizeBytes: number }) {
  if (!ALLOWED_MIME.has(input.mimeType)) throw new Error("Unsupported video format");
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > MAX_BYTES) {
    throw new Error("Video size is outside the allowed range");
  }
}

function normalizeHashtags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).map((tag) => tag.trim().replace(/^#/, "").toLowerCase()).filter(Boolean))].slice(0, 30);
}

export async function createPhotoUploadSession(db: Db, userId: ObjectId, input: { mimeType: string; sizeBytes: number }) {
  if (!PHOTO_MIME.has(input.mimeType)) throw new Error("Unsupported photo format");
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > PHOTO_MAX_BYTES) throw new Error("Photo size is outside the allowed range");
  const uploadId = crypto.randomUUID();
  const objectKey = `photos/${userId.toHexString()}/${new Date().toISOString().slice(0, 10)}/${uploadId}/source`;
  const now = new Date();
  await db.collection("photo_uploads").insertOne({ uploadId, userId, objectKey, mimeType: input.mimeType, sizeBytes: input.sizeBytes, status: "UPLOADING", createdAt: now, updatedAt: now });
  if (!mediaConfigured()) return { uploadId, objectKey, uploadUrl: null, storageConfigured: false };
  const signed = await createPresignedUpload({ objectKey, mimeType: input.mimeType, expiresInSeconds: 900 });
  return { uploadId, objectKey, uploadUrl: signed.url, expiresInSeconds: signed.expiresInSeconds, storageConfigured: true };
}

export async function completePhotoUpload(db: Db, userId: ObjectId, uploadId: string) {
  const upload = await db.collection("photo_uploads").findOne({ uploadId, userId, status: "UPLOADING" });
  if (!upload) throw new Error("Photo upload session not found");
  await headMediaObject(upload.objectKey);
  await db.collection("photo_uploads").updateOne({ _id: upload._id }, { $set: { status: "READY", updatedAt: new Date() } });
  return { uploadId, status: "READY" };
}

export async function createPhotoPost(db: Db, userId: ObjectId, input: { uploadIds: unknown; caption?: string; visibility?: VideoVisibility; allowComments?: boolean }) {
  const uploadIds = Array.isArray(input.uploadIds) ? [...new Set(input.uploadIds.map(String).filter(Boolean))].slice(0, 35) : [];
  if (!uploadIds.length) throw new Error("At least one photo is required");
  const uploads = await db.collection("photo_uploads").find({ uploadId: { $in: uploadIds }, userId, status: "READY" }).toArray();
  if (uploads.length !== uploadIds.length) throw new Error("One or more photos are not ready");
  const caption = String(input.caption ?? "").trim().slice(0, 2200);
  const postId = new ObjectId();
  const safety = await evaluateText(db, { userId: userId.toHexString(), contentId: postId.toHexString(), text: caption, actionType: "VIDEO_CAPTION" });
  if (safety.decision === "BLOCK") throw new Error("Caption blocked by TwiTok Safety Engine");
  const now = new Date();
  await db.collection("videos").insertOne({
    _id: postId, ownerId: userId, mediaType: "PHOTO", photoObjectKeys: uploads.map(x => x.objectKey),
    photoMimeTypes: uploads.map(x => x.mimeType), caption, hashtags: normalizeHashtags([]),
    visibility: input.visibility ?? "PUBLIC", allowComments: input.allowComments !== false, allowDuet: false, allowStitch: false,
    status: "PUBLISHED", playback: null, thumbnail: null, publishedAt: now, createdAt: now, updatedAt: now
  });
  return { postId: postId.toHexString(), status: "PUBLISHED", mediaType: "PHOTO", photoCount: uploads.length };
}

export async function createTextPost(db: Db, userId: ObjectId, input: { text?: string; visibility?: VideoVisibility; allowComments?: boolean }) {
  const text = String(input.text ?? "").trim().slice(0, 4000);
  if (!text) throw new Error("Text is required");
  const postId = new ObjectId();
  const safety = await evaluateText(db, { userId: userId.toHexString(), contentId: postId.toHexString(), text, actionType: "VIDEO_CAPTION" });
  if (safety.decision === "BLOCK") throw new Error("Text post blocked by TwiTok Safety Engine");
  const now = new Date();
  await db.collection("videos").insertOne({
    _id: postId, ownerId: userId, mediaType: "TEXT", textBody: text, caption: text, hashtags: [],
    visibility: input.visibility ?? "PUBLIC", allowComments: input.allowComments !== false, allowDuet: false, allowStitch: false,
    status: "PUBLISHED", playback: null, thumbnail: null, publishedAt: now, createdAt: now, updatedAt: now
  });
  return { postId: postId.toHexString(), status: "PUBLISHED", mediaType: "TEXT" };
}

export async function createUploadSession(db: Db, userId: ObjectId, input: {
  mimeType: string; sizeBytes: number; durationMs?: number;
}) {
  validateUpload(input);
  const uploadId = crypto.randomUUID();
  const objectKey = `videos/${userId.toHexString()}/${new Date().toISOString().slice(0, 10)}/${uploadId}/source`;
  const now = new Date();
  await db.collection("video_uploads").insertOne({
    uploadId, userId, objectKey, mimeType: input.mimeType, sizeBytes: input.sizeBytes,
    durationMs: input.durationMs ?? null, status: "UPLOADING", createdAt: now, updatedAt: now
  });
  const signed = mediaConfigured()
    ? await createPresignedUpload({ objectKey, mimeType: input.mimeType, expiresInSeconds: 900 })
    : null;
  return {
    uploadId,
    objectKey,
    status: "UPLOADING",
    uploadUrl: signed?.url ?? null,
    expiresInSeconds: signed?.expiresInSeconds ?? null,
    storageConfigured: Boolean(signed)
  };
}

export async function completeUpload(db: Db, userId: ObjectId, uploadId: string) {
  const upload = await db.collection("video_uploads").findOne({ uploadId, userId });
  if (!upload) throw new Error("Upload session not found");
  if (upload.status !== "UPLOADING") return upload;
  await verifySourceAndQueue(db, userId, uploadId);
  return { uploadId, status: "PROCESSING", verified: true };
}

export async function createVideoDraft(db: Db, userId: ObjectId, input: {
  uploadId: string; caption?: string; hashtags?: unknown; visibility?: VideoVisibility;
  allowComments?: boolean; allowDuet?: boolean; allowStitch?: boolean; coverTimeMs?: number; trimStartMs?: number; trimEndMs?: number; speed?: number; soundId?: string; originalVolume?: number; addedSoundVolume?: number; textOverlays?: unknown; captions?: unknown; autoCaptions?: boolean; captionLanguage?: string; effect?: string; stickers?: unknown; clipUploadIds?: unknown; clipTrimRanges?: unknown; clipTransitions?: unknown; clipSettings?: unknown;
}) {
  const upload = await db.collection("video_uploads").findOne({ uploadId: input.uploadId, userId });
  if (!upload) throw new Error("Upload session not found");
  if (!["PROCESSING", "READY"].includes(upload.status)) throw new Error("Upload is not ready");
  const caption = String(input.caption ?? "").trim().slice(0, 2200);
  const videoId = new ObjectId();
  const safety = await evaluateText(db, {
    userId: userId.toHexString(), contentId: videoId.toHexString(), text: caption, actionType: "VIDEO_CAPTION"
  });
  if (safety.decision === "BLOCK") throw new Error("Caption blocked by TwiTok Safety Engine");
  const now = new Date();
  const allowedEffects = new Set(["NONE","VIBRANT","WARM","COOL","NOIR","VINTAGE","BRIGHT","FADE"]);
  const effect = allowedEffects.has(String(input.effect ?? "NONE")) ? String(input.effect ?? "NONE") : "NONE";
  const rawStickers = Array.isArray((input as any).stickers) ? (input as any).stickers : [];
  const stickers = rawStickers.slice(0, 20).map((item: any) => ({ stickerId: String(item?.stickerId ?? "").slice(0, 40), startMs: Math.max(0, Number(item?.startMs ?? 0)), endMs: Math.max(100, Number(item?.endMs ?? 3000)), x: Math.max(0, Math.min(1, Number(item?.x ?? 0.5))), y: Math.max(0, Math.min(1, Number(item?.y ?? 0.5))), size: Math.max(24, Math.min(180, Number(item?.size ?? 72))), rotation: Math.max(-180, Math.min(180, Number(item?.rotation ?? 0))) })).filter((x: any) => x.stickerId && getSticker(x.stickerId));
  const rawOverlays = Array.isArray(input.textOverlays) ? input.textOverlays.slice(0, 20) : [];
  const textOverlays = rawOverlays.map((item: any) => ({
    text: String(item?.text ?? "").trim().slice(0, 200),
    startMs: Math.max(0, Number(item?.startMs ?? 0)),
    endMs: Math.max(0, Number(item?.endMs ?? 3000)),
    x: Math.max(0, Math.min(1, Number(item?.x ?? 0.5))),
    y: Math.max(0, Math.min(1, Number(item?.y ?? 0.8))),
    fontSize: Math.max(16, Math.min(96, Number(item?.fontSize ?? 42))),
    fontFamily: String(item?.fontFamily ?? "sans").slice(0, 32),
    color: /^#[0-9a-fA-F]{6}$/.test(String(item?.color ?? "")) ? String(item.color) : "#FFFFFF",
    background: /^#[0-9a-fA-F]{6}(?:@[0-9.]+)?$/.test(String(item?.background ?? "")) ? String(item.background) : "#000000@0.55",
    align: ["left","center","right"].includes(String(item?.align)) ? String(item.align) : "center",
    stickerId: item?.stickerId ? String(item.stickerId).slice(0, 40) : undefined
  })).filter((item: any) => item.text && item.endMs > item.startMs); 
  for (const overlay of textOverlays) {
    const overlaySafety = await evaluateText(db, { userId: userId.toHexString(), contentId: videoId.toHexString(), text: overlay.text, actionType: "VIDEO_TEXT_OVERLAY" });
    if (overlaySafety.decision === "BLOCK") throw new Error("Text overlay blocked by TwiTok Safety Engine");
  }
  const rawCaptions = Array.isArray(input.captions) ? input.captions.slice(0, 500) : [];
  const captions = rawCaptions.map((item: any) => ({
    text: String(item?.text ?? "").trim().slice(0, 300),
    startMs: Math.max(0, Number(item?.startMs ?? 0)),
    endMs: Math.max(0, Number(item?.endMs ?? 2000))
  })).filter((item: any) => item.text && item.endMs > item.startMs);
  for (const caption of captions) {
    const captionSafety = await evaluateText(db, { userId: userId.toHexString(), contentId: videoId.toHexString(), text: caption.text, actionType: "VIDEO_CAPTION" });
    if (captionSafety.decision === "BLOCK") throw new Error("Caption blocked by TwiTok Safety Engine");
  }
  const rawClipIds = Array.isArray((input as any).clipUploadIds) ? (input as any).clipUploadIds.map(String).slice(0, 20) : [input.uploadId];
  const clipIds = [...new Set(rawClipIds.filter(Boolean))];
  const rawTrimRanges = Array.isArray((input as any).clipTrimRanges) ? (input as any).clipTrimRanges : [];
  const clipTrimRanges = clipIds.map((_, index) => { const x = rawTrimRanges[index] ?? {}; const startMs = Math.max(0, Number(x?.startMs ?? 0)); const endRaw = Number(x?.endMs ?? 0); return { startMs, endMs: Number.isFinite(endRaw) && endRaw > startMs + 100 ? endRaw : null }; });
  const rawTransitions = Array.isArray((input as any).clipTransitions) ? (input as any).clipTransitions : [];
  const rawClipSettings = Array.isArray((input as any).clipSettings) ? (input as any).clipSettings : [];
  const clipSettings = clipIds.map((_, index) => { const x=rawClipSettings[index] ?? {}; const speed=[0.5,0.75,1,1.5,2].includes(Number(x?.speed)) ? Number(x.speed) : 1; const volume=Math.max(0,Math.min(1,Number(x?.volume ?? 1))); return { speed, volume, muted: Boolean(x?.muted) }; });
  const clipTransitions = clipIds.slice(0, Math.max(0, clipIds.length - 1)).map((_, index) => { const x = rawTransitions[index] ?? {}; const type = ["NONE","FADE","DISSOLVE","WIPELEFT","WIPERIGHT","SLIDELEFT","SLIDERIGHT"].includes(String(x?.type)) ? String(x.type) : "NONE"; const durationMs = Math.max(0, Math.min(1500, Number(x?.durationMs ?? 500))); return { type, durationMs }; });
  const clipUploads = [] as any[];
  for (const clipId of clipIds) {
    const clipUpload = await db.collection("video_uploads").findOne({ uploadId: clipId, userId });
    if (!clipUpload || !["PROCESSING", "READY"].includes(clipUpload.status)) throw new Error("One or more clips are not ready");
    clipUploads.push({ uploadId: clipId, objectKey: clipUpload.objectKey });
  }
  const video = {
    _id: videoId, ownerId: userId, uploadId: input.uploadId, clipUploadIds: clipIds, clipTrimRanges, clipTransitions, clipSettings, clips: clipUploads, caption,
    hashtags: normalizeHashtags(input.hashtags),
    visibility: input.visibility ?? "PUBLIC",
    allowComments: input.allowComments !== false,
    allowDuet: input.allowDuet !== false,
    allowStitch: input.allowStitch !== false,
    coverTimeMs: Number.isFinite(Number(input.coverTimeMs)) ? Math.max(0, Number(input.coverTimeMs)) : 0,
    trimStartMs: Number.isFinite(Number(input.trimStartMs)) ? Math.max(0, Number(input.trimStartMs)) : 0,
    trimEndMs: Number.isFinite(Number(input.trimEndMs)) && Number(input.trimEndMs) > 0 ? Number(input.trimEndMs) : null,
    speed: [0.5, 0.75, 1, 1.5, 2].includes(Number(input.speed)) ? Number(input.speed) : 1,
    effect,
    stickers,
    textOverlays,
    captions,
    status: upload.status === "READY" ? "READY" : "PROCESSING",
    sourceObjectKey: upload.objectKey,
    playback: null,
    thumbnail: null,
    createdAt: now, updatedAt: now, publishedAt: null
  };
  await db.collection("videos").insertOne(video);
  if (input.autoCaptions) {
    const requestedLanguage = String(input.captionLanguage ?? "auto");
    await db.collection("transcription_jobs").updateOne(
      { videoId },
      {
        $setOnInsert: {
          videoId,
          userId,
          status: "QUEUED",
          language: requestedLanguage,
          attempts: 0,
          createdAt: now
        },
        $set: { updatedAt: now }
      },
      { upsert: true }
    );
    await db.collection("videos").updateOne({ _id: videoId }, { $set: { autoCaptionsStatus: "QUEUED", autoCaptionLanguage: requestedLanguage } });
  }
  if (input.soundId) {
    if (!ObjectId.isValid(input.soundId)) throw new Error("Invalid sound id");
    const sound = await db.collection("sounds").findOne({ _id: new ObjectId(input.soundId), status: "ACTIVE" });
    if (!sound) throw new Error("Selected sound is unavailable");
    const originalVolume = Math.max(0, Math.min(1, Number(input.originalVolume ?? 1)));
    const addedSoundVolume = Math.max(0, Math.min(1, Number(input.addedSoundVolume ?? 1)));
    await db.collection("video_sounds").updateOne(
      { videoId },
      { $set: { videoId, soundId: sound._id, originalVolume, addedSoundVolume, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );
  }
  return { videoId: videoId.toHexString(), status: video.status, safety: safety.decision };
}

export async function publishVideo(db: Db, userId: ObjectId, videoId: ObjectId) {
  const video = await db.collection("videos").findOne({ _id: videoId, ownerId: userId });
  if (!video) throw new Error("Video not found");
  if (video.status !== "READY") throw new Error("Video is not ready for publication");
  if (!video.playback) throw new Error("Video processing has not produced playback assets");
  const now = new Date();
  await db.collection("videos").updateOne({ _id: videoId }, {
    $set: { status: "PUBLISHED", publishedAt: now, updatedAt: now }
  });
  return { videoId: videoId.toHexString(), status: "PUBLISHED", publishedAt: now };
}

export async function createVideoRemix(db: Db, userId: ObjectId, sourceVideoId: string, mode: "DUET" | "STITCH") {
  if (!ObjectId.isValid(sourceVideoId)) throw new Error("Invalid source video id");
  const source = await db.collection("videos").findOne(
    { _id: new ObjectId(sourceVideoId), status: "PUBLISHED", visibility: "PUBLIC" },
    { projection: { _id: 1, ownerId: 1, caption: 1, playback: 1, thumbnail: 1, allowDuet: 1, allowStitch: 1 } }
  );
  if (!source) throw new Error("Source video not found");
  if (mode === "DUET" && source.allowDuet === false) throw new Error("Duet is disabled for this video");
  if (mode === "STITCH" && source.allowStitch === false) throw new Error("Stitch is disabled for this video");
  const now = new Date();
  const result = await db.collection("video_remixes").insertOne({
    creatorId: userId,
    sourceVideoId: source._id,
    mode,
    status: "DRAFT",
    sourceOwnerId: source.ownerId ?? null,
    sourceCaption: source.caption ?? "",
    sourcePlayback: source.playback ?? null,
    sourceThumbnail: source.thumbnail ?? null,
    createdAt: now,
    updatedAt: now
  });
  return {
    remixId: result.insertedId.toHexString(),
    mode,
    status: "DRAFT",
    sourceVideoId: source._id.toHexString(),
    sourcePlayback: source.playback ?? null,
    sourceThumbnail: source.thumbnail ?? null
  };
}


export async function getVideoRemix(db: Db, userId: ObjectId, remixId: string) {
  if (!ObjectId.isValid(remixId)) throw new Error("Invalid remix id");
  const remix = await db.collection("video_remixes").findOne({ _id: new ObjectId(remixId), creatorId: userId });
  if (!remix) throw new Error("Remix draft not found");
  return {
    id: remix._id.toHexString(), mode: remix.mode, status: remix.status,
    sourceVideoId: remix.sourceVideoId?.toHexString?.() ?? String(remix.sourceVideoId),
    sourceCaption: remix.sourceCaption ?? "", sourcePlayback: remix.sourcePlayback ?? null,
    sourceThumbnail: remix.sourceThumbnail ?? null, caption: remix.caption ?? "", mediaUrl: remix.mediaUrl ?? null,
    createdAt: remix.createdAt, updatedAt: remix.updatedAt
  };
}

export async function createVideoRemixUpload(db: Db, userId: ObjectId, remixId: string, input: { mimeType: string; sizeBytes: number }) {
  if (!ObjectId.isValid(remixId)) throw new Error("Invalid remix id");
  if (!["video/mp4", "video/quicktime", "video/webm"].includes(input.mimeType)) throw new Error("Unsupported video format");
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > MAX_BYTES) throw new Error("Video size is outside the allowed range");
  const remix = await db.collection("video_remixes").findOne({ _id: new ObjectId(remixId), creatorId: userId, status: "DRAFT" });
  if (!remix) throw new Error("Remix draft not found");
  if (!mediaConfigured()) throw new Error("Media storage is not configured");
  const uploadId = crypto.randomUUID();
  const objectKey = `remixes/${userId.toHexString()}/${new Date().toISOString().slice(0, 10)}/${remixId}/${uploadId}/source`;
  const signed = await createPresignedUpload({ objectKey, mimeType: input.mimeType, expiresInSeconds: 900 });
  await db.collection("video_remixes").updateOne({ _id: remix._id, creatorId: userId, status: "DRAFT" }, { $set: { uploadId, objectKey, mimeType: input.mimeType, sizeBytes: input.sizeBytes, uploadStatus: "UPLOADING", updatedAt: new Date() } });
  return { uploadId, objectKey, uploadUrl: signed.url, expiresInSeconds: signed.expiresInSeconds };
}

export async function completeVideoRemix(db: Db, userId: ObjectId, remixId: string, input: { uploadId: string; caption?: string }) {
  if (!ObjectId.isValid(remixId)) throw new Error("Invalid remix id");
  const uploadId = String(input.uploadId ?? "").trim();
  if (!uploadId) throw new Error("uploadId is required");
  const remix = await db.collection("video_remixes").findOne({ _id: new ObjectId(remixId), creatorId: userId, status: "DRAFT", uploadId, uploadStatus: "UPLOADING" });
  if (!remix?.objectKey) throw new Error("Remix upload session not found");
  const head = await headMediaObject(remix.objectKey);
  if (head.ContentLength != null && Number(head.ContentLength) !== Number(remix.sizeBytes)) throw new Error("Uploaded object size does not match the declared size");
  const caption = String(input.caption ?? "").trim().slice(0, 2200);
  const result = await db.collection("video_remixes").findOneAndUpdate(
    { _id: new ObjectId(remixId), creatorId: userId, status: "DRAFT", uploadId },
    { $set: { caption, status: "READY", uploadStatus: "READY", updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  if (!result) throw new Error("Remix draft not found");
  return getVideoRemix(db, userId, remixId);
}

export async function getVideoRemixPlayback(db: Db, userId: ObjectId, remixId: string) {
  if (!ObjectId.isValid(remixId)) throw new Error("Invalid remix id");
  const remix = await db.collection("video_remixes").findOne({
    _id: new ObjectId(remixId),
    creatorId: userId,
    status: "READY",
    uploadStatus: "READY"
  });
  if (!remix?.objectKey) throw new Error("Remix playback is not available");
  if (!mediaConfigured()) throw new Error("Media storage is not configured");
  const signed = await createPresignedPlayback(remix.objectKey, 3600);
  return { remixId: remix._id.toHexString(), playbackUrl: signed.url, expiresInSeconds: signed.expiresInSeconds };
}

export async function updateVideoRemix(db: Db, userId: ObjectId, remixId: string, input: { caption?: string }) {
  if (!ObjectId.isValid(remixId)) throw new Error("Invalid remix id");
  const caption = String(input.caption ?? "").trim().slice(0, 2200);
  const result = await db.collection("video_remixes").findOneAndUpdate(
    { _id: new ObjectId(remixId), creatorId: userId, status: "DRAFT" },
    { $set: { caption, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  if (!result) throw new Error("Remix draft not found");
  return getVideoRemix(db, userId, remixId);
}
