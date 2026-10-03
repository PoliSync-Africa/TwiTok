import { Router } from "express";
import bcrypt from "bcryptjs";
import { getDb } from "../db/mongo.js";
import { authenticateUser, createUser, issueUserToken } from "../auth/user.js";
import { requireUser, requireContactVerificationUser } from "../auth/middleware.js";
import { rateLimit, authRateLimit } from "../security/rate-limit.js";
import { sendAccountVerification, verifyAccountCode, type VerificationChannel } from "../auth/account-verification.js";

const WEB_SESSION_COOKIE = "twitok_user_session";
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 24 * 60 * 60 * 1000 };

export const authRouter = Router();
const userReadLimit = rateLimit({ windowMs: 60 * 1000, max: 120, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });
const userWriteLimit = rateLimit({ windowMs: 60 * 1000, max: 30, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });


authRouter.post("/register", rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
  try {
    const { username, password, email, phone, dateOfBirth, countryCode } = req.body ?? {};
    if (!password || !dateOfBirth || !countryCode) return res.status(400).json({ error: "password, dateOfBirth and countryCode are required" });
    const db = await getDb(), user = await createUser(db, { username, password, email, phone, dateOfBirth, countryCode });
    const token = issueUserToken(user);
    res.cookie(WEB_SESSION_COOKIE, token, cookieOptions);
    res.status(201).json({
      token,
      user,
      verificationRequired: true,
      verificationChannels: ["email", "phone"],
      verificationDelivery: "choose"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create account";
    res.status(/duplicate|E11000|already exists/i.test(message) ? 409 : 400).json({ error: message });
  }
});

authRouter.post("/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 8, key: authRateLimit }), async (req, res) => {
  try {
    const { identifier, password, countryCode } = req.body ?? {};
    if (!identifier || !password) return res.status(400).json({ error: "identifier and password are required" });
    const db = await getDb();
    const user = await authenticateUser(db, identifier, password, countryCode);
    const token = issueUserToken(user);
    res.cookie(WEB_SESSION_COOKIE, token, cookieOptions);
    const verificationRequired = user.emailVerified !== true || user.phoneVerified !== true;
    if (verificationRequired) {
      return res.json({
        token,
        user,
        verificationRequired: true,
        verificationChannels: ["email", "phone"],
        verificationDelivery: "choose"
      });
    }
    res.json({ token, user, verificationRequired: false, verificationDelivery: "not_required" });
  } catch { res.status(401).json({ error: "Invalid login credentials" }); }
});

authRouter.post("/verification/send", requireContactVerificationUser, rateLimit({ windowMs: 15 * 60 * 1000, max: 5, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" }), async (req, res) => {
  try {
    const channel = String(req.body?.channel ?? "").trim().toLowerCase() as VerificationChannel;
    if (channel !== "email" && channel !== "phone") return res.status(400).json({ error: "Verification channel must be email or phone" });
    const db = await getDb();
    const current = await db.collection("users").findOne({ _id: req.userId! }, { projection: { email: 1, phone: 1, emailVerified: 1, phoneVerified: 1 } });
    if (!current?.email || !current?.phone) return res.status(400).json({ error: "Both email address and phone number are required for verification" });
    if (channel === "email" && current.emailVerified === true) return res.status(400).json({ error: "This email address is already verified" });
    if (channel === "phone" && current.phoneVerified === true) return res.status(400).json({ error: "This phone number is already verified" });
    const result = await sendAccountVerification(db, req.userId!.toHexString(), channel);
    return res.json({ verificationRequired: true, ...result });
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : "Verification delivery is temporarily unavailable", verificationDeliveryUnavailable: true });
  }
});

authRouter.post("/verification/verify", requireContactVerificationUser, rateLimit({ windowMs: 15 * 60 * 1000, max: 10, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" }), async (req, res) => {
  try {
    const code = String(req.body?.code ?? "").trim();
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "Enter the 6-digit verification code" });
    const db = await getDb();
    const result = await verifyAccountCode(db, req.userId!.toHexString(), code);
    const user = await db.collection("users").findOne({ _id: req.userId! }, { projection: { passwordHash: 0 } });
    const remainingVerificationRequired = user?.emailVerified !== true || user?.phoneVerified !== true;
    return res.json({ ...result, user, verificationRequired: remainingVerificationRequired });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Verification failed" });
  }
});

authRouter.get("/verification/status", requireContactVerificationUser, userReadLimit, async (req, res) => {
  try {
    const user = await (await getDb()).collection("users").findOne(
      { _id: req.userId! },
      { projection: { passwordHash: 0, email: 1, phone: 1, emailVerified: 1, phoneVerified: 1, profileSetupComplete: 1 } }
    );
    if (!user) return res.status(404).json({ error: "Account not found" });
    return res.json({
      user,
      verificationRequired: user.emailVerified !== true || user.phoneVerified !== true,
      verificationChannels: ["email", "phone"]
    });
  } catch {
    return res.status(401).json({ error: "Unable to load verification status" });
  }
});

