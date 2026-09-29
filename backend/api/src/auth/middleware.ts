import type { Request, Response, NextFunction } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo.js";
import { verifyUserToken } from "./user.js";

declare global {
  namespace Express {
    interface Request {
      userId?: ObjectId;
      userToken?: ReturnType<typeof verifyUserToken>;
    }
  }
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Authorization required" });
    const token = verifyUserToken(header.slice(7));
    const userId = new ObjectId(token.sub);
    const db = await getDb();
    const user = await db.collection("users").findOne({ _id: userId }, { projection: { status: 1 } });
    if (!user || user.status !== "ACTIVE") return res.status(401).json({ error: "Account is unavailable" });
    req.userId = userId;
    req.userToken = token;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}


export async function requireAdultUser(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Authorization required" });
    const token = verifyUserToken(header.slice(7));
    const userId = new ObjectId(token.sub);
    const db = await getDb();
    const user = await db.collection("users").findOne(
      { _id: userId },
      { projection: { status: 1, dateOfBirth: 1 } }
    );
    if (!user || user.status !== "ACTIVE") return res.status(401).json({ error: "Account is unavailable" });

    const dob = user.dateOfBirth ? new Date(user.dateOfBirth) : null;
    if (!dob || Number.isNaN(dob.getTime())) {
      return res.status(403).json({ error: "Date of birth is required for Coin, Gift and Cash-out features" });
    }
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 18);
    if (dob > cutoff) return res.status(403).json({ error: "This wallet feature requires an adult account" });

    req.userId = userId;
    req.userToken = token;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}
