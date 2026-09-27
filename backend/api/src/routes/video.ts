import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { completeUpload, createUploadSession, createVideoDraft, publishVideo } from "../video/service.js";
import { createMultipartUpload, createPresignedUploadPart, completeMultipartUpload } from "../media/storage.js";

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
    const uploadId = String(req.params.uploadId);
    const upload = await (await getDb()).collection("video_uploads").findOne({ uploadId, userId: req.userId });
    if (!upload) return res.status(404).json({ error: "Upload session not found" });
    if (upload.multipartUploadId) return res.json({ uploadId, multipartUploadId: upload.multipartUploadId });

    const multipartUploadId = await createMultipartUpload({ objectKey: upload.objectKey, mimeType: upload.mimeType });
    await getDb().collection("video_uploads").updateOne(
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
    const upload = await getDb().collection("video_uploads").findOne({ uploadId: req.params.uploadId, userId: req.userId });
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
    const upload = await db.collection("video_uploads").findOne({ uploadId: req.params.uploadId, userId: req.userId });
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
      { uploadId: req.params.uploadId, userId: req.userId },
      { $set: { multipartCompletedAt: new Date(), updatedAt: new Date(), etag: result.etag } }
    );
    res.json({ uploadId: req.params.uploadId, completed: true, etag: result.etag });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Unable to complete multipart upload" });
  }
});

videoRouter.post("/uploads/:uploadId/complete", requireUser, async (req, res) => {
  try {
    res.json(await completeUpload(await getDb(), req.userId!, req.params.uploadId));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Unable to complete upload" });
  }
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
      addedSoundVolume: req.body?.addedSoundVolume
    }));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Unable to create video draft" });
  }
});

videoRouter.post("/:videoId/publish", requireUser, async (req, res) => {
  try {
    const videoId = new ObjectId(req.params.videoId);
    res.json(await publishVideo(await getDb(), req.userId!, videoId));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Unable to publish video" });
  }
});
