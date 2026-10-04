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
const AI_JOB_TIMEOUT_MS = 10 * 60 * 1000;
const AI_JOB_MAX_RETRIES = 2;
const AI_OUTPUT_MAX_BYTES = 512 * 1024 * 1024;
const AI_OUTPUT_FETCH_TIMEOUT_MS = 15_000;
const AI_RETRY_BASE_DELAY_MS = 2_000;
const AI_RETRY_MAX_DELAY_MS = 15_000;

function isRetryableProviderStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryDelayMs(retryCount: number) {
  const exponent = Math.max(0, retryCount - 1);
  return Math.min(AI_RETRY_MAX_DELAY_MS, AI_RETRY_BASE_DELAY_MS * (2 ** exponent));
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
const QUALITY_PROFILES: Record<string, { targetResolution: string; enhanceLevel: number }> = {
  ORIGINAL: { targetResolution: "ORIGINAL", enhanceLevel: 0 },
  CLEAN: { targetResolution: "CLEAN", enhanceLevel: 1 },
  HD: { targetResolution: "HD", enhanceLevel: 2 },
  "4K": { targetResolution: "4K", enhanceLevel: 3 },
  "8K": { targetResolution: "8K", enhanceLevel: 4 },
  "12K_AI": { targetResolution: "12K_AI", enhanceLevel: 5 },
};

function jobIsStalled(job: { status?: unknown; updatedAt?: Date | string } | Record<string, unknown>) {
  if (String(job.status ?? "PROCESSING").toUpperCase() !== "PROCESSING") return false;
  const updated = job.updatedAt instanceof Date ? job.updatedAt.getTime() : Date.parse(String(job.updatedAt ?? ""));
  return Number.isFinite(updated) && Date.now() - updated > AI_JOB_TIMEOUT_MS;
}

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

function validMediaOutput(value: unknown) {
  const url = safeUrl(value, allowedHosts());
  if (!url) return null;
  const pathname = new URL(url).pathname.toLowerCase();
  const allowed = [
    ".jpg", ".jpeg", ".jpe", ".jfif", ".png", ".webp", ".avif", ".heic", ".heif", ".tif", ".tiff", ".bmp",
    ".gif", ".svg",
    ".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".mpeg", ".mpg", ".m2ts", ".mts", ".ts", ".3gp", ".3g2",
  ];
  return allowed.some(ext => pathname.endsWith(ext)) ? url : null;
}

function mediaKindForMode(mode: string) {
  return mode === "IMAGE" ? "image" : "video";
}

function outputExtension(url: string) {
  const pathname = new URL(url).pathname.toLowerCase();
  return pathname.slice(pathname.lastIndexOf("."));
}

function validateOutputForMode(value: unknown, mode: string) {
  const url = validMediaOutput(value);
  if (!url) return null;
  const ext = outputExtension(url);
  const imageExts = new Set([
    ".jpg", ".jpeg", ".jpe", ".jfif", ".png", ".webp", ".avif", ".heic", ".heif", ".tif", ".tiff", ".bmp",
    ".gif", ".svg",
  ]);
  const videoExts = new Set([
    ".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".mpeg", ".mpg", ".m2ts", ".mts", ".ts", ".3gp", ".3g2",
  ]);
  const expected = mediaKindForMode(mode);
  if (expected === "image" && !imageExts.has(ext)) return null;
  if (expected === "video" && !videoExts.has(ext)) return null;
  return url;
}

const OUTPUT_CONTENT_TYPES = {
  IMAGE: new Set([
    "image/jpeg", "image/png", "image/webp", "image/avif", "image/heic", "image/heif",
    "image/tiff", "image/bmp", "image/gif", "image/svg+xml",
  ]),
  VIDEO: new Set([
    "video/mp4", "video/quicktime", "video/webm", "video/x-matroska", "video/x-msvideo",
    "video/mpeg", "video/mp2t", "video/3gpp", "video/3gpp2",
  ]),
};

async function validateOutputContent(url: string, mode: string) {
  // Only server-fetch provider output when an explicit host allowlist is configured.
  // This prevents turning output validation into an arbitrary outbound fetch primitive.
  if (!allowedHosts().length) return true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_OUTPUT_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { method: "GET", headers: { Range: "bytes=0-15" }, signal: controller.signal });
    if (!response.ok && response.status !== 206) return false;
    const contentType = response.headers.get("content-type")?.toLowerCase().split(";")[0].trim();
    const expectedTypes = OUTPUT_CONTENT_TYPES[mode as "IMAGE" | "VIDEO"];
    if (contentType && !expectedTypes.has(contentType)) return false;
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > AI_OUTPUT_MAX_BYTES) return false;
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function validateProviderOutputMetadata(value: unknown, mode: string) {
  const extracted = extractProviderOutput(value);
  if (!extracted) return null;
  const normalized = normalizeProviderResponse(extracted.root);
  const normalizedOutput = normalized?.outputUrl ? normalized : normalizeProviderResponse(extracted.output);
  if (!normalizedOutput?.outputUrl) return null;
  const url = validateOutputForMode(normalizedOutput.outputUrl, mode);
  if (!url) return null;
  const contentType = [
    extracted.root.contentType, extracted.root.content_type, extracted.root.mimeType, extracted.root.mime_type,
    extracted.result?.contentType, extracted.result?.content_type, extracted.result?.mimeType, extracted.result?.mime_type,
  ].find(item => typeof item === "string");
  if (contentType) {
    const normalizedType = contentType.toLowerCase().split(";")[0].trim();
    const allowed = OUTPUT_CONTENT_TYPES[mode as "IMAGE" | "VIDEO"];
    if (!allowed?.has(normalizedType)) return null;
  }
  return url;
}

