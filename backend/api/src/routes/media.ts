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
    const userPrefix = `videos/${req.userId!.toHexString()}/`;
    const allowedPrefixes = [userPrefix, `photos/${req.userId!.toHexString()}/`, `remixes/${req.userId!.toHexString()}/`, `profile-photos/${req.userId!.toHexString()}/`, `comment-media/${req.userId!.toHexString()}/`];
    if (!objectKey || !allowedPrefixes.some(prefix => objectKey.startsWith(prefix))) return res.status(403).json({ error: "Media object is not owned by this account" });
    if (!mimeType) return res.status(400).json({ error: "mimeType is required" });
    const db = await getDb();
    const owned = await db.collection("video_uploads").findOne({ userId: req.userId, objectKey });
    const photo = await db.collection("photo_uploads").findOne({ userId: req.userId, objectKey });
    if (!owned && !photo && !objectKey.startsWith("comment-media/") && !objectKey.startsWith("profile-photos/")) return res.status(404).json({ error: "Upload object not found" });
    const result = await createPresignedUpload({ objectKey, mimeType });
    res.json(result);
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to sign upload" }); }
});

mediaRouter.get("/playback/:videoId", requireUser, async (req, res) => {
  try {
    const { ObjectId } = await import("mongodb");
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
