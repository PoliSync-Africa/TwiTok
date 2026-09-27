import { Router } from "express";
import { requireUser } from "../auth/middleware.js";
import { createPresignedPlayback, createPresignedUpload, mediaConfigured } from "../media/storage.js";
import { getDb } from "../db/mongo.js";

export const mediaRouter = Router();

mediaRouter.get("/status", (_req, res) => {
  res.json({ configured: mediaConfigured() });
});

mediaRouter.post("/upload-url", requireUser, async (req, res) => {
  try {
    const objectKey = String(req.body?.objectKey ?? "");
    const mimeType = String(req.body?.mimeType ?? "");
    if (!objectKey || !mimeType) return res.status(400).json({ error: "objectKey and mimeType are required" });

    const owned = (await getDb()).collection("video_uploads").findOne({
      userId: req.userId,
      objectKey
    });
    if (!owned) return res.status(404).json({ error: "Upload object not found" });

    const result = await createPresignedUpload({ objectKey, mimeType });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Unable to sign upload" });
  }
});

mediaRouter.get("/playback/:videoId", requireUser, async (req, res) => {
  try {
    const video = (await getDb()).collection("videos").findOne({ _id: new (await import("mongodb")).ObjectId(req.params.videoId) });
    if (!video || video.status !== "PUBLISHED") return res.status(404).json({ error: "Video not found" });

    if (video.playback?.hlsUrl) return res.json({ url: video.playback.hlsUrl, type: "HLS" });
    if (video.playback?.objectKey) {
      return res.json(await createPresignedPlayback(video.playback.objectKey));
    }
    return res.status(404).json({ error: "Playback asset is not ready" });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Unable to create playback URL" });
  }
});
