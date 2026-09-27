import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { completeUpload, createUploadSession, createVideoDraft, publishVideo } from "../video/service.js";
import { createMultipartUpload, createPresignedUploadPart, completeMultipartUpload } from "../media/storage.js";
import { queueTranscription, getTranscription, updateCaptions } from "../video/transcription.js";
import { queueCaptionTranslation, getCaptionTracks, TRANSLATION_LANGUAGES } from "../video/translation.js";
import { listStickers } from "../video/stickers.js";

export const videoRouter = Router();

videoRouter.post("/uploads", requireUser, async (req, res) => {
  try {
    const result = await createUploadSession(await getDb(), req.userId!, {
      mimeType: String(req.body?.mimeType ?? ""),
      sizeBytes: Number(req.body?.sizeBytes),
      durationMs: req.body?.durationMs == null ? undefined : Number(req.body.durationMs)
    });
    res.status(201).json(result);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Unable to create upload" });
  }
});

videoRouter.post("/uploads/:uploadId/multipart", requireUser, async (req, res) => {
  try {
    const uploadId = String(String(req.params.uploadId));
    const upload = await (await getDb()).collection("video_uploads").findOne({ uploadId, userId: req.userId });
    if (!upload) return res.status(404).json({ error: "Upload session not found" });
    if (upload.multipartUploadId) return res.json({ uploadId, multipartUploadId: upload.multipartUploadId });

    const multipartUploadId = await createMultipartUpload({ objectKey: upload.objectKey, mimeType: upload.mimeType });
    (await getDb()).collection("video_uploads").updateOne(
      { uploadId, userId: req.userId },
      { $set: { multipartUploadId, uploadMode: "MULTIPART", updatedAt: new Date() } }
    );
    res.status(201).json({ uploadId, multipartUploadId, partSizeBytes: 10 * 1024 * 1024 });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Unable to start multipart upload" });
  }
});

videoRouter.post("/uploads/:uploadId/multipart/part-url", requireUser, async (req, res) => {
  try {
    const upload = await (await getDb()).collection("video_uploads").findOne({ uploadId: String(req.params.uploadId), userId: req.userId });
    if (!upload?.multipartUploadId) return res.status(404).json({ error: "Multipart upload not found" });
    const partNumber = Number(req.body?.partNumber);
    res.json(await createPresignedUploadPart({
      objectKey: upload.objectKey,
      uploadId: upload.multipartUploadId,
      partNumber
    }));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Unable to sign multipart part" });
  }
});

videoRouter.post("/uploads/:uploadId/multipart/complete", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const upload = await db.collection("video_uploads").findOne({ uploadId: String(req.params.uploadId), userId: req.userId });
    if (!upload?.multipartUploadId) return res.status(404).json({ error: "Multipart upload not found" });
    const parts = Array.isArray(req.body?.parts) ? req.body.parts.map((part: any) => ({
      partNumber: Number(part.partNumber),
      etag: String(part.etag)
    })) : [];
    if (!parts.length) return res.status(400).json({ error: "parts are required" });
    const result = await completeMultipartUpload({
      objectKey: upload.objectKey,
      uploadId: upload.multipartUploadId,
      parts
    });
    await db.collection("video_uploads").updateOne(
      { uploadId: String(req.params.uploadId), userId: req.userId },
      { $set: { multipartCompletedAt: new Date(), updatedAt: new Date(), etag: result.etag } }
    );
    res.json({ uploadId: String(req.params.uploadId), completed: true, etag: result.etag });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Unable to complete multipart upload" });
  }
});

videoRouter.post("/uploads/:uploadId/complete", requireUser, async (req, res) => {
  try {
    res.json(await completeUpload(await getDb(), req.userId!, String(req.params.uploadId)));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Unable to complete upload" });
  }
});

videoRouter.get("/:videoId", requireUser, async (req, res) => {
  try {
    const videoId = new ObjectId(String(String(req.params.videoId)));
    const video = await (await getDb()).collection("videos").findOne({ _id: videoId, ownerId: req.userId });
    if (!video) return res.status(404).json({ error: "Video not found" });
    res.json({ id: video._id.toHexString(), status: video.status, playback: video.playback ?? null, thumbnail: video.thumbnail ?? null, coverTimeMs: video.coverTimeMs ?? 0 });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to load video" }); }
});

videoRouter.post("/drafts", requireUser, async (req, res) => {
  try {
    res.status(201).json(await createVideoDraft(await getDb(), req.userId!, {
      uploadId: String(req.body?.uploadId ?? ""),
      clipUploadIds: req.body?.clipUploadIds,
      clipTrimRanges: req.body?.clipTrimRanges,
      clipTransitions: req.body?.clipTransitions,
      caption: req.body?.caption,
      hashtags: req.body?.hashtags,
      visibility: req.body?.visibility,
      allowComments: req.body?.allowComments,
      allowDuet: req.body?.allowDuet,
      allowStitch: req.body?.allowStitch,
      coverTimeMs: req.body?.coverTimeMs,
      trimStartMs: req.body?.trimStartMs,
      trimEndMs: req.body?.trimEndMs,
      speed: req.body?.speed,
      soundId: req.body?.soundId,
      originalVolume: req.body?.originalVolume,
      addedSoundVolume: req.body?.addedSoundVolume,
      textOverlays: req.body?.textOverlays,
      captions: req.body?.captions,
      autoCaptions: req.body?.autoCaptions === true,
      captionLanguage: req.body?.captionLanguage,
      effect: req.body?.effect,
      stickers: req.body?.stickers
    }));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Unable to create video draft" });
  }
});

videoRouter.post("/:videoId/publish", requireUser, async (req, res) => {
  try {
    const videoId = new ObjectId(String(req.params.videoId));
    res.json(await publishVideo(await getDb(), req.userId!, videoId));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Unable to publish video" });
  }
});


videoRouter.post("/:videoId/transcription", requireUser, async (req, res) => {
  try {
    const videoId = new ObjectId(String(req.params.videoId));
    res.status(202).json({ job: await queueTranscription(await getDb(), req.userId!, videoId, req.body?.language) });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to queue transcription" }); }
});

videoRouter.get("/:videoId/captions", requireUser, async (req, res) => {
  try {
    const videoId = new ObjectId(String(req.params.videoId));
    res.json(await getTranscription(await getDb(), req.userId!, videoId));
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to load captions" }); }
});

videoRouter.put("/:videoId/captions", requireUser, async (req, res) => {
  try {
    const videoId = new ObjectId(String(req.params.videoId));
    res.json({ captions: await updateCaptions(await getDb(), req.userId!, videoId, Array.isArray(req.body?.captions) ? req.body.captions : []) });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to save captions" }); }
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
