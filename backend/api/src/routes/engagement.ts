import { Router } from "express";
import { getDb } from "../db/mongo.js";
import { ObjectId } from "mongodb";
import { createPresignedUpload, createPresignedPlayback } from "../media/storage.js";
import { requireUser } from "../auth/middleware.js";
import { addComment, getEngagement, listComments, listCommentReplies, recordShare, toggleCommentLike, toggleLike, toggleRepost, toggleSave } from "../social/engagement.js";

export const engagementRouter = Router();

engagementRouter.get("/:videoId", requireUser, async (req, res) => {
  try { res.json(await getEngagement(await getDb(), req.userId!, String(req.params.videoId))); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to load engagement" }); }
});

engagementRouter.post("/:videoId/like", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const result = await toggleLike(db, req.userId!, String(req.params.videoId));
    res.json({ ...result, engagement: await getEngagement(db, req.userId!, String(req.params.videoId)) });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to update like" }); }
});

engagementRouter.post("/:videoId/save", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const result = await toggleSave(db, req.userId!, String(req.params.videoId));
    res.json({ ...result, engagement: await getEngagement(db, req.userId!, String(req.params.videoId)) });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to update save" }); }
});

engagementRouter.post("/:videoId/share", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const result = await recordShare(db, req.userId!, String(req.params.videoId));
    res.json({ ...result, engagement: await getEngagement(db, req.userId!, String(req.params.videoId)) });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to record share" }); }
});


engagementRouter.post("/:videoId/repost", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const result = await toggleRepost(db, req.userId!, String(req.params.videoId));
    res.json({ ...result, engagement: await getEngagement(db, req.userId!, String(req.params.videoId)) });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to update repost" }); }
});


engagementRouter.post("/:videoId/comments/upload-url", requireUser, async (req, res) => {
  try {
    const mimeType = String(req.body?.mimeType ?? "");
    const allowed = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|quicktime|webm)|audio\/(mpeg|mp4|x-m4a|wav|webm))$/i;
    if (!allowed.test(mimeType)) return res.status(400).json({ error: "Unsupported comment media type" });
    const videoId = String(req.params.videoId);
    if (!ObjectId.isValid(videoId)) return res.status(400).json({ error: "Invalid video id" });
    const objectKey = "comment-media/" + req.userId!.toHexString() + "/" + new ObjectId().toHexString();
    const signed = await createPresignedUpload({ objectKey, mimeType, expiresInSeconds: 900 });
    res.json({ objectKey, ...signed });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to sign comment media" }); }
});

engagementRouter.get("/comments/media", requireUser, async (req, res) => {
  try {
    const objectKey = String(req.query.objectKey ?? "");
    if (!objectKey.startsWith("comment-media/" + req.userId!.toHexString() + "/")) return res.status(403).json({ error: "Forbidden" });
    res.json(await createPresignedPlayback(objectKey, 900));
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to create media URL" }); }
});

engagementRouter.get("/:videoId/comments", requireUser, async (req, res) => {
  try { res.json({ comments: await listComments(await getDb(), String(req.params.videoId), Number(req.query.limit ?? 30)) }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to load comments" }); }
});

engagementRouter.post("/:videoId/comments", requireUser, async (req, res) => {
  try { res.status(201).json({ comment: await addComment(await getDb(), req.userId!, String(req.params.videoId), String(req.body?.text ?? ""), Array.isArray(req.body?.attachments) ? req.body.attachments : []) }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to add comment" }); }
});
