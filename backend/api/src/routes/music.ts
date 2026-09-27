import { Router } from "express";
import { getDb } from "../db/mongo";
import { requireUser } from "../auth/middleware";
import { attachSound, searchSounds } from "../music/service";

const router = Router();

router.get("/sounds", requireUser, async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const countryCode = typeof req.query.countryCode === "string" ? req.query.countryCode : undefined;
    const sounds = await searchSounds(getDb(), q, countryCode);
    res.json({ sounds });
  } catch {
    res.status(500).json({ error: "Unable to search sounds" });
  }
});

router.post("/videos/:videoId/sound", requireUser, async (req, res) => {
  try {
    const soundId = String(req.body?.soundId || "");
    const sound = await attachSound(getDb(), req.params.videoId, soundId);
    res.json({ sound });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "Unable to attach sound" });
  }
});

export default router;
