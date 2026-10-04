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
const AI_TOOLS = new Set([
  "NONE", "RESTORE", "RELIGHT", "SUPER_DETAIL", "COLORIZE", "AI_ART", "AI_EXPAND",
  "REMOVE_OBJECT", "BACKGROUND_REPLACE", "BACKGROUND_REMOVE", "FACE_REPAIR", "DENOISE", "SKY",
]);
const BACKGROUNDS = new Set(["ORIGINAL", "AI_BLUR", "REPLACE", "REMOVE", "STUDIO", "GREEN_SCREEN"]);
const PROVIDER_TERMINAL_FAILURES = new Set(["FAILED", "ERROR", "CANCELLED"]);
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

function providerStatusEndpoint(jobId: string) {
  const template = process.env.TWITOK_AI_MEDIA_STATUS_ENDPOINT;
  if (!template) return null;
  const encoded = encodeURIComponent(jobId);
  return safeUrl(template.replaceAll("{jobId}", encoded), []);
}

function normalizeProviderResponse(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>;
  const result = root.result && typeof root.result === "object" && !Array.isArray(root.result)
    ? root.result as Record<string, unknown>
    : null;
  const outputUrl = [root.outputUrl, root.output_url, root.url, result?.outputUrl, result?.output_url, result?.url]
    .find(value => typeof value === "string") ?? null;
  const jobId = [root.jobId, root.job_id, root.id, result?.jobId, result?.job_id, result?.id]
    .find(value => typeof value === "string") ?? null;
  const status = [root.status, result?.status]
    .find(value => typeof value === "string") ?? null;
  return { outputUrl, jobId, status };
}

function allowedHosts() {
  return (process.env.TWITOK_AI_MEDIA_ALLOWED_HOSTS ?? "")
    .split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
}

aiMediaRouter.get("/capabilities", requireUser, (_req, res) => {
  const configured = Boolean(safeUrl(process.env.TWITOK_AI_MEDIA_ENDPOINT, []) && process.env.TWITOK_AI_MEDIA_API_KEY);
  const configuredCapabilities = (process.env.TWITOK_AI_MEDIA_CAPABILITIES ?? "")
    .split(",").map(x => x.trim().toUpperCase()).filter(Boolean);
  const supports = (name: string) => configured && (
    configuredCapabilities.length === 0 || configuredCapabilities.includes(name)
  );

  return res.json({
    configured,
    providerBacked: configured,
    operations: {
      RESTORE: supports("RESTORE"),
      RELIGHT: supports("RELIGHT"),
      SUPER_DETAIL: supports("SUPER_DETAIL"),
      COLORIZE: supports("COLORIZE"),
      AI_ART: supports("AI_ART"),
      AI_EXPAND: supports("AI_EXPAND"),
      REMOVE_OBJECT: supports("REMOVE_OBJECT"),
      BACKGROUND_REPLACE: supports("BACKGROUND_REPLACE"),
      BACKGROUND_REMOVE: supports("BACKGROUND_REMOVE"),
      FACE_REPAIR: supports("FACE_REPAIR"),
      DENOISE: supports("DENOISE"),
      SKY: supports("SKY"),
    },
    backgrounds: {
      AI_BLUR: supports("AI_BLUR"),
      REPLACE: supports("BACKGROUND_REPLACE"),
      REMOVE: supports("BACKGROUND_REMOVE"),
      STUDIO: supports("STUDIO"),
      GREEN_SCREEN: supports("GREEN_SCREEN"),
    },
    faceFilters: Object.fromEntries(["SMOOTH","GLOW","MAKEUP","FACE_LIGHT","BEAUTY"].map(name => [name, supports(`FACE_FILTER_${name}`)])),
    qualityProfiles: Object.fromEntries(
      Object.keys(QUALITY_PROFILES).map(name => [name, supports(name)]),
    ),
    note: "Capabilities are provider-backed. The app must not present an unavailable operation as executable.",
  });
});

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
    if (!AI_TOOLS.has(aiTool)) return res.status(400).json({ error: "Invalid AI media tool" });
    if (!BACKGROUNDS.has(background)) return res.status(400).json({ error: "Invalid background operation" });
    if (aiTool === "BACKGROUND_REPLACE" && background !== "REPLACE") {
      return res.status(400).json({ error: "Background replacement requires REPLACE mode" });
    }
    if (aiTool === "BACKGROUND_REMOVE" && background !== "REMOVE") {
      return res.status(400).json({ error: "Background removal requires REMOVE mode" });
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
          operation: aiTool,
          backgroundOperation: background,
          relight: aiTool === "RELIGHT",
          objectRemoval: aiTool === "REMOVE_OBJECT",
          backgroundReplacement: aiTool === "BACKGROUND_REPLACE",
          backgroundRemoval: aiTool === "BACKGROUND_REMOVE",
          denoise: aiTool === "DENOISE",
          skyReplacement: aiTool === "SKY",
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
      const normalized = normalizeProviderResponse(json);\n      if (!normalized) throw new Error("provider invalid response");\n      provider = normalized;
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

  let outputUrl = safeUrl(job.outputUrl, allowedHosts());
  let status = outputUrl ? "READY" : String(job.status ?? "PROCESSING");

  if (!outputUrl && job.providerJobId) {
    const endpoint = providerStatusEndpoint(String(job.providerJobId));
    const apiKey = process.env.TWITOK_AI_MEDIA_API_KEY;
    if (endpoint && apiKey) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch(endpoint, {
          headers: { authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        });
        if (response.ok) {
          const json: unknown = await response.json();
          if (json && typeof json === "object" && !Array.isArray(json)) {
            const provider = json as Record<string, unknown>;
            const candidate = safeUrl(provider.outputUrl, allowedHosts());
            if (candidate) {
              outputUrl = candidate;
              status = "READY";
              await (await getDb()).collection("ai_media_jobs").updateOne(
                { _id: job._id, userId: req.userId },
                { $set: { outputUrl: candidate, status, updatedAt: new Date() } },
              );
            } else {
              const providerStatus = String(provider.status ?? "PROCESSING").toUpperCase();
              status = PROVIDER_TERMINAL_FAILURES.has(providerStatus) ? providerStatus : providerStatus;
              if (PROVIDER_TERMINAL_FAILURES.has(providerStatus)) {
                await (await getDb()).collection("ai_media_jobs").updateOne(
                  { _id: job._id, userId: req.userId },
                  { $set: { status, updatedAt: new Date() } },
                );
              }
            }
          }
        }
      } catch {
        // Preserve the last known state when the provider is temporarily unavailable.
      } finally {
        clearTimeout(timer);
      }
    }
  }

  return res.json({
    jobId: job.jobId,
    status,
    outputUrl,
    operation: job.aiTool ?? "NONE",
    background: job.background ?? "ORIGINAL",
    qualityProfile: job.qualityProfile ?? "ORIGINAL",
  });
});
