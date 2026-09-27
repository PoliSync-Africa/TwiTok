import { Router } from "express";
import { getDb } from "../db/mongo.js";
import { getCreatorStudio, upsertCreatorProfile } from "../creator/studio.js";

export const creatorRouter = Router();

creatorRouter.get("/studio/:userId", async (req, res) => {
  try {
    return res.json(await getCreatorStudio(await getDb(), String(req.params.userId)));
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Creator Studio failed" });
  }
});

creatorRouter.put("/profile/:userId", async (req, res) => {
  try {
    return res.json(await upsertCreatorProfile(await getDb(), String(req.params.userId), req.body ?? {}));
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Creator profile update failed" });
  }
});