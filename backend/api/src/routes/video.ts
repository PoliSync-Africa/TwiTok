import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { completeUpload, createUploadSession, createVideoDraft, createVideoRemix, getVideoRemix, updateVideoRemix, completeVideoRemix, createVideoRemixUpload, getVideoRemixPlayback, publishVideo, createPhotoUploadSession, completePhotoUpload, createPhotoPost, createTextPost } from "../video/service.js";
import { createMultipartUpload, createPresignedUploadPart, completeMultipartUpload, verifyMediaObject } from "../media/storage.js";
import { queueTranscription, getTranscription, updateCaptions } from "../video/transcription.js";
import { queueCaptionTranslation, getCaptionTracks, TRANSLATION_LANGUAGES } from "../video/translation.js";
import { listStickers } from "../video/stickers.js";

export const videoRouter = Router();

videoRouter.post("/photos/uploads", requireUser, async (req, res) => {
  try {
    res.status(201).json(await createPhotoUploadSession(await getDb(), req.userId!, {
      mimeType: String(req.body?.mimeType ?? ""), sizeBytes: Number(req.body?.sizeBytes)
    }));
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to create photo upload" }); }
});

videoRouter.post("/photos/uploads/:uploadId/complete", requireUser, async (req, res) => {
  try { res.json(await completePhotoUpload(await getDb(), req.userId!, String(req.params.uploadId))); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to complete photo upload" }); }
});

videoRouter.post("/posts/photos", requireUser, async (req, res) => {
  try { res.status(201).json(await createPhotoPost(await getDb(), req.userId!, {
    uploadIds: req.body?.uploadIds, caption: req.body?.caption, hashtags: req.body?.hashtags, mentions: req.body?.mentions, location: req.body?.location, visibility: req.body?.visibility, allowComments: req.body?.allowComments, allowDuet: req.body?.allowDuet, allowStitch: req.body?.allowStitch
  })); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to create photo post" }); }
});

videoRouter.post("/posts/text", requireUser, async (req, res) => {
  try { res.status(201).json(await createTextPost(await getDb(), req.userId!, {
    text: req.body?.text, hashtags: req.body?.hashtags, mentions: req.body?.mentions, location: req.body?.location, visibility: req.body?.visibility, allowComments: req.body?.allowComments
  })); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to create text post" }); }
});

videoRouter.post("/uploads", requireUser, async (req, res) => {
  try {
    const result = await createUploadSession(await getDb(), req.userId!, {
      mimeType: String(req.body?.mimeType ?? ""),
      sizeBytes: Number(req.body?.sizeBytes),
      durationMs: req.body?.durationMs == null ? undefined : Number(req.body.durationMs)
    });
    res.status(201).json(result);
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to create upload" }); }
});

videoRouter.post("/uploads/:uploadId/multipart", requireUser, async (req, res) => {
  try {
    const uploadId = String(req.params.uploadId);
    const db = await getDb();
    const upload = await db.collection("video_uploads").findOne({ uploadId, userId: req.userId });
    if (!upload) return res.status(404).json({ error: "Upload session not found" });
    if (upload.multipartUploadId) return res.json({ uploadId, multipartUploadId: upload.multipartUploadId });
    const multipartUploadId = await createMultipartUpload({ objectKey: upload.objectKey, mimeType: upload.mimeType });
    await db.collection("video_uploads").updateOne({ uploadId, userId: req.userId }, { $set: { multipartUploadId, uploadMode: "MULTIPART", updatedAt: new Date() } });
    res.status(201).json({ uploadId, multipartUploadId, partSizeBytes: 10 * 1024 * 1024 });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to start multipart upload" }); }
});

videoRouter.post("/uploads/:uploadId/multipart/part-url", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const upload = await db.collection("video_uploads").findOne({ uploadId: String(req.params.uploadId), userId: req.userId });
    if (!upload?.multipartUploadId) return res.status(404).json({ error: "Multipart upload not found" });
    const partNumber = Number(req.body?.partNumber);
    const maxParts = Math.ceil(Number(upload.sizeBytes) / (10 * 1024 * 1024));
    if (!Number.isInteger(partNumber) || partNumber < 1 || !Number.isFinite(maxParts) || partNumber > maxParts) return res.status(400).json({ error: "Invalid multipart part number" });
    res.json(await createPresignedUploadPart({ objectKey: upload.objectKey, uploadId: upload.multipartUploadId, partNumber }));
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to sign multipart part" }); }
});

videoRouter.post("/uploads/:uploadId/multipart/complete", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const uploadId = String(req.params.uploadId);
    const upload = await db.collection("video_uploads").findOne({ uploadId, userId: req.userId });
    if (!upload) return res.status(404).json({ error: "Upload session not found" });
    // Completion is idempotent, but the storage completion itself is not safe
    // to execute concurrently. Atomically claim the completion step so two
    // mobile retries cannot both finalize the same object-storage upload.
    if (upload.multipartCompletedAt) {
      return res.json({ uploadId, completed: true, etag: upload.etag ?? null, idempotent: true });
    }
    if (!upload.multipartUploadId) return res.status(404).json({ error: "Multipart upload not found" });

    const completionLeaseMs = 10 * 60 * 1000;
    const now = new Date();
    const claimed = await db.collection("video_uploads").findOneAndUpdate(
      {
        uploadId,
        userId: req.userId,
        multipartUploadId: upload.multipartUploadId,
        $or: [
          { multipartCompletingAt: { $exists: false } },
          { multipartCompletingAt: { $lt: new Date(now.getTime() - completionLeaseMs) } }
        ]
      },
      { $set: { multipartCompletingAt: now, updatedAt: now } },
      { returnDocument: "after" }
    );
    if (!claimed) {
      const current = await db.collection("video_uploads").findOne(
        { uploadId, userId: req.userId },
        { projection: { multipartCompletedAt: 1, etag: 1 } }
      );
      if (current?.multipartCompletedAt) {
        return res.json({ uploadId, completed: true, etag: current.etag ?? null, idempotent: true });
      }
      return res.status(409).json({ error: "Multipart upload completion is already in progress" });
    }
    const partSizeBytes = 10 * 1024 * 1024;
    const parts = Array.isArray(req.body?.parts) ? req.body.parts.map((part: any) => ({ partNumber: Number(part.partNumber), etag: String(part.etag).trim() })) : [];
    const maxParts = Math.ceil(Number(upload.sizeBytes) / partSizeBytes);
    if (!parts.length || !Number.isFinite(maxParts) || maxParts < 1 || parts.length > maxParts) return res.status(400).json({ error: "Invalid multipart part count" });
    const sortedPartNumbers = [...parts].sort((a, b) => a.partNumber - b.partNumber).map(part => part.partNumber);
    if (sortedPartNumbers.some((partNumber, index) => partNumber !== index + 1)) return res.status(400).json({ error: "Multipart parts must be sequential" });
    const result = await completeMultipartUpload({ objectKey: upload.objectKey, uploadId: upload.multipartUploadId, parts });
    const verified = await verifyMediaObject(upload.objectKey, String(upload.mimeType), 500 * 1024 * 1024);
    if (verified.sizeBytes !== Number(upload.sizeBytes)) {
      return res.status(400).json({ error: "Uploaded video size does not match the declared size" });
    }
    await db.collection("video_uploads").updateOne(
      { uploadId, userId: req.userId, multipartCompletingAt: claimed.multipartCompletingAt },
      {
        $set: { multipartCompletedAt: new Date(), updatedAt: new Date(), etag: result.etag },
        $unset: { multipartCompletingAt: "" }
      }
    );
    res.json({ uploadId, completed: true, etag: result.etag });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to complete multipart upload" }); }
});

videoRouter.post("/uploads/:uploadId/complete", requireUser, async (req, res) => {
  try { res.json(await completeUpload(await getDb(), req.userId!, String(req.params.uploadId))); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to complete upload" }); }
});

// Public, shareable video detail used by /video/:videoId links.
videoRouter.get("/public/:videoId", async (req, res) => {
  try {
    if (!ObjectId.isValid(String(req.params.videoId))) return res.status(400).json({ error: "Invalid video id" });
    const db = await getDb();
    const videoId = new ObjectId(String(req.params.videoId));
    const video = await db.collection("videos").findOne(
      { _id: videoId, status: "PUBLISHED", visibility: "PUBLIC" },
      { projection: { _id: 1, ownerId: 1, caption: 1, hashtags: 1, playback: 1, thumbnail: 1, publishedAt: 1 } }
    );
    if (!video) return res.status(404).json({ error: "Video not found" });
    const owner = video.ownerId ? await db.collection("users").findOne(
      { _id: video.ownerId },
      { projection: { _id: 1, username: 1, nickname: 1 } }
    ) : null;
    res.json({
      video: {
        id: video._id.toHexString(),
        caption: video.caption ?? "",
        hashtags: Array.isArray(video.hashtags) ? video.hashtags : [],
        playback: video.playback ?? null,
        thumbnail: video.thumbnail ?? null,
        publishedAt: video.publishedAt ?? null,
        owner: owner ? { id: owner._id.toHexString(), username: owner.username ?? "", nickname: owner.nickname ?? "" } : null
      }
    });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to load public video" }); }
});

videoRouter.get("/:videoId", requireUser, async (req, res) => {
  try {
    const videoId = new ObjectId(String(req.params.videoId));
    const video = await (await getDb()).collection("videos").findOne({ _id: videoId, ownerId: req.userId });
    if (!video) return res.status(404).json({ error: "Video not found" });
    res.json({ id: video._id.toHexString(), status: video.status, playback: video.playback ?? null, thumbnail: video.thumbnail ?? null, coverTimeMs: video.coverTimeMs ?? 0 });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to load video" }); }
});

videoRouter.post("/drafts", requireUser, async (req, res) => {
  try {
    res.status(201).json(await createVideoDraft(await getDb(), req.userId!, {
      uploadId: String(req.body?.uploadId ?? ""),
      clipUploadIds: req.body?.clipUploadIds, clipTrimRanges: req.body?.clipTrimRanges, clipTransitions: req.body?.clipTransitions, clipSettings: req.body?.clipSettings,
      caption: req.body?.caption, hashtags: req.body?.hashtags, mentions: req.body?.mentions, location: req.body?.location, visibility: req.body?.visibility, allowComments: req.body?.allowComments, allowDuet: req.body?.allowDuet, allowStitch: req.body?.allowStitch,
      coverTimeMs: req.body?.coverTimeMs, trimStartMs: req.body?.trimStartMs, trimEndMs: req.body?.trimEndMs, speed: req.body?.speed, soundId: req.body?.soundId,
      originalVolume: req.body?.originalVolume, addedSoundVolume: req.body?.addedSoundVolume, textOverlays: req.body?.textOverlays, captions: req.body?.captions,
      autoCaptions: req.body?.autoCaptions === true, captionLanguage: req.body?.captionLanguage, effect: req.body?.effect, stickers: req.body?.stickers
    }));
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to create video draft" }); }
});

videoRouter.get("/remixes/:remixId", requireUser, async (req, res) => {
  try { res.json({ remix: await getVideoRemix(await getDb(), req.userId!, String(req.params.remixId)) }); }
  catch (e) { res.status(404).json({ error: e instanceof Error ? e.message : "Unable to load remix draft" }); }
});

videoRouter.post("/remixes/:remixId/upload", requireUser, async (req, res) => {
  try {
    res.status(201).json(await createVideoRemixUpload(await getDb(), req.userId!, String(req.params.remixId), {
      mimeType: String(req.body?.mimeType ?? ""), sizeBytes: Number(req.body?.sizeBytes)
    }));
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to create remix upload" }); }
});

videoRouter.get("/remixes/:remixId/playback", requireUser, async (req, res) => {
  try { res.json(await getVideoRemixPlayback(await getDb(), req.userId!, String(req.params.remixId))); }
  catch (e) { res.status(404).json({ error: e instanceof Error ? e.message : "Unable to load remix playback" }); }
});

videoRouter.post("/remixes/:remixId/complete", requireUser, async (req, res) => {
  try {
    res.json({ remix: await completeVideoRemix(await getDb(), req.userId!, String(req.params.remixId), { uploadId: String(req.body?.uploadId ?? ""), caption: req.body?.caption }) });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to complete remix" }); }
});

videoRouter.patch("/remixes/:remixId", requireUser, async (req, res) => {
  try { res.json({ remix: await updateVideoRemix(await getDb(), req.userId!, String(req.params.remixId), { caption: req.body?.caption }) }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to update remix draft" }); }
});

videoRouter.post("/:videoId/remix", requireUser, async (req, res) => {
  try {
    const mode = String(req.body?.mode ?? "").toUpperCase();
    if (mode !== "DUET" && mode !== "STITCH") return res.status(400).json({ error: "mode must be DUET or STITCH" });
    res.status(201).json({ remix: await createVideoRemix(await getDb(), req.userId!, String(req.params.videoId), mode as "DUET" | "STITCH") });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to create remix" }); }
});

videoRouter.post("/:videoId/publish", requireUser, async (req, res) => {
  try {
    const videoId = String(req.params.videoId);
    if (!ObjectId.isValid(videoId)) return res.status(400).json({ error: "Invalid video id" });
    res.json(await publishVideo(await getDb(), req.userId!, new ObjectId(videoId)));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Unable to publish video" });
  }
});

videoRouter.post("/:videoId/transcription", requireUser, async (req, res) => {
  try { res.status(202).json({ job: await queueTranscription(await getDb(), req.userId!, new ObjectId(String(req.params.videoId)), req.body?.language) }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to queue transcription" }); }
});

videoRouter.get("/:videoId/captions", requireUser, async (req, res) => {
  try { res.json(await getTranscription(await getDb(), req.userId!, new ObjectId(String(req.params.videoId)))); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to load captions" }); }
});

videoRouter.put("/:videoId/captions", requireUser, async (req, res) => {
  try { res.json({ captions: await updateCaptions(await getDb(), req.userId!, new ObjectId(String(req.params.videoId)), Array.isArray(req.body?.captions) ? req.body.captions : []) }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to save captions" }); }
});

videoRouter.post("/:videoId/caption-translations", requireUser, async (req, res) => {
  try {
    const videoId = new ObjectId(String(req.params.videoId));
    const language = String(req.body?.targetLanguage ?? "");
    if (!TRANSLATION_LANGUAGES.includes(language as any)) return res.status(400).json({ error: "Unsupported translation language" });
    res.status(202).json({ job: await queueCaptionTranslation(await getDb(), req.userId!, videoId, language) });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to queue caption translation" }); }
});

videoRouter.get("/:videoId/caption-tracks", requireUser, async (req, res) => {
  try {
    const videoId = new ObjectId(String(req.params.videoId));
    const video = await (await getDb()).collection("videos").findOne({ _id: videoId, status: "PUBLISHED", visibility: "PUBLIC" }, { projection: { _id: 1 } });
    if (!video) return res.status(404).json({ error: "Video not found" });
    res.json({ tracks: await getCaptionTracks(await getDb(), videoId) });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to load caption tracks" }); }
});

videoRouter.get("/stickers", requireUser, async (req, res) => {
  res.json({ stickers: listStickers(typeof req.query.category === "string" ? req.query.category : undefined) });
});
