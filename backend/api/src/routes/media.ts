import { Router } from "express";
import { requireUser } from "../auth/middleware.js";
import { createPresignedPlayback, createPresignedUpload, mediaConfigured } from "../media/storage.js";
import { getDb } from "../db/mongo.js";
import { ObjectId } from "mongodb";
import { rateLimit } from "../security/rate-limit.js";

export const mediaRouter = Router();
const uploadSigningLimit = rateLimit({ windowMs: 60 * 1000, max: 30, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });
const playbackReadLimit = rateLimit({ windowMs: 60 * 1000, max: 120, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });

mediaRouter.get("/status", (_req, res) => {
  res.json({ configured: mediaConfigured() });
});

mediaRouter.post("/upload-url", requireUser, uploadSigningLimit, async (req, res) => {
  try {
    const objectKey = String(req.body?.objectKey ?? "");
    const mimeType = String(req.body?.mimeType ?? "").toLowerCase().split(";")[0].trim();
    const sizeBytes = Number(req.body?.sizeBytes);
    const userId = req.userId!.toHexString();
    const prefixes = [
      { prefix: `videos/${userId}/`, types: new Set(["video/mp4", "video/quicktime", "video/webm"]), maxBytes: 500 * 1024 * 1024 },
      { prefix: `photos/${userId}/`, types: new Set(["image/jpeg", "image/png", "image/webp"]), maxBytes: 20 * 1024 * 1024 },
      { prefix: `remixes/${userId}/`, types: new Set(["video/mp4", "video/quicktime", "video/webm"]), maxBytes: 500 * 1024 * 1024 },
      { prefix: `profile-photos/${userId}/`, types: new Set(["image/jpeg", "image/png", "image/webp"]), maxBytes: 10 * 1024 * 1024 },
      { prefix: `comment-media/${userId}/`, types: new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "video/webm", "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/webm"]), maxBytes: 50 * 1024 * 1024 }
    ];
    if (!objectKey) return res.status(400).json({ error: "objectKey is required" });
    const mediaRule = prefixes.find(item => objectKey.startsWith(item.prefix));
    if (!mediaRule) return res.status(403).json({ error: "Media object is not owned by this account" });
    if (!mediaRule.types.has(mimeType)) return res.status(400).json({ error: "Unsupported media type for this upload" });
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > mediaRule.maxBytes) return res.status(400).json({ error: "Invalid media size" });
    const db = await getDb();
    const owned = await db.collection("video_uploads").findOne({ userId: req.userId, objectKey, mimeType, sizeBytes });
    const photo = await db.collection("photo_uploads").findOne({ userId: req.userId, objectKey, mimeType, sizeBytes });
    if (!owned && !photo && !objectKey.startsWith("comment-media/") && !objectKey.startsWith("profile-photos/")) return res.status(404).json({ error: "Upload object not found" });
    const result = await createPresignedUpload({ objectKey, mimeType, sizeBytes });
    res.json(result);
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to sign upload" }); }
});

mediaRouter.get("/playback/:videoId", requireUser, playbackReadLimit, async (req, res) => {
  try {
    if (!ObjectId.isValid(String(req.params.videoId))) return res.status(400).json({ error: "Invalid video id" });
    const db = await getDb();
    const video = await db.collection("videos").findOne({ _id: new ObjectId(String(req.params.videoId)) });
    if (!video || video.status !== "PUBLISHED") return res.status(404).json({ error: "Video not found" });
    const ownerId = video.ownerId as ObjectId | undefined;
    if (!ownerId) return res.status(404).json({ error: "Video owner not found" });
    if (!ownerId.equals(req.userId!)) {
      const blocked = await db.collection("blocks").findOne({ $or: [{ blockerId: req.userId!, blockedId: ownerId }, { blockerId: ownerId, blockedId: req.userId! }] }, { projection: { _id: 1 } });
      if (blocked) return res.status(404).json({ error: "Video not found" });
      if (video.visibility === "PRIVATE") return res.status(403).json({ error: "This video is private" });
      if (video.visibility === "FOLLOWERS") {
        const following = await db.collection("follows").findOne({ followerId: req.userId!, followingId: ownerId }, { projection: { _id: 1 } });
        if (!following) return res.status(403).json({ error: "Follow the creator to view this video" });
      }
    }
    if (video.playback?.hlsUrl) return res.json({ url: video.playback.hlsUrl, type: "HLS" });
    if (video.playback?.objectKey) return res.json(await createPresignedPlayback(video.playback.objectKey));
    return res.status(404).json({ error: "Playback asset is not ready" });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to create playback URL" }); }
});
