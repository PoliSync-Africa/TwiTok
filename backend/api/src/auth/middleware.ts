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
    const header = req.headers.authorization;\n    const cookie = req.headers.cookie?.split(";").map(v => v.trim()).find(v => v.startsWith("twitok_session="));\n    const cookieToken = cookie ? decodeURIComponent(cookie.slice("twitok_session=".length)) : undefined;
    if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Authorization required" });
    const token = verifyUserToken(header.slice(7));
    const userId = new ObjectId(token.sub);
    const db = await getDb();
    const user = await db.collection("users").findOne({ _id: userId }, { projection: { status: 1, sessionVersion: 1 } });
    if (!user || user.status !== "ACTIVE") return res.status(401).json({ error: "Account is unavailable" });
    if (Number(user.sessionVersion ?? 0) !== Number(token.sv ?? 0)) return res.status(401).json({ error: "Session has been revoked" });
    req.userId = userId;
    req.userToken = token;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}
