import { Router } from "express";
import { getDb } from "../db/mongo.js";
import { cacheDeletePrefix } from "../cache/redis.js";
import { evaluateText, listModerationCases, createAppeal, listAppeals, listMutedUsers, muteUser, openHumanReview, openUserReport, unmuteUser, updateAppeal, updateModerationCase, recordModerationAction, rollbackModerationAction, reconcileModerationAction } from "../safety/engine.js";
import { requireUser } from "../auth/middleware.js";
import { requireInternalService } from "../security/internal.js";
import { requireOwner } from "../auth/admin-middleware.js";
import { rateLimit } from "../security/rate-limit.js";
import { blockUser, listBlocks, unblockUser } from "../social/blocks.js";

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

safetyRouter.get("/moderation/cases", requireOwner, safetyReviewLimit, async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
    if (status && !["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"].includes(status)) {
      return res.status(400).json({ error: "Invalid moderation case status" });
    }
    const cases = await listModerationCases(await getDb(), { status: status as any, limit: Number(req.query.limit ?? 50) });
    return res.json({ cases });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to list moderation cases" });
  }
});

safetyRouter.patch("/moderation/cases/:caseId", requireOwner, safetyReviewLimit, async (req, res) => {
  try {
    const status = req.body?.status ? String(req.body.status).toUpperCase() : undefined;
    if (status && !["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"].includes(status)) {
      return res.status(400).json({ error: "Invalid moderation case status" });
    }
    const result = await updateModerationCase(await getDb(), String(req.params.caseId), {
      status: status as any,
      assigneeId: req.body?.assigneeId === null ? null : (req.body?.assigneeId ? String(req.body.assigneeId) : undefined),
      resolution: req.body?.resolution,
      reviewerId: req.ownerId!
    });
    return res.json({ case: result });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to update moderation case" });
  }
});


safetyRouter.post("/moderation/cases/:caseId/appeals", requireUser, safetyReviewLimit, async (req, res) => {
  try {
    const appeal = await createAppeal(await getDb(), {
      caseId: String(req.params.caseId),
      userId: req.userId!.toHexString(),
      reason: String(req.body?.reason ?? "")
    });
    return res.status(201).json({ appeal });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to submit appeal" });
  }
});

safetyRouter.get("/moderation/appeals", requireUser, safetyReviewLimit, async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
    if (status && !["OPEN", "IN_REVIEW", "UPHELD", "OVERTURNED", "CLOSED"].includes(status)) {
      return res.status(400).json({ error: "Invalid appeal status" });
    }
    const appeals = await listAppeals(await getDb(), {
      userId: req.query.mine === "true" ? req.userId!.toHexString() : undefined,
      status: status as any,
      limit: Number(req.query.limit ?? 50)
    });
    return res.json({ appeals });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to list appeals" });
  }
});

safetyRouter.patch("/moderation/appeals/:appealId", requireOwner, safetyReviewLimit, async (req, res) => {
  try {
    const status = String(req.body?.status ?? "").toUpperCase();
    if (!["OPEN", "IN_REVIEW", "UPHELD", "OVERTURNED", "CLOSED"].includes(status)) {
      return res.status(400).json({ error: "Invalid appeal status" });
    }
    const appeal = await updateAppeal(await getDb(), String(req.params.appealId), {
      status: status as any,
      reviewerId: req.ownerId!,
      resolution: req.body?.resolution
    });
    return res.json({ appeal });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to update appeal" });
  }
});


safetyRouter.post("/moderation/actions", requireOwner, safetyReviewLimit, async (req, res) => {
  try {
    const action = String(req.body?.action ?? "").toUpperCase();
    if (!["CONTENT_BLOCK", "CONTENT_RESTORE", "ACCOUNT_RESTRICT", "ACCOUNT_RESTORE"].includes(action)) {
      return res.status(400).json({ error: "Invalid moderation action" });
    }
    const source = String(req.body?.source ?? "OWNER").toUpperCase();
    if (source !== "OWNER") return res.status(400).json({ error: "Owner action endpoint requires OWNER source" });
    const result = await recordModerationAction(await getDb(), {
      caseId: String(req.body?.caseId ?? ""),
      actorId: req.ownerId!,
      source: "OWNER",
      action: action as any,
      targetUserId: req.body?.targetUserId ? String(req.body.targetUserId) : undefined,
      targetContentId: req.body?.targetContentId ? String(req.body.targetContentId) : undefined,
      reason: String(req.body?.reason ?? ""),
      evidenceId: req.body?.evidenceId ? String(req.body.evidenceId) : undefined,
      idempotencyKey: req.body?.idempotencyKey ? String(req.body.idempotencyKey).slice(0, 128) : undefined
    });
    return res.status(201).json({ action: result });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to apply moderation action" });
  }
});

