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

function readCookie(req: Request, name: string) {
  const header = req.headers.cookie ?? "";
  const match = header.split(";").map(part => part.trim()).find(part => part.startsWith(name + "="));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : readCookie(req, "twitok_user_session");
    if (!token) return res.status(401).json({ error: "Authorization required" });
    const claims = verifyUserToken(token);
    const userId = new ObjectId(claims.sub);
    const db = await getDb();
    const user = await db.collection("users").findOne({ _id: userId }, { projection: { status: 1, sessionVersion: 1 } });
    if (!user || user.status !== "ACTIVE") return res.status(401).json({ error: "Account is unavailable" });
    if (Number(user.sessionVersion ?? 0) !== Number(claims.sv ?? 0)) return res.status(401).json({ error: "Session has been revoked" });
    req.userId = userId;
    req.userToken = claims;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}
