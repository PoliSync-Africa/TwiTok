import crypto from "node:crypto";
import { Router } from "express";
import { requireUser } from "../auth/middleware.js";
import { getDb } from "../db/mongo.js";
import { createPresignedPlayback } from "../media/storage.js";
import { rateLimit } from "../security/rate-limit.js";

export const aiMediaRouter = Router();

function portraitRequested(prompt: string) { return /portrait|skin|face|headshot|outfit|beauty/i.test(prompt); }

const ALLOWED_MODES = new Set(["IMAGE", "VIDEO"]);
const ALLOWED_STYLES = new Set(["CLEAN", "CINEMATIC", "VIBRANT", "PORTRAIT", "PORTRAIT_PRO", "ANIME", "ILLUSTRATION", "REALISTIC"]);

aiMediaRouter.get("/status", rateLimit({ windowMs: 60 * 1000, max: 120, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" }), requireUser, (_req, res) => {
  res.json({ configured: Boolean(process.env.TWITOK_AI_MEDIA_ENDPOINT && process.env.TWITOK_AI_MEDIA_API_KEY) });
});

aiMediaRouter.post("/restyle", rateLimit({ windowMs: 60 * 60 * 1000, max: 10, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" }), requireUser, async (req, res) => {
  try {
    const mode = String(req.body?.mode ?? "").toUpperCase();
    const style = String(req.body?.style ?? "CLEAN").toUpperCase();
    const prompt = String(req.body?.prompt ?? "").trim().slice(0, 1200);
    const requestedResolution = String(req.body?.targetResolution ?? "SOURCE_MAX").toUpperCase();
    const targetResolution = new Set(["SOURCE_MAX", "4K", "8K", "48K_AI"]).has(requestedResolution) ? requestedResolution : "SOURCE_MAX";
    const portraitEnhance = style === "PORTRAIT" || style === "PORTRAIT_PRO" || portraitRequested(prompt);
    const outputSpec = targetResolution === "4K" ? { width: 3840, height: 2160, maxDimension: 3840 } : targetResolution === "8K" ? { width: 7680, height: 4320, maxDimension: 7680 } : targetResolution === "48K_AI" ? { width: 46080, height: 25920, maxDimension: 46080 } : { width: null, height: null, maxDimension: 4096 };
    const sourceObjectKey = req.body?.sourceObjectKey ? String(req.body.sourceObjectKey) : null;

    if (!ALLOWED_MODES.has(mode)) return res.status(400).json({ error: "mode must be IMAGE or VIDEO" });
    if (!ALLOWED_STYLES.has(style)) return res.status(400).json({ error: "Unsupported AI style" });
    if (!prompt && !sourceObjectKey) return res.status(400).json({ error: "Provide a prompt or source media" });

    let sourceUrl: string | null = null;
    if (sourceObjectKey) {
      const allowedPrefixes = [
        `videos/${req.userId!.toHexString()}/`,
        `photos/${req.userId!.toHexString()}/`
      ];
      if (!allowedPrefixes.some(prefix => sourceObjectKey.startsWith(prefix))) return res.status(403).json({ error: "Source media is not owned by this account" });
      sourceUrl = (await createPresignedPlayback(sourceObjectKey, 600)).url;
    }

    const endpoint = process.env.TWITOK_AI_MEDIA_ENDPOINT;
    const apiKey = process.env.TWITOK_AI_MEDIA_API_KEY;
    if (!endpoint || !apiKey) {
      return res.status(503).json({ error: "AI media generation is not configured yet", code: "AI_MEDIA_NOT_CONFIGURED" });
    }

    const providerResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        mode,
        style,
        prompt,
        sourceUrl,
        preserveSubject: true,
        enhanceQuality: true,
        autoPolish: true,
        portraitEnhance,
        preserveNaturalSkinTexture: true,
        targetResolution,
        outputSpec
      })
    });
    if (!providerResponse.ok) throw new Error(`AI provider returned HTTP ${providerResponse.status}`);
    const provider = await providerResponse.json() as { outputUrl?: string; jobId?: string; status?: string };
    if (!provider.outputUrl && !provider.jobId) throw new Error("AI provider returned no output or job id");

    const db = await getDb();
    const jobId = crypto.randomUUID();
    await db.collection("ai_media_jobs").insertOne({
      jobId, userId: req.userId, mode, style, prompt: prompt || null,
      sourceObjectKey, providerJobId: provider.jobId ?? null,
      targetResolution, outputSpec, portraitEnhance,
      outputUrl: provider.outputUrl ?? null,
      status: provider.outputUrl ? "READY_FOR_REVIEW" : String(provider.status ?? "PROCESSING").toUpperCase(),
      createdAt: new Date(), updatedAt: new Date()
    });

    res.status(202).json({ jobId, status: provider.outputUrl ? "READY_FOR_REVIEW" : "PROCESSING", outputUrl: provider.outputUrl ?? null });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Unable to start AI media generation" });
  }
});

aiMediaRouter.get("/jobs/:jobId", rateLimit({ windowMs: 60 * 1000, max: 120, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" }), requireUser, async (req, res) => {
  const db = await getDb();
  const job = await db.collection("ai_media_jobs").findOne({ jobId: String(req.params.jobId), userId: req.userId });
  if (!job) return res.status(404).json({ error: "AI media job not found" });
  res.json({
    jobId: job.jobId, mode: job.mode, style: job.style, status: job.status,
    outputUrl: job.outputUrl ?? null, targetResolution: job.targetResolution ?? "SOURCE_MAX", outputSpec: job.outputSpec ?? null, portraitEnhance: Boolean(job.portraitEnhance), createdAt: job.createdAt, updatedAt: job.updatedAt
  });
});
