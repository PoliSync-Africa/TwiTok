import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/mongo.js";
import { addLiveComment, addLiveModerator, createLiveStream, getLiveGiftLeaderboard, getLiveReactionSummary, inviteLiveGuest, listLiveGuests, leaveLiveGuest, leaveLiveViewer, refreshLiveViewer, removeLiveReaction, removeLiveBlock, removeLiveModerator, reportLiveUser, setLiveBlock, setLiveMute, setLiveStatus, setLiveReaction } from "../live/service.js";
import { sendGift } from "../money/gifts.js";
import { broadcastToUser } from "../realtime/ws.js";
import { requireUser } from "../auth/middleware.js";
import { rateLimit } from "../security/rate-limit.js";

export const liveRouter = Router();
const liveActionLimit = rateLimit({ windowMs: 60 * 1000, max: 20, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });

liveRouter.post("/streams", requireUser, liveActionLimit, async (req, res) => {
  try {
    const { title, category, coverUrl } = req.body ?? {};
    if (typeof title !== "string" || !title.trim() || title.length > 150) return res.status(400).json({ error: "A valid LIVE title is required" });
    return res.status(201).json(await createLiveStream(await getDb(), {
      streamId: randomUUID(), hostUserId: req.userId!.toHexString(), title: title.trim(), category, coverUrl
    }));
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "LIVE creation failed" }); }
});

liveRouter.post("/streams/:streamId/status", requireUser, liveActionLimit, async (req, res) => {
  try {
    const db = await getDb(), streamId = String(req.params.streamId);
    const stream = await db.collection("live_streams").findOne({ streamId }, { projection: { hostUserId: 1 } });
    if (!stream) return res.status(404).json({ error: "LIVE stream not found" });
    if (String(stream.hostUserId) !== req.userId!.toHexString()) return res.status(403).json({ error: "Only the host can change this stream status" });
    const status = req.body?.status;
    if (!["LIVE","ENDED"].includes(status)) return res.status(400).json({ error: "Hosts may only start or end their LIVE stream" });
    return res.json(await setLiveStatus(db, streamId, status));
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "LIVE status update failed" }); }
});

liveRouter.get("/streams", async (req, res) => {
  try {
    const db = await getDb();
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
    const streams = await db.collection("live_streams").find(
      { status: "LIVE" },
      { projection: { _id: 0, streamId: 1, hostUserId: 1, title: 1, category: 1, coverUrl: 1, viewerCount: 1, startedAt: 1 } }
    ).sort({ viewerCount: -1, startedAt: -1 }).limit(limit).toArray();
    return res.json({ streams });
  } catch { return res.status(500).json({ error: "Unable to load LIVE streams" }); }
});

liveRouter.get("/streams/:streamId", async (req, res) => {
  try {
    const stream = await (await getDb()).collection("live_streams").findOne(
      { streamId: String(req.params.streamId), status: { $in: ["SCHEDULED", "LIVE"] } },
      { projection: { _id: 0, streamId: 1, hostUserId: 1, title: 1, category: 1, coverUrl: 1, status: 1, viewerCount: 1, startedAt: 1, createdAt: 1 } }
    );
    if (!stream) return res.status(404).json({ error: "LIVE stream not found" });
    return res.json({ stream });
  } catch { return res.status(400).json({ error: "Unable to load LIVE stream" }); }
});

liveRouter.post("/streams/:streamId/viewer/heartbeat", requireUser, liveActionLimit, async (req, res) => {
  try {
    const result = await refreshLiveViewer(await getDb(), String(req.params.streamId), req.userId!.toHexString());
    if (!result) return res.status(404).json({ error: "LIVE stream is not active" });
    return res.json(result);
  } catch { return res.status(400).json({ error: "Unable to update LIVE viewer presence" }); }
});

liveRouter.delete("/streams/:streamId/viewer", requireUser, liveActionLimit, async (req, res) => {
  try {
    return res.json(await leaveLiveViewer(await getDb(), String(req.params.streamId), req.userId!.toHexString()));
  } catch { return res.status(400).json({ error: "Unable to leave LIVE stream" }); }
});


liveRouter.get("/streams/:streamId/comments", async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const comments = await (await getDb()).collection("live_comments").find(
      { streamId: String(req.params.streamId) },
      { projection: { _id: 0, commentId: 1, streamId: 1, userId: 1, text: 1, createdAt: 1 } }
    ).sort({ createdAt: -1 }).limit(limit).toArray();
    return res.json({ comments: comments.reverse() });
  } catch { return res.status(500).json({ error: "Unable to load LIVE comments" }); }
});

