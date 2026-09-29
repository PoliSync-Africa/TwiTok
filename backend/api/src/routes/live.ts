import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/mongo.js";
import { createLiveStream, setLiveStatus } from "../live/service.js";
import { requireUser } from "../auth/middleware.js";

export const liveRouter = Router();

liveRouter.post("/streams", requireUser, async (req, res) => {
  try {
    const { title, category, coverUrl } = req.body ?? {};
    if (typeof title !== "string" || !title.trim() || title.length > 150) return res.status(400).json({ error: "A valid LIVE title is required" });
    return res.status(201).json(await createLiveStream(await getDb(), {
      streamId: randomUUID(), hostUserId: req.userId!.toHexString(), title: title.trim(), category, coverUrl
    }));
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "LIVE creation failed" }); }
});

liveRouter.post("/streams/:streamId/status", requireUser, async (req, res) => {
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