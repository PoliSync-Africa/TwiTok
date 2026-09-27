import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/mongo.js";
import { createLiveStream, setLiveStatus } from "../live/service.js";

export const liveRouter = Router();

liveRouter.post("/streams", async (req, res) => {
  try {
    const { hostUserId, title, category, coverUrl } = req.body ?? {};
    if (!hostUserId || !title) return res.status(400).json({ error: "hostUserId and title are required" });
    return res.status(201).json(await createLiveStream(await getDb(), { streamId: randomUUID(), hostUserId, title, category, coverUrl }));
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "LIVE creation failed" });
  }
});

liveRouter.post("/streams/:streamId/status", async (req, res) => {
  try {
    const status = req.body?.status;
    if (!["LIVE","ENDED","SUSPENDED"].includes(status)) return res.status(400).json({ error: "Invalid LIVE status" });
    return res.json(await setLiveStatus(await getDb(), req.params.streamId, status));
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "LIVE status update failed" });
  }
});