authRouter.post("/logout", requireUser, userWriteLimit, async (req, res) => {
  try {
    await (await getDb()).collection("users").updateOne({ _id: req.userId! }, { $inc: { sessionVersion: 1 }, $set: { updatedAt: new Date() } });
    res.clearCookie(WEB_SESSION_COOKIE, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
    return res.status(204).send();
  } catch { return res.status(500).json({ error: "Unable to end session" }); }
});

authRouter.post("/change-password", requireUser, rateLimit({ windowMs: 15 * 60 * 1000, max: 5, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" }), async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword ?? "");
    const newPassword = String(req.body?.newPassword ?? "");
    if (newPassword.length < 12) return res.status(400).json({ error: "New password must contain at least 12 characters" });
    if (currentPassword === newPassword) return res.status(400).json({ error: "New password must differ from the current password" });
    const db = await getDb();
    const user = await db.collection("users").findOne({ _id: req.userId! }, { projection: { passwordHash: 1 } });
    if (!user?.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) return res.status(401).json({ error: "Current password is incorrect" });
    await db.collection("users").updateOne(
      { _id: req.userId! },
      { $set: { passwordHash: await bcrypt.hash(newPassword, 12), updatedAt: new Date() }, $inc: { sessionVersion: 1 } }
    );
    res.clearCookie(WEB_SESSION_COOKIE, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
    return res.status(204).send();
  } catch { return res.status(400).json({ error: "Unable to change password" }); }
});

authRouter.get("/me", requireUser, userReadLimit, async (req, res) => {
  try {
    const user = await (await getDb()).collection("users").findOne({ _id: req.userId! }, { projection: { passwordHash: 0 } });
    if (!user) return res.status(404).json({ error: "Account not found" });
    res.json({ user });
  } catch { res.status(401).json({ error: "Invalid or expired session" }); }
});

authRouter.patch("/profile-setup", requireUser, userWriteLimit, async (req, res) => {
  try {
    const username = String(req.body?.username ?? "").trim().toLowerCase(), nickname = String(req.body?.nickname ?? "").trim(), bio = String(req.body?.bio ?? "").trim(), isPrivate = Boolean(req.body?.isPrivate);
    if (!/^[a-z0-9._]{3,24}$/.test(username) || username.endsWith(".")) return res.status(400).json({ error: "Username must be 3-24 characters, use letters, numbers, dots or underscores, and not end with a dot" });
    if (!nickname || nickname.length > 50) return res.status(400).json({ error: "Nickname is required and must be 1-50 characters" });
    if (bio.length > 80) return res.status(400).json({ error: "Bio must be 80 characters or less" });
    const db = await getDb(), current = await db.collection("users").findOne({ _id: req.userId! }, { projection: { username: 1, nickname: 1, nameLastChangedAt: 1, isVerified: 1 } });
    const nameChanged = username !== current?.username || nickname !== current?.nickname;
    if (nameChanged && current?.nameLastChangedAt) {
      const nextAllowed = new Date(new Date(current.nameLastChangedAt).getTime() + 28 * 24 * 60 * 60 * 1000);
      if (new Date() < nextAllowed) return res.status(429).json({ error: "You can change your name again after 28 days", nextNameChangeAt: nextAllowed.toISOString() });
    }
    if (await db.collection("users").findOne({ username, _id: { $ne: req.userId! } }, { projection: { _id: 1 } })) return res.status(409).json({ error: "That username is already taken" });
    await db.collection("users").updateOne(
      { _id: req.userId! },
      {
        $set: {
          username, nickname, bio, isPrivate, profileSetupComplete: true,
          ...(nameChanged ? { nameLastChangedAt: new Date() } : {}),
          ...(nameChanged && current?.isVerified === true ? { isVerified: false, verificationStatus: "REVERIFY_REQUIRED" } : {}),
          updatedAt: new Date()
        },
        ...(nameChanged && current?.isVerified === true ? { $unset: { verifiedAt: "", verifiedBy: "" } } : {})
      }
    );
    const user = await db.collection("users").findOne({ _id: req.userId! }, { projection: { passwordHash: 0 } });
    if (!user) return res.status(404).json({ error: "Account not found" });
    res.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to complete profile setup";
    res.status(/duplicate|E11000/i.test(message) ? 409 : 400).json({ error: message });
  }
});

authRouter.patch("/comment-settings", requireUser, userWriteLimit, async (req, res) => {
  try {
    const settings = { allowComments: req.body?.allowComments !== false, filterAll: Boolean(req.body?.filterAll), filterSpam: req.body?.filterSpam !== false, filterKeywords: Array.isArray(req.body?.filterKeywords) ? [...new Set(req.body.filterKeywords.map((x: unknown) => String(x).trim().toLowerCase()).filter(Boolean))].slice(0, 100) : [] };
    await (await getDb()).collection("users").updateOne({ _id: req.userId! }, { $set: { commentSettings: settings, updatedAt: new Date() } });
    res.json({ commentSettings: settings });
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Unable to update comment settings" }); }
});