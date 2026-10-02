import crypto from "node:crypto";
import { Router } from "express";
import { rateLimit as expressRateLimit } from "express-rate-limit";
import { requireUser } from "../auth/middleware.js";
import { getDb } from "../db/mongo.js";
import { createPresignedPlayback } from "../media/storage.js";
import { rateLimit } from "../security/rate-limit.js";

export const aiMediaRouter = Router();
const routeRateLimit = expressRateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });
aiMediaRouter.use(routeRateLimit);

function portraitRequested(prompt: string) { return /portrait|skin|face|headshot|outfit|beauty/i.test(prompt); }

const ALLOWED_MODES = new Set(["IMAGE", "VIDEO"]);
const ALLOWED_STYLES = new Set(["CLEAN", "CINEMATIC", "VIBRANT", "PORTRAIT", "PORTRAIT_PRO", "ANIME", "ILLUSTRATION", "REALISTIC"]);

async function readProviderJson(response: Response, maxBytes = 64 * 1024): Promise<Record<string, unknown>> {
  const declaredLength = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error("AI provider response is too large");
  if (!response.body) throw new Error("AI provider returned an empty response");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("AI provider response is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString("utf8");
  const parsed: unknown = JSON.parse(body);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("AI provider returned an invalid response");
  return parsed as Record<string, unknown>;
}

function normalizeProviderJobId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) return null;
  for (const char of normalized) {
    const code = char.charCodeAt(0);
    const safe = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || char === "." || char === "_" || char === ":" || char === "-";
    if (!safe) return null;
  }
  return normalized;
}

function safeAiMediaError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/not configured/i.test(message)) return { error: "AI media generation is not configured yet", code: "AI_MEDIA_NOT_CONFIGURED" };
  if (/source media is not owned/i.test(message)) return { error: "Source media is not owned by this account", code: "AI_MEDIA_SOURCE_FORBIDDEN" };
  if (/provider response|provider returned|provider is too large|invalid response|no valid output|response is too large|empty response/i.test(message)) {
    return { error: "AI media provider returned an invalid response", code: "AI_MEDIA_PROVIDER_INVALID" };
  }
  return { error: "Unable to start AI media generation", code: "AI_MEDIA_REQUEST_FAILED" };
}

function normalizeProviderStatus(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toUpperCase();
  if (!normalized || normalized.length > 40) return fallback;
  for (const char of normalized) {
    const code = char.charCodeAt(0);
    const safe = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || char === "_" || char === "-";
    if (!safe) return fallback;
  }
  return normalized;
}

function sanitizeAiMediaJob(job: Record<string, unknown>) {
  const safeOutputUrl = validateProviderOutputUrl(job.outputUrl);
  const status = normalizeProviderStatus(job.status, "PROCESSING");
  return {
    jobId: typeof job.jobId === "string" ? job.jobId : "",
    mode: typeof job.mode === "string" ? job.mode : "IMAGE",
    style: typeof job.style === "string" ? job.style : "CLEAN",
    status: safeOutputUrl ? "READY_FOR_REVIEW" : status,
    outputUrl: safeOutputUrl,
    targetResolution: typeof job.targetResolution === "string" ? job.targetResolution : "SOURCE_MAX",
    outputSpec: job.outputSpec && typeof job.outputSpec === "object" ? job.outputSpec : null,
    portraitEnhance: Boolean(job.portraitEnhance),
    createdAt: job.createdAt instanceof Date ? job.createdAt : null,
    updatedAt: job.updatedAt instanceof Date ? job.updatedAt : null
  };
}

function validateProviderEndpoint(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.hash) return null;
    const allowedHosts = (process.env.TWITOK_AI_MEDIA_ALLOWED_HOSTS ?? "")
      .split(",")
      .map(host => host.trim().toLowerCase())
      .filter(Boolean);
    if (allowedHosts.length > 0 && !allowedHosts.includes(url.hostname.toLowerCase())) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function validateProviderOutputUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > 2048) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;

    const allowedHosts = (process.env.TWITOK_AI_MEDIA_ALLOWED_HOSTS ?? "")
      .split(",")
      .map(host => host.trim().toLowerCase())
      .filter(Boolean);
    if (allowedHosts.length > 0 && !allowedHosts.includes(url.hostname.toLowerCase())) return null;

    return url.toString();
  } catch {
    return null;
  }
}

