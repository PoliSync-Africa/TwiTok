import { Router } from "express";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { addComment, getEngagement, listComments, recordShare, toggleLike, toggleRepost, toggleSave } from "../social/engagement.js";

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

engagementRouter.get("/:videoId/comments", requireUser, async (req, res) => {
  try { res.json({ comments: await listComments(await getDb(), String(req.params.videoId), Number(req.query.limit ?? 30)) }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to load comments" }); }
});

engagementRouter.post("/:videoId/comments", requireUser, async (req, res) => {
  try { res.status(201).json({ comment: await addComment(await getDb(), req.userId!, String(req.params.videoId), String(req.body?.text ?? "")) }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to add comment" }); }
});