safetyRouter.post("/moderation/actions/:actionId/reconcile", requireOwner, safetyReviewLimit, async (req, res) => {
  try {
    const resolution = String(req.body?.resolution ?? "").toUpperCase();
    if (!["MARK_FAILED", "MARK_ROLLED_BACK", "MARK_APPLIED"].includes(resolution)) {
      return res.status(400).json({ error: "Invalid reconciliation resolution" });
    }
    const action = await reconcileModerationAction(await getDb(), {
      actionId: String(req.params.actionId),
      actorId: req.ownerId!,
      resolution: resolution as "MARK_FAILED" | "MARK_ROLLED_BACK" | "MARK_APPLIED",
      reason: String(req.body?.reason ?? "")
    });
    return res.json({ action });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to reconcile moderation action" });
  }
});

safetyRouter.post("/moderation/actions/:actionId/rollback", requireOwner, safetyReviewLimit, async (req, res) => {
  try {
    const action = await rollbackModerationAction(await getDb(), {
      actionId: String(req.params.actionId),
      actorId: req.ownerId!
    });
    return res.json({ action });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to rollback moderation action" });
  }
});

safetyRouter.get("/blocks", requireUser, safetyReviewLimit, async (req, res) => {
  try {
    const blocks = await listBlocks(await getDb(), req.userId!.toHexString());
    return res.json({ blocks: blocks.map(block => ({
      blockedId: block.blockedId.toHexString(),
      createdAt: block.createdAt
    })) });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to list blocked users" });
  }
});

safetyRouter.post("/blocks/:userId", requireUser, safetyReviewLimit, async (req, res) => {
  try {
    return res.status(201).json(await blockUser(await getDb(), req.userId!.toHexString(), String(req.params.userId)));
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to block user" });
  }
});

safetyRouter.delete("/blocks/:userId", requireUser, safetyReviewLimit, async (req, res) => {
  try {
    return res.json(await unblockUser(await getDb(), req.userId!.toHexString(), String(req.params.userId)));
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to unblock user" });
  }
});


safetyRouter.get("/mutes", requireUser, safetyReviewLimit, async (req, res) => {
  try {
    return res.json({ mutes: await listMutedUsers(await getDb(), req.userId!.toHexString()) });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to list muted users" });
  }
});

safetyRouter.post("/mutes/:userId", requireUser, safetyReviewLimit, async (req, res) => {
  try {
    const db = await getDb();
    const result = await muteUser(db, req.userId!.toHexString(), String(req.params.userId));
    await cacheDeletePrefix("feed:v1:" + req.userId!.toHexString() + ":");
    return res.status(201).json(result);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to mute user" });
  }
});

safetyRouter.delete("/mutes/:userId", requireUser, safetyReviewLimit, async (req, res) => {
  try {
    const db = await getDb();
    const result = await unmuteUser(db, req.userId!.toHexString(), String(req.params.userId));
    await cacheDeletePrefix("feed:v1:" + req.userId!.toHexString() + ":");
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to unmute user" });
  }
});

safetyRouter.post("/reports", requireUser, safetyReviewLimit, async (req, res) => {
  try {
    const targetType = String(req.body?.targetType ?? "").toUpperCase();
    if (!["USER", "VIDEO", "COMMENT", "LIVE"].includes(targetType)) return res.status(400).json({ error: "Invalid report target type" });
    const report = await openUserReport(await getDb(), {
      reporterId: req.userId!.toHexString(),
      targetType: targetType as "USER" | "VIDEO" | "COMMENT" | "LIVE",
      targetId: String(req.body?.targetId ?? ""),
      reason: String(req.body?.reason ?? ""),
      details: String(req.body?.details ?? "")
    });
    return res.status(201).json({ report });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to submit report" });
  }
});
