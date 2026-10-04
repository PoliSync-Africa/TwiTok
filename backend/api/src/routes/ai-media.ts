import crypto from "node:crypto";
import { Router } from "express";
import { rateLimit as expressRateLimit } from "express-rate-limit";
import { requireUser } from "../auth/middleware.js";
import { getDb } from "../db/mongo.js";
import { createPresignedPlayback } from "../media/storage.js";

export const aiMediaRouter = Router();
aiMediaRouter.use(expressRateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false }));

const MODES = new Set(["IMAGE", "VIDEO"]);
const STYLES = new Set(["CLEAN", "CINEMATIC", "VIBRANT", "PORTRAIT_PRO", "REALISTIC"]);
const RESOLUTIONS = new Set(["ORIGINAL", "CLEAN", "HD", "4K", "8K", "12K_AI"]);
const QUALITY_PROFILES: Record<string, { targetResolution: string; enhanceLevel: number }> = {
  ORIGINAL: { targetResolution: "ORIGINAL", enhanceLevel: 0 },
  CLEAN: { targetResolution: "CLEAN", enhanceLevel: 1 },
  HD: { targetResolution: "HD", enhanceLevel: 2 },
  "4K": { targetResolution: "4K", enhanceLevel: 3 },
  "8K": { targetResolution: "8K", enhanceLevel: 4 },
  "12K_AI": { targetResolution: "12K_AI", enhanceLevel: 5 },
};

function safeUrl(value: unknown, hosts: string[]) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.hash) return null;
    if (hosts.length && !hosts.includes(url.hostname.toLowerCase())) return null;
    return url.toString();
  } catch {
    return null;
  }
}
function safeJobId(value: unknown) {
  if (typeof value !== "string" || value.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(value)) return null;
  return value;
}
function providerStatusEndpoint(jobId: string) {\n  const template = process.env.TWITOK_AI_MEDIA_STATUS_ENDPOINT;\n  if (!template) return null;\n  const encoded = encodeURIComponent(jobId);\n  return safeUrl(template.replaceAll("{jobId}", encoded), []);\n}\n\nfunction allowedHosts() {
  return (process.env.TWITOK_AI_MEDIA_ALLOWED_HOSTS ?? "")
    .split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
}

aiMediaRouter.post("/restyle", requireUser, async (req, res) => {
  try {
    const mode = String(req.body?.mode ?? "").toUpperCase();
    const style = String(req.body?.style ?? "CLEAN").toUpperCase();
    const targetResolution = String(req.body?.targetResolution ?? "12K_AI").toUpperCase();
    const prompt = String(req.body?.prompt ?? "").trim().slice(0, 1600);
    const qualityProfile = String(req.body?.qualityProfile ?? targetResolution).toUpperCase();
    const aiTool = String(req.body?.aiTool ?? "NONE").toUpperCase().slice(0, 64);
    const faceFilter = String(req.body?.faceFilter ?? "NONE").toUpperCase().slice(0, 64);
    const background = String(req.body?.background ?? "ORIGINAL").toUpperCase().slice(0, 64);
    const sourceObjectKey = String(req.body?.sourceObjectKey ?? "");

    if (!MODES.has(mode)) return res.status(400).json({ error: "Invalid AI media mode" });
    if (!STYLES.has(style)) return res.status(400).json({ error: "Invalid AI media style" });
    if (!RESOLUTIONS.has(targetResolution) || !QUALITY_PROFILES[qualityProfile] ||
        QUALITY_PROFILES[qualityProfile].targetResolution !== targetResolution) {
      return res.status(400).json({ error: "Invalid quality profile" });
    }
    const userPrefix = req.userId!.toHexString();
    if (!sourceObjectKey ||
        (!sourceObjectKey.startsWith(`videos/${userPrefix}/`) &&
         !sourceObjectKey.startsWith(`photos/${userPrefix}/`))) {
      return res.status(403).json({ error: "Source media is not owned by this account" });
    }

    const endpoint = safeUrl(process.env.TWITOK_AI_MEDIA_ENDPOINT, []);
    const apiKey = process.env.TWITOK_AI_MEDIA_API_KEY;
    if (!endpoint || !apiKey) {
      return res.status(503).json({
        error: "AI media generation is not configured yet",
        code: "AI_MEDIA_NOT_CONFIGURED",
      });
    }

    const sourceUrl = (await createPresignedPlayback(sourceObjectKey, 600)).url;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    let provider: Record<string, unknown>;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          mode,
          style,
          prompt,
          sourceUrl,
          targetResolution,
          qualityProfile,
          enhanceLevel: QUALITY_PROFILES[qualityProfile].enhanceLevel,
          aiTool,
          faceFilter,
          background,
          preserveSubject: true,
          preserveIdentity: true,
          enhanceQuality: true,
          autoPolish: true,
          naturalSkinTexture: true,
          outputSpec: req.body?.outputSpec && typeof req.body.outputSpec === "object"
            ? req.body.outputSpec
            : {},
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`provider HTTP ${response.status}`);
      const json: unknown = await response.json();
      if (!json || typeof json !== "object" || Array.isArray(json)) {
        throw new Error("provider invalid response");
      }
      provider = json as Record<string, unknown>;
    } finally {
      clearTimeout(timer);
    }

    const outputUrl = safeUrl(provider.outputUrl, allowedHosts());
    const providerJobId = safeJobId(provider.jobId);
    if (!outputUrl && !providerJobId) {
      return res.status(502).json({ error: "AI provider returned no valid output" });
    }

    const jobId = crypto.randomUUID();
    await (await getDb()).collection("ai_media_jobs").insertOne({
      jobId,
      userId: req.userId!,
      mode,
      style,
      targetResolution,
      qualityProfile,
      aiTool,
      faceFilter,
      background,
      prompt,
      sourceObjectKey,
      providerJobId,
      outputUrl,
      status: outputUrl ? "READY" : "PROCESSING",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return res.status(202).json({
      jobId,
      status: outputUrl ? "READY" : "PROCESSING",
      outputUrl: outputUrl ?? null,
    });
  } catch (error) {
    console.error("AI media generation failed", error);
    return res.status(400).json({
      error: "Unable to start AI media generation",
      code: "AI_MEDIA_REQUEST_FAILED",
    });
  }
});

aiMediaRouter.get("/jobs/:jobId", requireUser, async (req, res) => {
  const job = await (await getDb()).collection("ai_media_jobs")
    .findOne({ jobId: String(req.params.jobId), userId: req.userId });
  if (!job) return res.status(404).json({ error: "AI media job not found" });
  const outputUrl = safeUrl(job.outputUrl, allowedHosts());
  return res.json({
    jobId: job.jobId,
    status: outputUrl ? "READY" : String(job.status ?? "PROCESSING"),
    outputUrl,
  });
});
