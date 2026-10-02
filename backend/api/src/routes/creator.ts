import { Router } from "express";
import { getDb } from "../db/mongo.js";
import { getCreatorStudio, upsertCreatorProfile } from "../creator/studio.js";
import { requireUser } from "../auth/middleware.js";
import { rateLimit } from "../security/rate-limit.js";

export const creatorRouter = Router();
const creatorReadLimit = rateLimit({ windowMs: 60 * 1000, max: 60, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });
const creatorWriteLimit = rateLimit({ windowMs: 60 * 1000, max: 30, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });

async function studioHandler(req: any, res: any) {
  try { return res.json(await getCreatorStudio(await getDb(), req.userId!.toHexString())); }
  catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Creator Studio failed" }); }
}
creatorRouter.get("/studio/me", requireUser, creatorReadLimit, studioHandler);
creatorRouter.get("/studio/:userId", requireUser, creatorReadLimit, async (req, res) => {
  if (req.params.userId !== req.userId!.toHexString()) return res.status(403).json({ error: "You can only access your own Creator Studio" });
  return studioHandler(req, res);
});
/* legacy authenticated route */
creatorRouter.put("/profile/me", requireUser, creatorWriteLimit, async (req, res) => {
  try { return res.json(await upsertCreatorProfile(await getDb(), req.userId!.toHexString(), req.body ?? {})); }
  catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Creator profile update failed" }); }
});
creatorRouter.put("/profile/:userId", requireUser, creatorWriteLimit, async (req, res) => {
  if (req.params.userId !== req.userId!.toHexString()) return res.status(403).json({ error: "You can only update your own creator profile" });
  try { return res.json(await upsertCreatorProfile(await getDb(), req.userId!.toHexString(), req.body ?? {})); }
  catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Creator profile update failed" }); }
});
