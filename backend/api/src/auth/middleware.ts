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

async function authenticateRequest(req: Request, res: Response) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : readCookie(req, "twitok_user_session");
  if (!token) return { error: "Authorization required" as const };
  const claims = verifyUserToken(token);
  const userId = new ObjectId(claims.sub);
  const db = await getDb();
  const user = await db.collection("users").findOne(
    { _id: userId },
    { projection: { status: 1, sessionVersion: 1, email: 1, phone: 1, emailVerified: 1, phoneVerified: 1, dateOfBirth: 1, monetizationEnabled: 1, profileSetupComplete: 1 } }
  );
  if (!user || user.status !== "ACTIVE") return { error: "Account is unavailable" as const };
  if (Number(user.sessionVersion ?? 0) !== Number(claims.sv ?? 0)) return { error: "Session has been revoked" as const };
  return { claims, userId, user };
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authenticateRequest(req, res);
    if ("error" in result) return res.status(result.error === "Authorization required" ? 401 : 401).json({ error: result.error });
    if (result.user.emailVerified !== true || result.user.phoneVerified !== true) {
      return res.status(403).json({ error: "Email and phone verification required", code: "CONTACT_VERIFICATION_REQUIRED" });
    }
    req.userId = result.userId; req.userToken = result.claims; next();
  } catch { res.status(401).json({ error: "Invalid or expired session" }); }
}

export async function requireContactVerificationUser(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authenticateRequest(req, res);
    if ("error" in result) return res.status(401).json({ error: result.error });
    if (!result.user.email && !result.user.phone) return res.status(403).json({ error: "Add an email address or phone number to receive an OTP", code: "CONTACTS_REQUIRED" });
    if (result.user.emailVerified === true && result.user.phoneVerified === true) {
      req.userId = result.userId; req.userToken = result.claims; return next();
    }
    req.userId = result.userId; req.userToken = result.claims; next();
  } catch { res.status(401).json({ error: "Invalid or expired session" }); }
}

export async function requireAdultUser(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authenticateRequest(req, res);
    if ("error" in result) return res.status(401).json({ error: result.error });
    if (result.user.emailVerified !== true || result.user.phoneVerified !== true) return res.status(403).json({ error: "Email and phone verification required", code: "CONTACT_VERIFICATION_REQUIRED" });
    const dob = result.user.dateOfBirth ? new Date(result.user.dateOfBirth) : null;
    if (!dob || Number.isNaN(dob.getTime())) return res.status(403).json({ error: "Date of birth is required for Coin, Gift and Cash-out features" });
    const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 18);
    if (dob > cutoff) return res.status(403).json({ error: "This wallet feature requires an adult account" });
    req.userId = result.userId; req.userToken = result.claims; next();
  } catch { res.status(401).json({ error: "Invalid or expired session" }); }
}

export async function requireMonetizationUser(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authenticateRequest(req, res);
    if ("error" in result) return res.status(401).json({ error: result.error });
    if (result.user.emailVerified !== true || result.user.phoneVerified !== true) return res.status(403).json({ error: "Email and phone verification required", code: "CONTACT_VERIFICATION_REQUIRED" });
    const dob = result.user.dateOfBirth ? new Date(result.user.dateOfBirth) : null;
    if (!dob || Number.isNaN(dob.getTime())) return res.status(403).json({ error: "Date of birth is required for creator monetization" });
    const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 18);
    if (dob > cutoff) return res.status(403).json({ error: "Creator monetization requires an adult account" });
    if (result.user.monetizationEnabled !== true) return res.status(403).json({ error: "Creator monetization is turned off. Enable Monetization in Creator settings first." });
    req.userId = result.userId; req.userToken = result.claims; next();
  } catch { res.status(401).json({ error: "Invalid or expired session" }); }
}


/**
 * Blocks authenticated users from entering the main application until the mandatory
 * profile setup is complete. Requests without authentication remain public.
 * Auth routes (registration, verification and profile setup) are mounted before this guard.
 */
export async function requireCompletedProfileIfAuthenticated(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const cookie = readCookie(req, "twitok_user_session");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : cookie;
    if (!token) return next();

    let claims: ReturnType<typeof verifyUserToken>;
    try { claims = verifyUserToken(token); } catch { return next(); }
    const db = await getDb();
    const user = await db.collection("users").findOne(
      { _id: new ObjectId(claims.sub) },
      { projection: { status: 1, sessionVersion: 1, profileSetupComplete: 1, username: 1 } }
    );
    if (!user || user.status !== "ACTIVE" || Number(user.sessionVersion ?? 0) !== Number(claims.sv ?? 0)) return next();
    if (user.profileSetupComplete !== true || typeof user.username !== "string" || !user.username) {
      return res.status(403).json({
        error: "Profile setup required",
        code: "PROFILE_SETUP_REQUIRED",
        next: "/profile-setup"
      });
    }
    return next();
  } catch {
    return next();
  }
}
