import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { getFeed, recordFeedEvent } from "../feed/service.js";

export const feedRouter = Router();

feedRouter.get("/:surface", requireUser, async (req, res) => {
  try {
    const surface = String(req.params.surface).toUpperCase() as "FOR_YOU" | "FOLLOWING" | "AFRICA";
    if (!["FOR_YOU","FOLLOWING","AFRICA"].includes(surface)) return res.status(400).json({ error: "Invalid feed surface" });
    const videos = await getFeed(await getDb(), req.userId!, surface, typeof req.query.countryCode === "string" ? req.query.countryCode : undefined, Number(req.query.limit ?? 20));
    res.json({ surface, videos });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to load feed" }); }
});

feedRouter.post("/events", requireUser, async (req, res) => {
  try {
    const type = String(req.body?.type) as any;
    const allowed = ["IMPRESSION","VIEW_START","VIEW_2S","VIEW_COMPLETE","REWATCH","LIKE","COMMENT","SHARE","SAVE","FOLLOW","NOT_INTERESTED"];
    if (!allowed.includes(type)) return res.status(400).json({ error: "Invalid event type" });
    await recordFeedEvent(await getDb(), req.userId!, { videoId: String(req.body?.videoId ?? ""), type, watchMs: req.body?.watchMs, sessionId: req.body?.sessionId });
    res.status(202).json({ recorded: true });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to record event" }); }
});
