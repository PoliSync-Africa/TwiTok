import { Router } from "express";
import { getDb } from "../db/mongo";
import { requireUser } from "../auth/middleware";
import { attachSound, searchSounds, getSoundPage } from "../music/service";

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

router.get("/sounds/:soundId", requireUser, async (req, res) => {
  try { res.json(await getSoundPage(getDb(), req.params.soundId)); }
  catch (error: any) { res.status(404).json({ error: error?.message || "Sound not found" }); }
});

router.get("/videos/:videoId/sound", requireUser, async (req, res) => {
  try {
    const link = await getDb().collection("video_sounds").findOne({ videoId: new (await import("mongodb")).ObjectId(req.params.videoId) });
    if (!link) return res.status(404).json({ error: "No sound attached" });
    const sound = await getDb().collection("sounds").findOne({ _id: link.soundId, status: "ACTIVE" });
    if (!sound) return res.status(404).json({ error: "Sound unavailable" });
    res.json({ sound });
  } catch { res.status(400).json({ error: "Unable to load video sound" }); }
});

router.post("/videos/:videoId/sound", requireUser, async (req, res) => {
  try {
    const soundId = String(req.body?.soundId || "");
    const sound = await attachSound(getDb(), req.userId!, req.params.videoId, soundId);
    res.json({ sound });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "Unable to attach sound" });
  }
});

export default router;