liveRouter.post("/streams/:streamId/comments", requireUser, liveActionLimit, async (req, res) => {
  try {
    const comment = await addLiveComment(await getDb(), String(req.params.streamId), req.userId!.toHexString(), String(req.body?.text ?? ""));
    if (!comment) return res.status(404).json({ error: "LIVE stream is not active" });
    return res.status(201).json({ comment });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to post LIVE comment" }); }
});

liveRouter.post("/streams/:streamId/reaction", requireUser, liveActionLimit, async (req, res) => {
  try {
    const reaction = await setLiveReaction(await getDb(), String(req.params.streamId), req.userId!.toHexString(), String(req.body?.reaction ?? ""));
    if (!reaction) return res.status(404).json({ error: "LIVE stream is not active" });
    return res.json(reaction);
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to send LIVE reaction" }); }
});

liveRouter.post("/streams/:streamId/gifts", requireUser, liveActionLimit, async (req, res) => {
  try {
    const db = await getDb();
    const streamId = String(req.params.streamId);
    const stream = await db.collection("live_streams").findOne({ streamId, status: "LIVE" }, { projection: { hostUserId: 1 } });
    if (!stream) return res.status(404).json({ error: "LIVE stream is not active" });
    const receiverId = String(stream.hostUserId);
    const giftId = String(req.body?.giftId ?? "").trim();
    const quantity = Number(req.body?.quantity ?? 1);
    const idempotencyKey = String(req.header("Idempotency-Key") ?? "").trim();
    if (!giftId || !idempotencyKey) return res.status(400).json({ error: "giftId and Idempotency-Key are required" });

    const result = await sendGift(db, {
      senderId: req.userId!.toHexString(),
      receiverId,
      giftId,
      quantity,
      context: "LIVE",
      idempotencyKey
    });

    if (!result.duplicate) {
      const now = new Date();
      await db.collection("live_streams").updateOne(
        { streamId, status: "LIVE" },
        { $inc: { giftsUsd: Number(result.creatorEarningsUsd ?? 0) }, $set: { updatedAt: now } }
      );
      await db.collection("live_gift_events").insertOne({
        transactionId: result.transactionId,
        streamId,
        senderId: req.userId!.toHexString(),
        receiverId,
        giftId,
        quantity: result.quantity,
        coinsSpent: result.coinsSpent,
        creatorEarningsUsd: result.creatorEarningsUsd,
        createdAt: now
      });
      broadcastToUser(receiverId, {
        type: "live.gift.received",
        streamId,
        transactionId: result.transactionId,
        giftId,
        quantity: result.quantity,
        coinsSpent: result.coinsSpent,
        animation: result.gift?.animation ?? giftId
      });
    }

    return res.status(201).json({ ...result, streamId });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "LIVE Gift failed" });
  }
});

liveRouter.get("/streams/:streamId/gifts", async (req, res) => {
  try {
    const db = await getDb();
    const streamId = String(req.params.streamId);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const gifts = await db.collection("live_gift_events").find(
      { streamId },
      { projection: { _id: 0, transactionId: 1, senderId: 1, receiverId: 1, giftId: 1, quantity: 1, coinsSpent: 1, creatorEarningsUsd: 1, createdAt: 1 } }
    ).sort({ createdAt: -1 }).limit(limit).toArray();
    const summary = await db.collection("live_gift_events").aggregate([
      { $match: { streamId } },
      { $group: { _id: null, gifts: { $sum: 1 }, coinsSpent: { $sum: "$coinsSpent" }, creatorEarningsUsd: { $sum: "$creatorEarningsUsd" } } }
    ]).toArray();
    return res.json({ gifts, summary: summary[0] ? { gifts: Number(summary[0].gifts), coinsSpent: Number(summary[0].coinsSpent), creatorEarningsUsd: Number(summary[0].creatorEarningsUsd) } : { gifts: 0, coinsSpent: 0, creatorEarningsUsd: 0 } });
  } catch { return res.status(500).json({ error: "Unable to load LIVE gifts" }); }
});

liveRouter.get("/streams/:streamId/gifts/leaderboard", async (req, res) => {
  try {
    const db = await getDb();
    const streamId = String(req.params.streamId);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
    const stream = await db.collection("live_streams").findOne(
      { streamId, status: { $in: ["LIVE", "ENDED"] } },
      { projection: { _id: 0, streamId: 1, hostUserId: 1 } }
    );
    if (!stream) return res.status(404).json({ error: "LIVE stream not found" });
    const leaderboard = await getLiveGiftLeaderboard(db, streamId, limit);
    return res.json({ streamId, leaderboard });
  } catch {
    return res.status(500).json({ error: "Unable to load LIVE gift leaderboard" });
  }
});

liveRouter.get("/streams/:streamId/reactions", async (req, res) => {
  try {
    const reactions = await getLiveReactionSummary(await getDb(), String(req.params.streamId));
    return res.json({ reactions });
  } catch { return res.status(500).json({ error: "Unable to load LIVE reactions" }); }
});

liveRouter.delete("/streams/:streamId/reaction", requireUser, liveActionLimit, async (req, res) => {
  try { return res.json(await removeLiveReaction(await getDb(), String(req.params.streamId), req.userId!.toHexString())); }
  catch { return res.status(400).json({ error: "Unable to remove LIVE reaction" }); }
});


liveRouter.get("/streams/:streamId/guests", async (req, res) => {
  try {
    const streamId = String(req.params.streamId);
    const db = await getDb();
    const stream = await db.collection("live_streams").findOne(
      { streamId, status: { $in: ["LIVE", "ENDED"] } },
      { projection: { _id: 0, streamId: 1 } }
    );
    if (!stream) return res.status(404).json({ error: "LIVE stream not found" });
    return res.json({ guests: await listLiveGuests(db, streamId) });
  } catch {
    return res.status(500).json({ error: "Unable to load LIVE guests" });
  }
});

