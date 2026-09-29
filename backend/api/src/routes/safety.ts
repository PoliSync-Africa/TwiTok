import { Router } from "express";
import { getDb } from "../db/mongo.js";
import { evaluateText, openHumanReview } from "../safety/engine.js";
import { requireUser } from "../auth/middleware.js";
import { requireInternalService } from "../security/internal.js";
import { rateLimit } from "../security/rate-limit.js";

export const safetyRouter = Router();
const safetyEvaluateLimit = rateLimit({ windowMs: 60 * 1000, max: 60 });
const safetyReviewLimit = rateLimit({ windowMs: 60 * 1000, max: 10, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });

safetyRouter.post("/evaluate/text", requireInternalService, safetyEvaluateLimit, async (req, res) => {
  try {
    const { userId, contentId, text, actionType } = req.body ?? {};
    if (!userId || !contentId || !actionType) return res.status(400).json({ error: "userId, contentId and actionType are required" });
    return res.json(await evaluateText(await getDb(), { userId, contentId, text: String(text ?? ""), actionType }));
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Safety evaluation failed" }); }
});

safetyRouter.post("/review", requireUser, safetyReviewLimit, async (req, res) => {
  try {
    const { contentId, reason, priority } = req.body ?? {};
    if (!contentId || !reason) return res.status(400).json({ error: "contentId and reason are required" });
    return res.status(201).json(await openHumanReview(await getDb(), {
      userId: req.userId!.toHexString(), contentId, reason: String(reason).slice(0, 1000), priority
    }));
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Review case creation failed" }); }
});