aiMediaRouter.get("/status", rateLimit({ windowMs: 60 * 1000, max: 120, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" }), requireUser, (_req, res) => {
  res.json({
    configured: Boolean(process.env.TWITOK_AI_MEDIA_ENDPOINT && process.env.TWITOK_AI_MEDIA_API_KEY),
    statusPollingConfigured: Boolean(process.env.TWITOK_AI_MEDIA_STATUS_ENDPOINT && process.env.TWITOK_AI_MEDIA_API_KEY)
  });
});

aiMediaRouter.post("/restyle", rateLimit({ windowMs: 60 * 60 * 1000, max: 10, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" }), requireUser, async (req, res) => {
  try {
    const mode = String(req.body?.mode ?? "").toUpperCase();
    const style = String(req.body?.style ?? "CLEAN").toUpperCase();
    const prompt = String(req.body?.prompt ?? "").trim().slice(0, 1200);
    const requestedResolution = String(req.body?.targetResolution ?? "SOURCE_MAX").toUpperCase();
    const targetResolution = new Set(["SOURCE_MAX", "4K", "8K", "48K_AI"]).has(requestedResolution) ? requestedResolution : "SOURCE_MAX";
    const portraitEnhance = style === "PORTRAIT" || style === "PORTRAIT_PRO" || portraitRequested(prompt);
    const outputSpec = targetResolution === "4K"
      ? { width: 3840, height: 2160, maxDimension: 3840 }
      : targetResolution === "8K"
        ? { width: 7680, height: 4320, maxDimension: 7680 }
        : targetResolution === "48K_AI"
          ? { width: 46080, height: 25920, maxDimension: 46080 }
          : { width: null, height: null, maxDimension: 4096 };
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

    const endpoint = validateProviderEndpoint(process.env.TWITOK_AI_MEDIA_ENDPOINT);
    const apiKey = process.env.TWITOK_AI_MEDIA_API_KEY;
    if (!endpoint || !apiKey) {
      return res.status(503).json({ error: "AI media generation is not configured yet", code: "AI_MEDIA_NOT_CONFIGURED" });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let providerResponse: Response;
    try {
      providerResponse = await fetch(endpoint, {
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
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!providerResponse.ok) throw new Error(`AI provider returned HTTP ${providerResponse.status}`);
    const provider = await readProviderJson(providerResponse);
    const providerOutputUrl = validateProviderOutputUrl(provider.outputUrl);
    const providerJobId = normalizeProviderJobId(provider.jobId);
    if (!providerOutputUrl && !providerJobId) throw new Error("AI provider returned no valid output URL or job id");
    const providerStatus = normalizeProviderStatus(provider.status, "PROCESSING");

    const db = await getDb();
    const activeJobs = await db.collection("ai_media_jobs").countDocuments({
      userId: req.userId,
      status: { $in: ["QUEUED", "PROCESSING"] }
    });
    if (activeJobs >= 3) {
      return res.status(429).json({
        error: "Too many AI media jobs are already processing",
        code: "AI_MEDIA_CONCURRENCY_LIMIT"
      });
    }

    const jobId = crypto.randomUUID();
    await db.collection("ai_media_jobs").insertOne({
      jobId, userId: req.userId, mode, style, prompt: prompt || null,
      sourceObjectKey, providerJobId,
      targetResolution, outputSpec, portraitEnhance,
      outputUrl: providerOutputUrl,
      status: providerOutputUrl ? "READY_FOR_REVIEW" : providerStatus,
      createdAt: new Date(), updatedAt: new Date()
    });

    res.status(202).json({ jobId, status: providerOutputUrl ? "READY_FOR_REVIEW" : "PROCESSING", outputUrl: providerOutputUrl });
  } catch (e) {
    const safeError = safeAiMediaError(e);
    const statusCode = safeError.code === "AI_MEDIA_NOT_CONFIGURED" ? 503 : safeError.code === "AI_MEDIA_SOURCE_FORBIDDEN" ? 403 : 400;
    res.status(statusCode).json(safeError);
  }
});

aiMediaRouter.get("/jobs/:jobId", rateLimit({ windowMs: 60 * 1000, max: 120, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" }), requireUser, async (req, res) => {
  const db = await getDb();
  const job = await db.collection("ai_media_jobs").findOne({ jobId: String(req.params.jobId), userId: req.userId });
  if (!job) return res.status(404).json({ error: "AI media job not found" });

  let outputUrl = validateProviderOutputUrl(job.outputUrl);
  let status = normalizeProviderStatus(job.status, "PROCESSING");

  const jobCreatedAt = job.createdAt instanceof Date ? job.createdAt : null;
  const maxJobAgeMs = 24 * 60 * 60 * 1000;
  if (jobCreatedAt && Date.now() - jobCreatedAt.getTime() > maxJobAgeMs && status !== "READY_FOR_REVIEW") {
    if (status === "PROCESSING" || status === "QUEUED") {
      status = "EXPIRED";
      await db.collection("ai_media_jobs").updateOne(
        { _id: job._id },
        { $set: { status, outputUrl: null, updatedAt: new Date() } }
      );
    }
  }

  const statusEndpoint = validateProviderEndpoint(process.env.TWITOK_AI_MEDIA_STATUS_ENDPOINT);
  if (!outputUrl && (status === "PROCESSING" || status === "QUEUED") && job.providerJobId && statusEndpoint && process.env.TWITOK_AI_MEDIA_API_KEY) {
    try {
      const providerJobId = normalizeProviderJobId(job.providerJobId);
      if (!providerJobId) return res.status(409).json({ error: "AI media job has an invalid provider job id" });
      const url = statusEndpoint.replace("{jobId}", encodeURIComponent(providerJobId));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      let providerResponse: Response;
      try {
        providerResponse = await fetch(url, {
          headers: { "content-type": "application/json", authorization: `Bearer ${process.env.TWITOK_AI_MEDIA_API_KEY}` },
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }

      if (providerResponse.ok) {
        const provider = await readProviderJson(providerResponse);
        outputUrl = validateProviderOutputUrl(provider.outputUrl ?? provider.url);
        status = normalizeProviderStatus(provider.status ?? provider.state, status);
        if (outputUrl) status = "READY_FOR_REVIEW";
        await db.collection("ai_media_jobs").updateOne(
          { _id: job._id },
          { $set: { outputUrl, status, updatedAt: new Date() } }
        );
      }
    } catch {
      // Keep the persisted job state if the provider status service is temporarily unavailable.
    }
  }

  const responseJob = sanitizeAiMediaJob({ ...job, status, outputUrl, updatedAt: new Date() });
  res.json(responseJob);
});
