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

router.get("/sounds/:soundId", requireUser, async (req, res) => {\n  try { res.json(await getSoundPage(getDb(), req.params.soundId)); }\n  catch (error: any) { res.status(404).json({ error: error?.message || "Sound not found" }); }\n});\n\nrouter.get("/videos/:videoId/sound", requireUser, async (req, res) => {\n  try {\n    const link = await getDb().collection("video_sounds").findOne({ videoId: new (await import("mongodb")).ObjectId(req.params.videoId) });\n    if (!link) return res.status(404).json({ error: "No sound attached" });\n    const sound = await getDb().collection("sounds").findOne({ _id: link.soundId, status: "ACTIVE" });\n    if (!sound) return res.status(404).json({ error: "Sound unavailable" });\n    res.json({ sound });\n  } catch { res.status(400).json({ error: "Unable to load video sound" }); }\n});\n\nrouter.post("/videos/:videoId/sound", requireUser, async (req, res) => {
  try {
    const soundId = String(req.body?.soundId || "");
    const sound = await attachSound(getDb(), req.userId!, req.params.videoId, soundId);
    res.json({ sound });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "Unable to attach sound" });
  }
});

export default router;
