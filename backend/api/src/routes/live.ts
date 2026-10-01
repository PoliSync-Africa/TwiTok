import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/mongo.js";
import { createLiveStream, leaveLiveViewer, refreshLiveViewer, setLiveStatus } from "../live/service.js";
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