function extractProviderOutput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>;
  const result = root.result && typeof root.result === "object" && !Array.isArray(root.result)
    ? root.result as Record<string, unknown>
    : null;
  const output = result?.output && typeof result.output === "object" && !Array.isArray(result.output)
    ? result.output as Record<string, unknown>
    : result ?? root;
  return {
    root,
    result,
    output,
  };
}

function providerOutputStatus(value: unknown) {
  const extracted = extractProviderOutput(value);
  if (!extracted) return "";
  const normalized = normalizeProviderResponse(extracted.root);
  if (normalized?.status) return String(normalized.status).toUpperCase();
  const nested = normalizeProviderResponse(extracted.output);
  return String(nested?.status ?? "").toUpperCase();
}

function validateOutputDimensions(value: unknown, mode: string, qualityProfile: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return true;
  const root = value as Record<string, unknown>;
  const width = Number(root.width ?? root.outputWidth ?? root.output_width);
  const height = Number(root.height ?? root.outputHeight ?? root.output_height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return true;
  if (!Number.isInteger(width) || !Number.isInteger(height)) return false;
  if (width <= 0 || height <= 0 || width > 16384 || height > 16384) return false;
  const pixels = width * height;
  if (pixels > 268_435_456) return false;
  if (mode === "VIDEO") {
    const duration = Number(root.duration ?? root.durationSeconds);
    if (Number.isFinite(duration) && (!Number.isFinite(duration) || duration <= 0 || duration > 60 * 60)) return false;
    const fps = Number(root.fps ?? root.frameRate);
    if (Number.isFinite(fps) && (fps <= 0 || fps > 120)) return false;
  }
  if (qualityProfile === "12K_AI" && Math.max(width, height) < 6000) return false;
  return true;
}

function providerStatusEndpoint(jobId: string) {
  const template = process.env.TWITOK_AI_MEDIA_STATUS_ENDPOINT;
  const providerEndpoint = safeUrl(process.env.TWITOK_AI_MEDIA_ENDPOINT, []);
  if (!template || !providerEndpoint) return null;
  const encoded = encodeURIComponent(jobId);
  const providerHost = new URL(providerEndpoint).hostname.toLowerCase();
  return safeUrl(template.replaceAll("{jobId}", encoded), [providerHost]);
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
    const idempotencyKey = crypto.randomUUID();
    let provider: Record<string, unknown> = {};
    let providerRetryCount = 0;

    for (let attempt = 1; attempt <= AI_JOB_MAX_RETRIES + 1; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
            "idempotency-key": idempotencyKey,
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

        if (!response.ok) {
          if (isRetryableProviderStatus(response.status) && attempt <= AI_JOB_MAX_RETRIES) {
            providerRetryCount = attempt;
            await sleep(retryDelayMs(attempt));
            continue;
          }
          throw new Error(`provider HTTP ${response.status}`);
        }

        const json: unknown = await response.json();
        if (!json || typeof json !== "object" || Array.isArray(json)) {
          throw new Error("provider invalid response");
        }
        const normalized = normalizeProviderResponse(json);
        if (!normalized) throw new Error("provider invalid response");
        provider = normalized;
        break;
      } catch (error) {
        if (attempt <= AI_JOB_MAX_RETRIES && error instanceof Error && error.name === "AbortError") {
          providerRetryCount = attempt;
          await sleep(retryDelayMs(attempt));
          continue;
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }

    const outputUrl = validateProviderOutputMetadata(provider, mode);
    if (outputUrl && !(await validateOutputContent(outputUrl, mode))) {
      return res.status(502).json({ error: "AI provider returned invalid output content", code: "AI_MEDIA_INVALID_OUTPUT" });
    }
    if (outputUrl && !validateOutputDimensions(provider, mode, qualityProfile)) {
      return res.status(502).json({ error: "AI provider returned invalid output dimensions", code: "AI_MEDIA_INVALID_OUTPUT" });
    }
    const providerJobId = safeJobId(provider.jobId);
    const providerStatus = providerOutputStatus(provider);
    if (providerStatus && PROVIDER_TERMINAL_FAILURES.has(providerStatus) && !outputUrl && !providerJobId) {
      return res.status(502).json({ error: "AI provider rejected the media job", code: "AI_MEDIA_PROVIDER_FAILED" });
    }

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
      retryCount: providerRetryCount,
      maxRetries: AI_JOB_MAX_RETRIES,
      idempotencyKey,
      providerRequestId: idempotencyKey,
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

  if (!outputUrl && jobIsStalled(job)) {
    status = "FAILED";
    await (await getDb()).collection("ai_media_jobs").updateOne(
      { _id: job._id, userId: req.userId, status: "PROCESSING" },
      { $set: { status, failureCode: "AI_MEDIA_JOB_TIMEOUT", updatedAt: new Date() } },
    );
  }

  if (!outputUrl && status === "PROCESSING" && job.providerJobId) {
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
            const candidate = validateProviderOutputMetadata(provider, String(job.mode ?? "VIDEO").toUpperCase());
            if (candidate && await validateOutputContent(candidate, String(job.mode ?? "VIDEO").toUpperCase()) &&
                validateOutputDimensions(provider, String(job.mode ?? "VIDEO").toUpperCase(), String(job.qualityProfile ?? "ORIGINAL").toUpperCase())) {
              outputUrl = candidate;
              status = "READY";
              await (await getDb()).collection("ai_media_jobs").updateOne(
                { _id: job._id, userId: req.userId },
                { $set: { outputUrl: candidate, status, updatedAt: new Date() } },
              );
            } else {
              const providerStatus = providerOutputStatus(provider) || "PROCESSING";
              status = providerStatus;
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