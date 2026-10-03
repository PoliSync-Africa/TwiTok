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

async function authenticateUserRequest(req: Request, res: Response, next: NextFunction, allowIncompleteProfile = false) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : readCookie(req, "twitok_user_session");
    if (!token) return res.status(401).json({ error: "Authorization required" });
    const claims = verifyUserToken(token);
    if (claims.purpose === "VERIFICATION") return res.status(403).json({ error: "Account verification required" });
    const userId = new ObjectId(claims.sub);
    const db = await getDb();
    const user = await db.collection("users").findOne({ _id: userId }, { projection: { status: 1, sessionVersion: 1, profileSetupComplete: 1 } });
    if (!user || user.status !== "ACTIVE") return res.status(401).json({ error: "Account is unavailable" });
    if (Number(user.sessionVersion ?? 0) !== Number(claims.sv ?? 0)) return res.status(401).json({ error: "Session has been revoked" });
    if (!allowIncompleteProfile && user.profileSetupComplete !== true) return res.status(403).json({ error: "Profile setup required", code: "PROFILE_SETUP_REQUIRED" });
    req.userId = userId;
    req.userToken = claims;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  return authenticateUserRequest(req, res, next, false);
}

export async function requireIncompleteProfileUser(req: Request, res: Response, next: NextFunction) {
  return authenticateUserRequest(req, res, next, true);
}

export async function requireVerificationUser(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) return res.status(401).json({ error: "Verification authorization required" });
    const claims = verifyUserToken(token);
    if (claims.purpose !== "VERIFICATION") return res.status(403).json({ error: "Verification session required" });
    const userId = new ObjectId(claims.sub);
    const db = await getDb();
    const user = await db.collection("users").findOne({ _id: userId }, { projection: { status: 1, sessionVersion: 1 } });
    if (!user || user.status !== "ACTIVE") return res.status(401).json({ error: "Account is unavailable" });
    if (Number(user.sessionVersion ?? 0) !== Number(claims.sv ?? 0)) return res.status(401).json({ error: "Session has been revoked" });
    req.userId = userId;
    req.userToken = claims;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired verification session" });
  }
}

export async function requireAdultUser(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const tokenValue = header?.startsWith("Bearer ") ? header.slice(7) : readCookie(req, "twitok_user_session");
    if (!tokenValue) return res.status(401).json({ error: "Authorization required" });
    const claims = verifyUserToken(tokenValue);
    if (claims.purpose === "VERIFICATION") return res.status(403).json({ error: "Account verification required" });
    const userId = new ObjectId(claims.sub);
    const db = await getDb();
    const user = await db.collection("users").findOne({ _id: userId }, { projection: { status: 1, sessionVersion: 1, dateOfBirth: 1 } });
    if (!user || user.status !== "ACTIVE") return res.status(401).json({ error: "Account is unavailable" });
    if (Number(user.sessionVersion ?? 0) !== Number(claims.sv ?? 0)) return res.status(401).json({ error: "Session has been revoked" });
    const dob = user.dateOfBirth ? new Date(user.dateOfBirth) : null;
    if (!dob || Number.isNaN(dob.getTime())) return res.status(403).json({ error: "Date of birth is required for Coin, Gift and Cash-out features" });
    const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 18);
    if (dob > cutoff) return res.status(403).json({ error: "This wallet feature requires an adult account" });
    req.userId = userId; req.userToken = claims; next();
  } catch { res.status(401).json({ error: "Invalid or expired session" }); }
}


export async function requireMonetizationUser(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const tokenValue = header?.startsWith("Bearer ") ? header.slice(7) : readCookie(req, "twitok_user_session");
    if (!tokenValue) return res.status(401).json({ error: "Authorization required" });
    const claims = verifyUserToken(tokenValue);
    if (claims.purpose === "VERIFICATION") return res.status(403).json({ error: "Account verification required" });
    const userId = new ObjectId(claims.sub);
    const db = await getDb();
    const user = await db.collection("users").findOne(
      { _id: userId },
      { projection: { status: 1, sessionVersion: 1, dateOfBirth: 1, monetizationEnabled: 1 } }
    );
    if (!user || user.status !== "ACTIVE") return res.status(401).json({ error: "Account is unavailable" });
    if (Number(user.sessionVersion ?? 0) !== Number(claims.sv ?? 0)) return res.status(401).json({ error: "Session has been revoked" });
    const dob = user.dateOfBirth ? new Date(user.dateOfBirth) : null;
    if (!dob || Number.isNaN(dob.getTime())) return res.status(403).json({ error: "Date of birth is required for creator monetization" });
    const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 18);
    if (dob > cutoff) return res.status(403).json({ error: "Creator monetization requires an adult account" });
    if (user.monetizationEnabled !== true) return res.status(403).json({ error: "Creator monetization is turned off. Enable Monetization in Creator settings first." });
    req.userId = userId; req.userToken = claims; next();
  } catch { res.status(401).json({ error: "Invalid or expired session" }); }
}