liveRouter.post("/streams/:streamId/guests/invite", requireUser, liveActionLimit, async (req, res) => {
  try {
    const streamId = String(req.params.streamId);
    const userId = String(req.body?.userId ?? "").trim();
    if (!userId) return res.status(400).json({ error: "userId is required" });
    const db = await getDb();
    const guest = await inviteLiveGuest(db, streamId, req.userId!.toHexString(), userId);
    broadcastToUser(userId, { type: "live.guest.invited", streamId, hostUserId: req.userId!.toHexString() });
    return res.status(201).json({ guest });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to invite LIVE guest" });
  }
});

liveRouter.post("/streams/:streamId/guests/respond", requireUser, liveActionLimit, async (req, res) => {
  try {
    const response = String(req.body?.response ?? "").toUpperCase();
    if (response !== "ACCEPT" && response !== "DECLINE") return res.status(400).json({ error: "response must be ACCEPT or DECLINE" });
    const db = await getDb();
    const result = await respondLiveGuestInvite(db, String(req.params.streamId), req.userId!.toHexString(), response);
    const invite = await db.collection("live_guests").findOne({ streamId: String(req.params.streamId), userId: req.userId!.toHexString() }, { projection: { hostUserId: 1 } });
    if (invite?.hostUserId) broadcastToUser(String(invite.hostUserId), { type: "live.guest.response", streamId: String(req.params.streamId), userId: req.userId!.toHexString(), status: result.status });
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to respond to LIVE guest invitation" });
  }
});

liveRouter.delete("/streams/:streamId/guests/:userId", requireUser, liveActionLimit, async (req, res) => {
  try {
    const streamId = String(req.params.streamId);
    const targetUserId = String(req.params.userId);
    const db = await getDb();
    const result = await leaveLiveGuest(db, streamId, req.userId!.toHexString(), targetUserId);
    const target = await db.collection("live_guests").findOne({ streamId, userId: targetUserId }, { projection: { hostUserId: 1 } });
    if (target?.hostUserId) broadcastToUser(String(target.hostUserId), { type: "live.guest.left", streamId, userId: targetUserId });
    if (targetUserId !== req.userId!.toHexString()) broadcastToUser(targetUserId, { type: "live.guest.removed", streamId });
    return res.json(result);
  } catch (error) {
    return res.status(403).json({ error: error instanceof Error ? error.message : "Unable to remove LIVE guest" });
  }
});

liveRouter.post("/streams/:streamId/moderators", requireUser, liveActionLimit, async (req, res) => {
  try {
    const userId = String(req.body?.userId ?? "").trim();
    if (!userId) return res.status(400).json({ error: "userId is required" });
    return res.status(201).json(await addLiveModerator(await getDb(), String(req.params.streamId), req.userId!.toHexString(), userId));
  } catch (error) { return res.status(403).json({ error: error instanceof Error ? error.message : "Unable to add LIVE moderator" }); }
});

liveRouter.delete("/streams/:streamId/moderators/:userId", requireUser, liveActionLimit, async (req, res) => {
  try { return res.json(await removeLiveModerator(await getDb(), String(req.params.streamId), req.userId!.toHexString(), String(req.params.userId))); }
  catch (error) { return res.status(403).json({ error: error instanceof Error ? error.message : "Unable to remove LIVE moderator" }); }
});

liveRouter.post("/streams/:streamId/mute", requireUser, liveActionLimit, async (req, res) => {
  try {
    return res.json(await setLiveMute(await getDb(), String(req.params.streamId), req.userId!.toHexString(), String(req.body?.userId ?? ""), Number(req.body?.durationSeconds ?? 300)));
  } catch (error) { return res.status(403).json({ error: error instanceof Error ? error.message : "Unable to mute LIVE viewer" }); }
});

liveRouter.post("/streams/:streamId/block", requireUser, liveActionLimit, async (req, res) => {
  try {
    return res.json(await setLiveBlock(await getDb(), String(req.params.streamId), req.userId!.toHexString(), String(req.body?.userId ?? "")));
  } catch (error) { return res.status(403).json({ error: error instanceof Error ? error.message : "Unable to block LIVE viewer" }); }
});

liveRouter.delete("/streams/:streamId/block/:userId", requireUser, liveActionLimit, async (req, res) => {
  try { return res.json(await removeLiveBlock(await getDb(), String(req.params.streamId), req.userId!.toHexString(), String(req.params.userId))); }
  catch (error) { return res.status(403).json({ error: error instanceof Error ? error.message : "Unable to unblock LIVE viewer" }); }
});

liveRouter.post("/streams/:streamId/reports", requireUser, liveActionLimit, async (req, res) => {
  try {
    return res.status(201).json(await reportLiveUser(await getDb(), String(req.params.streamId), req.userId!.toHexString(), String(req.body?.userId ?? ""), String(req.body?.reason ?? "")));
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to submit LIVE report" }); }
});
