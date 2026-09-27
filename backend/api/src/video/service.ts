import { Db, ObjectId } from "mongodb";
import crypto from "node:crypto";
import { evaluateText } from "../safety/engine.js";

export type VideoVisibility = "PUBLIC" | "FOLLOWERS" | "PRIVATE";
export type VideoStatus = "UPLOADING" | "PROCESSING" | "READY" | "PUBLISHED" | "BLOCKED" | "FAILED";

const ALLOWED_MIME = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const MAX_BYTES = 500 * 1024 * 1024;

export async function initializeVideoIndexes(db: Db) {
  await Promise.all([
    db.collection("videos").createIndex({ ownerId: 1, createdAt: -1 }),
    db.collection("videos").createIndex({ status: 1, createdAt: -1 }),
    db.collection("videos").createIndex({ visibility: 1, publishedAt: -1 }),
    db.collection("videos").createIndex({ hashtags: 1, publishedAt: -1 }),
    db.collection("video_uploads").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("video_uploads").createIndex({ uploadId: 1 }, { unique: true }),
    db.collection("video_processing_jobs").createIndex({ status: 1, createdAt: 1 })
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
  return {
    uploadId,
    objectKey,
    status: "UPLOADING",
    uploadUrl: process.env.TWITOK_MEDIA_UPLOAD_URL ?? null,
    expiresInSeconds: 900
  };
}

export async function completeUpload(db: Db, userId: ObjectId, uploadId: string) {
  const upload = await db.collection("video_uploads").findOne({ uploadId, userId });
  if (!upload) throw new Error("Upload session not found");
  if (upload.status !== "UPLOADING") return upload;
  await db.collection("video_uploads").updateOne({ _id: upload._id }, {
    $set: { status: "PROCESSING", updatedAt: new Date() }
  });
  await db.collection("video_processing_jobs").insertOne({
    uploadId, userId, type: "VIDEO_TRANSCODE", status: "QUEUED", createdAt: new Date()
  });
  return { uploadId, status: "PROCESSING" };
}

export async function createVideoDraft(db: Db, userId: ObjectId, input: {
  uploadId: string; caption?: string; hashtags?: unknown; visibility?: VideoVisibility;
  allowComments?: boolean; allowDuet?: boolean; allowStitch?: boolean;
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
  const video = {
    _id: videoId, ownerId: userId, uploadId: input.uploadId, caption,
    hashtags: normalizeHashtags(input.hashtags),
    visibility: input.visibility ?? "PUBLIC",
    allowComments: input.allowComments !== false,
    allowDuet: input.allowDuet !== false,
    allowStitch: input.allowStitch !== false,
    status: safety.decision === "RESTRICT" ? "BLOCKED" : "READY",
    sourceObjectKey: upload.objectKey,
    playback: null,
    thumbnail: null,
    createdAt: now, updatedAt: now, publishedAt: null
  };
  await db.collection("videos").insertOne(video);
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
