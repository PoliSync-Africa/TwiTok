import type { Request, Response, NextFunction } from "express";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function cleanup(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}

export function rateLimit(options: { windowMs: number; max: number; key?: (req: Request) => string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now(); cleanup(now);
    const identity = options.key?.(req) ?? req.ip ?? req.socket.remoteAddress ?? "unknown";
    const key = identity.slice(0, 220);
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      res.setHeader("RateLimit-Limit", options.max);
      res.setHeader("RateLimit-Remaining", Math.max(0, options.max - 1));
      return next();
    }
    current.count += 1;
    res.setHeader("RateLimit-Limit", options.max);
    res.setHeader("RateLimit-Remaining", Math.max(0, options.max - current.count));
    res.setHeader("RateLimit-Reset", Math.ceil((current.resetAt - now) / 1000));
    if (current.count > options.max) return res.status(429).json({ error: "Too many requests. Please try again later." });
    next();
  };
}

export function authRateLimit(req: Request) {
  const body = req.body ?? {};
  const identifier = typeof body.identifier === "string"
    ? body.identifier.trim().toLowerCase()
    : typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  return `${req.ip ?? "unknown"}:${identifier.slice(0, 160)}`;
}