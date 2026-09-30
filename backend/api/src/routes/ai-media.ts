import { Router } from "express";
import { requireUser } from "../auth/middleware.js";
import { rateLimit } from "../security/rate-limit.js";

export const aiMediaRouter = Router();

const aiLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  key: req => req.userId?.toHexString() ?? req.ip ?? "unknown"
});

const ALLOWED_TOOLS = new Set([
  "RESTORE","HD_ENHANCE","RELIGHT","AI_SKY","CUTOUT","CLEAN_MIRROR","COLORIZE",
  "AI_ART","AI_PORTRAIT","AI_STYLES","AI_EXPAND","REMOVE_TEXT","CHANGE_POSE",
  "GENERATE_IMAGE","GENERATE_VIDEO"
]);

aiMediaRouter.post("/generate", requireUser, aiLimit, async (req, res) => {
  try {
    const mode = String(req.body?.mode ?? "").toUpperCase();
    const tool = String(req.body?.tool ?? "").toUpperCase();
    const prompt = String(req.body?.prompt ?? "").trim().slice(0, 1200);
    const sourceUrl = String(req.body?.sourceUrl ?? "").trim().slice(0, 2000);
    if (mode !== "IMAGE" && mode !== "VIDEO") return res.status(400).json({ error: "mode must be IMAGE or VIDEO" });
    if (!ALLOWED_TOOLS.has(tool)) return res.status(400).json({ error: "Unsupported AI tool" });
    if (!prompt && !sourceUrl) return res.status(400).json({ error: "A prompt or source media is required" });

    const endpoint = mode === "IMAGE" ? process.env.TWITOK_AI_IMAGE_PROVIDER_URL : process.env.TWITOK_AI_VIDEO_PROVIDER_URL;
    const key = process.env.TWITOK_AI_PROVIDER_KEY ?? "";
    if (!endpoint) return res.status(503).json({ error: "AI media provider is not configured yet" });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      const provider = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(key ? { Authorization: "Bearer " + key } : {})
        },
        body: JSON.stringify({
          tool,
          prompt,
          sourceUrl: sourceUrl || undefined,
          userId: req.userId!.toHexString(),
          freeForUser: true
        })
      });
      const data = await provider.json().catch(() => ({}));
      if (!provider.ok) return res.status(502).json({ error: "AI provider rejected the request", providerStatus: provider.status });
      const outputUrl = typeof data.outputUrl === "string" ? data.outputUrl : typeof data.url === "string" ? data.url : null;
      return res.status(202).json({
        status: outputUrl ? "READY" : String(data.status ?? "PROCESSING"),
        outputUrl,
        jobId: typeof data.jobId === "string" ? data.jobId : null,
        tool,
        mode
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : "Unable to run AI media tool" });
  }
});
