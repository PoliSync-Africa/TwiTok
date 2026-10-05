import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/mongo.js";
import { createLiveStream, setLiveStatus, inviteLiveGuest, respondToLiveGuestInvite, removeLiveGuest } from "../live/service.js";
import { requireUser } from "../auth/middleware.js";
import { rateLimit } from "../security/rate-limit.js";
import { AccessToken } from "livekit-server-sdk";

export const liveRouter = Router();
const liveReadLimit = rateLimit({ windowMs: 60 * 1000, max: 120, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });
const liveActionLimit = rateLimit({ windowMs: 60 * 1000, max: 30, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });

liveRouter.get("/streams", requireUser, liveReadLimit, async (req, res) => {
  const db = await getDb();
  const status = typeof req.query.status === "string" ? req.query.status : "LIVE";
  const streams = await db.collection("live_streams")
    .find({ status }, { projection: { _id: 0 } })
    .sort({ startedAt: -1, createdAt: -1 })
    .limit(50)
    .toArray();
  return res.json({ streams });
});

liveRouter.get("/streams/:streamId/guests", requireUser, liveReadLimit, async (req, res) => {
  const db = await getDb();
  const streamId = String(req.params.streamId);
  const stream = await db.collection("live_streams").findOne({ streamId }, { projection: { hostUserId: 1 } });
  if (!stream) return res.status(404).json({ error: "LIVE stream not found" });
  const guests = await db.collection("live_guests").find({ streamId }, { projection: { _id: 0 } }).sort({ createdAt: 1 }).limit(15).toArray();
  return res.json({ guests, guestLimit: 15 });
});

liveRouter.post("/streams", requireUser, liveActionLimit, async (req, res) => {
  try {
    const { title, category, coverUrl } = req.body ?? {};
    if (typeof title !== "string" || !title.trim() || title.length > 150) return res.status(400).json({ error: "A valid LIVE title is required" });
    return res.status(201).json(await createLiveStream(await getDb(), {
      streamId: randomUUID(), hostUserId: req.userId!.toHexString(), title: title.trim(), category, coverUrl
    }));
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "LIVE creation failed" }); }
});

liveRouter.post("/streams/:streamId/token", requireUser, liveActionLimit, async (req, res) => {
  try {
    const db = await getDb();
    const streamId = String(req.params.streamId);
    const stream = await db.collection("live_streams").findOne({ streamId });
    if (!stream) return res.status(404).json({ error: "LIVE stream not found" });
    if (String(stream.hostUserId) !== req.userId!.toHexString()) return res.status(403).json({ error: "Only the host can publish this LIVE stream" });
    if (stream.status === "ENDED" || stream.status === "SUSPENDED") return res.status(409).json({ error: "This LIVE session is no longer available" });
    const serverUrl = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!serverUrl || !apiKey || !apiSecret) return res.status(503).json({ error: "LIVE transport is not configured yet" });

    const roomName = "twitok-live-" + streamId;
    const identity = "u-" + req.userId!.toHexString();
    const token = new AccessToken(apiKey, apiSecret, {
      identity,
      name: identity,
      ttl: "2h",
      metadata: JSON.stringify({ streamId, role: "host" })
    });
    token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: true });
    return res.status(201).json({ serverUrl, participantToken: await token.toJwt(), roomName, streamId });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to create LIVE transport token" });
  }
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

liveRouter.post("/streams/:streamId/guests", requireUser, liveActionLimit, async (req, res) => {
  try {
    const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
    if (!username || username.length > 24) return res.status(400).json({ error: "A valid guest username is required" });
    const db = await getDb();
    const guest = await db.collection("users").findOne({ username }, { projection: { _id: 1 } });
    if (!guest) return res.status(404).json({ error: "User not found" });
    const result = await inviteLiveGuest(db, { streamId: String(req.params.streamId), hostUserId: req.userId!.toHexString(), guestUserId: String(guest._id) });
    return res.status(201).json({ guest: result });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Guest invitation failed" }); }
});

liveRouter.post("/streams/:streamId/guests/respond", requireUser, liveActionLimit, async (req, res) => {
  try {
    const accept = req.body?.accept;
    if (typeof accept !== "boolean") return res.status(400).json({ error: "accept must be boolean" });
    const guest = await respondToLiveGuestInvite(await getDb(), { streamId: String(req.params.streamId), userId: req.userId!.toHexString(), accept });
    return res.json({ guest });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Guest response failed" }); }
});

liveRouter.delete("/streams/:streamId/guests/:guestUserId", requireUser, liveActionLimit, async (req, res) => {
  try {
    const guest = await removeLiveGuest(await getDb(), { streamId: String(req.params.streamId), hostUserId: req.userId!.toHexString(), guestUserId: String(req.params.guestUserId) });
    return res.json({ guest });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Guest removal failed" }); }
});
