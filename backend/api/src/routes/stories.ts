import { Router } from "express";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { createStoryFromVideo, listStories, markStoryViewed } from "../social/stories.js";

export const storiesRouter = Router();

storiesRouter.get("/", requireUser, async (req, res) => {
  try { res.json({ stories: await listStories(await getDb(), req.userId!) }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to load stories" }); }
});

storiesRouter.post("/", requireUser, async (req, res) => {
  try { res.status(201).json({ story: await createStoryFromVideo(await getDb(), req.userId!, String(req.body?.videoId ?? "")) }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to create story" }); }
});

storiesRouter.post("/:storyId/view", requireUser, async (req, res) => {
  try { res.json(await markStoryViewed(await getDb(), req.userId!, String(req.params.storyId))); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to view story" }); }
});
