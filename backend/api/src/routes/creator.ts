import { Router } from "express";
import { getDb } from "../db/mongo.js";
import { getCreatorStudio, upsertCreatorProfile } from "../creator/studio.js";
import { requireUser } from "../auth/middleware.js";

export const creatorRouter = Router();

creatorRouter.get("/studio/me", requireUser, async (req, res) => {
  try { return res.json(await getCreatorStudio(await getDb(), req.userId!.toHexString())); }
  catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Creator Studio failed" }); }
});

creatorRouter.put("/profile/me", requireUser, async (req, res) => {
  try { return res.json(await upsertCreatorProfile(await getDb(), req.userId!.toHexString(), req.body ?? {})); }
  catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Creator profile update failed" }); }
});