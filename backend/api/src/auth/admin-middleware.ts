import type { Request, Response, NextFunction } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo.js";
import { verifyOwnerToken } from "./owner.js";

declare global { namespace Express { interface Request { ownerId?: string } } }

export async function requireOwner(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Administrator session required" });
    const claims = verifyOwnerToken(header.slice(7));
    if (claims.role !== "OWNER" || !ObjectId.isValid(claims.sub)) return res.status(403).json({ error: "Owner access required" });
    const db = await getDb();
    const owner = await db.collection("owner_accounts").findOne({ _id: new ObjectId(claims.sub), role: "OWNER", isActive: true });
    if (!owner) return res.status(401).json({ error: "Administrator session unavailable" });
    if (owner.mfaRequired && claims.mfaVerified !== true) return res.status(401).json({ error: "Administrator MFA verification required" });
    req.ownerId = claims.sub; next();
  } catch { res.status(401).json({ error: "Administrator session expired" }); }
}