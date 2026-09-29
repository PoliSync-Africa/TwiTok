import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";

export function requireInternalService(req: Request, res: Response, next: NextFunction) {
  try {
    const expected = process.env.TWITOK_INTERNAL_SERVICE_KEY;
    if (!expected || expected.length < 32) throw new Error("not configured");
    const supplied = req.header("x-twitok-internal-key") ?? "";
    const a = Buffer.from(supplied), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return res.status(401).json({ error: "Internal service authentication required" });
    next();
  } catch { res.status(503).json({ error: "Internal service authentication is not configured" }); }
}