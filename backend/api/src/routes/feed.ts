import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { rateLimit } from "../security/rate-limit.js";
import { getFeed, recordFeedEvent } from "../feed/service.js";

export const feedRouter = Router();
const feedEventLimit = rateLimit({ windowMs: 60 * 1000, max: 120, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });
const feedReadLimit = rateLimit({ windowMs: 60 * 1000, max: 120, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });

feedRouter.get("/:surface", requireUser, feedReadLimit, async (req, res) => {
  try {
    const surface = String(req.params.surface).toUpperCase() as "FOR_YOU" | "FOLLOWING" | "DISCOVER";
    if (!["FOR_YOU","FOLLOWING","DISCOVER"].includes(surface)) return res.status(400).json({ error: "Invalid feed surface" });
    const result = await getFeed(await getDb(), req.userId!, surface, typeof req.query.countryCode === "string" ? req.query.countryCode : undefined, Number(req.query.limit ?? 10), typeof req.query.cursor === "string" ? req.query.cursor : undefined);
    res.json({ surface, ...result });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to load feed" }); }
});

feedRouter.post("/events", requireUser, feedEventLimit, async (req, res) => {
  try {
    const type = String(req.body?.type) as any;
    const allowed = ["IMPRESSION","VIEW_START","VIEW_2S","VIEW_COMPLETE","REWATCH","LIKE","COMMENT","SHARE","SAVE","FOLLOW","NOT_INTERESTED"];
    if (!allowed.includes(type)) return res.status(400).json({ error: "Invalid event type" });
    const source = String(req.body?.source ?? "UNKNOWN").trim().toUpperCase();
    const allowedSources = new Set(["FOR_YOU","FOLLOWING","DISCOVER","PROFILE","SEARCH","SHARE","PROMOTED","UNKNOWN"]);
    if (!allowedSources.has(source)) return res.status(400).json({ error: "Invalid traffic source" });
    await recordFeedEvent(await getDb(), req.userId!, { videoId: String(req.body?.videoId ?? ""), type, watchMs: req.body?.watchMs, sessionId: req.body?.sessionId, source });
    res.status(202).json({ recorded: true });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to record event" }); }
});
