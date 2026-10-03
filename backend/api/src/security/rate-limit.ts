import type { Request, Response, NextFunction } from "express";
import { createHash } from "node:crypto";
import { redisIncrement } from "../cache/redis.js";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function cleanup(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}

function safeKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function rateLimit(options: { windowMs: number; max: number; key?: (req: Request) => string }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const identity = options.key?.(req) ?? req.ip ?? req.socket.remoteAddress ?? "unknown";
    const localKey = safeKey(identity.slice(0, 220));
    const redisKey = `ratelimit:v2:${localKey}:${options.windowMs}:${options.max}`;

    const redis = await redisIncrement(redisKey, options.windowMs);
    if (redis.available) {
      res.setHeader("RateLimit-Limit", options.max);
      res.setHeader("RateLimit-Remaining", Math.max(0, options.max - redis.count));
      res.setHeader("RateLimit-Reset", redis.ttlSeconds);
      if (redis.count > options.max) {
        res.setHeader("Retry-After", Math.max(1, redis.ttlSeconds));
        return res.status(429).json({ error: "Too many requests. Please try again later.", retryAfterSeconds: Math.max(1, redis.ttlSeconds) });
      }
      return next();
    }

    cleanup(now);
    const current = buckets.get(localKey);
    if (!current || current.resetAt <= now) {
      buckets.set(localKey, { count: 1, resetAt: now + options.windowMs });
      res.setHeader("RateLimit-Limit", options.max);
      res.setHeader("RateLimit-Remaining", Math.max(0, options.max - 1));
      res.setHeader("RateLimit-Reset", Math.ceil(options.windowMs / 1000));
      return next();
    }

    current.count += 1;
    res.setHeader("RateLimit-Limit", options.max);
    res.setHeader("RateLimit-Remaining", Math.max(0, options.max - current.count));
    res.setHeader("RateLimit-Reset", Math.ceil(Math.max(0, current.resetAt - now) / 1000));
    if (current.count > options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil(Math.max(0, current.resetAt - now) / 1000));
      res.setHeader("Retry-After", retryAfterSeconds);
      return res.status(429).json({ error: "Too many requests. Please try again later.", retryAfterSeconds });
    }
    return next();
  };
}

export function authRateLimit(req: Request) {
  const body = req.body ?? {};
  const identifier = typeof body.identifier === "string"
    ? body.identifier.trim().toLowerCase()
    : typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  return `${req.ip ?? "unknown"}:${identifier.slice(0, 160)}`;
}
