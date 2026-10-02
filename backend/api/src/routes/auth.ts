import { Router } from "express";
import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import { getDb } from "../db/mongo.js";
import { authenticateUser, createUser, issueUserToken, issueVerificationToken } from "../auth/user.js";
import { requireUser, requireVerificationUser } from "../auth/middleware.js";
import { rateLimit, authRateLimit } from "../security/rate-limit.js";
import { sendOtp, verifyOtp, type OtpChannel } from "../verification/otp.js";

const WEB_SESSION_COOKIE = "twitok_user_session";
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 24 * 60 * 60 * 1000 };

export const authRouter = Router();
const userReadLimit = rateLimit({ windowMs: 60 * 1000, max: 120, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });
const userWriteLimit = rateLimit({ windowMs: 60 * 1000, max: 30, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });
const otpSendLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, key: req => `otp-send:${req.userId?.toHexString() ?? "anonymous"}:${req.ip ?? "unknown"}` });
const otpVerifyLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, key: req => `otp-verify:${req.userId?.toHexString() ?? "anonymous"}:${req.ip ?? "unknown"}` });


authRouter.post("/register", rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
  try {
    const { username, password, email, phone, dateOfBirth, countryCode } = req.body ?? {};
    if (!password || !dateOfBirth || !countryCode) return res.status(400).json({ error: "password, dateOfBirth and countryCode are required" });
    const db = await getDb(), user = await createUser(db, { username, password, email, phone, dateOfBirth, countryCode });
    const token = issueVerificationToken(user);
    res.status(201).json({ token, verificationRequired: true, channel: email ? "email" : "phone", user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create account";
    res.status(/duplicate|E11000|already exists/i.test(message) ? 409 : 400).json({ error: message });
  }
});

authRouter.post("/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 8, key: authRateLimit }), async (req, res) => {
  try {
    const { identifier, password } = req.body ?? {};
    if (!identifier || !password) return res.status(400).json({ error: "identifier and password are required" });
    const db = await getDb();
    const user = await authenticateUser(db, identifier, password);
    const stored = await db.collection("users").findOne(
      { _id: new (await import("mongodb")).ObjectId(user._id) },
      { projection: { emailVerified: 1, phoneVerified: 1, email: 1, phone: 1 } }
    );
    let verificationChannel: OtpChannel | null = null;
    const identifierValue = String(identifier).trim().toLowerCase();
    if (identifierValue.includes("@") && user.email && stored?.emailVerified !== true) verificationChannel = "email";
    else if (!identifierValue.includes("@") && stored?.phone && stored?.phoneVerified !== true) verificationChannel = "phone";
    else if (user.email && stored?.emailVerified !== true) verificationChannel = "email";
    else if (stored?.phone && stored?.phoneVerified !== true) verificationChannel = "phone";
    if (verificationChannel) {
      const token = issueVerificationToken(user);
      return res.json({ token, verificationRequired: true, channel: verificationChannel, user });
    }
    const token = issueUserToken(user);
    res.cookie(WEB_SESSION_COOKIE, token, cookieOptions);
    res.json({ token, verificationRequired: false, user });
  } catch { res.status(401).json({ error: "Invalid login credentials" }); }
});


authRouter.post("/password/forgot", rateLimit({ windowMs: 15 * 60 * 1000, max: 5, key: req => `password-forgot:${req.ip ?? "unknown"}` }), async (req, res) => {
  const generic = { message: "If the account exists, a password recovery code has been sent to its verified contact." };
  try {
    const identifier = String(req.body?.identifier ?? "").trim();
    if (!identifier) return res.status(200).json(generic);
    const normalized = identifier.toLowerCase();
    const db = await getDb();
    const user = await db.collection("users").findOne(
      { $or: [{ email: normalized }, { username: normalized }, { phone: identifier }] },
      { projection: { email: 1, phone: 1, emailVerified: 1, phoneVerified: 1, status: 1 } }
    );
    if (!user || user.status !== "ACTIVE") return res.status(200).json(generic);
    const channel: OtpChannel | null =
      user.email && user.emailVerified === true ? "email" :
      user.phone && user.phoneVerified === true ? "phone" : null;
    if (!channel) return res.status(200).json(generic);
    try { await sendOtp(db, user._id.toHexString(), channel, undefined, "PASSWORD_RESET"); } catch {}
    return res.status(200).json(generic);
  } catch {
    return res.status(200).json(generic);
  }
});

authRouter.post("/password/reset", rateLimit({ windowMs: 15 * 60 * 1000, max: 5, key: req => `password-reset:${req.ip ?? "unknown"}` }), async (req, res) => {
  try {
    const identifier = String(req.body?.identifier ?? "").trim();
    const channel = String(req.body?.channel ?? "").toLowerCase() as OtpChannel;
    const code = String(req.body?.code ?? "").trim();
    const newPassword = String(req.body?.newPassword ?? "");
    if (!identifier || (channel !== "email" && channel !== "phone") || !/^\d{6}$/.test(code) || newPassword.length < 12) {
      return res.status(400).json({ error: "Invalid password recovery request" });
    }
    const db = await getDb();
    const normalized = identifier.toLowerCase();
    const user = await db.collection("users").findOne(
      { $or: [{ email: normalized }, { username: normalized }, { phone: identifier }] },
      { projection: { status: 1, email: 1, phone: 1, emailVerified: 1, phoneVerified: 1 } }
    );
    if (!user || user.status !== "ACTIVE") return res.status(400).json({ error: "Invalid password recovery request" });
    const verified = channel === "email" ? user.emailVerified === true : user.phoneVerified === true;
    const contact = channel === "email" ? user.email : user.phone;
    if (!verified || !contact) return res.status(400).json({ error: "Invalid password recovery request" });
    await verifyOtp(db, user._id.toHexString(), channel, code, "PASSWORD_RESET");
    await db.collection("users").updateOne(
      { _id: user._id, status: "ACTIVE" },
      { $set: { passwordHash: await bcrypt.hash(newPassword, 12), updatedAt: new Date() }, $inc: { sessionVersion: 1 } }
    );
    res.clearCookie(WEB_SESSION_COOKIE, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
    return res.json({ reset: true, message: "Password reset successfully. Please sign in again." });
  } catch {
    return res.status(400).json({ error: "Invalid password recovery request" });
  }
});

authRouter.post("/verification/send", requireVerificationUser, otpSendLimit, async (req, res) => {
  try {
    const channel = String(req.body?.channel ?? "").toLowerCase() as OtpChannel;
    if (channel !== "email" && channel !== "phone") return res.status(400).json({ error: "channel must be email or phone" });
    const result = await sendOtp(await getDb(), req.userId!.toHexString(), channel);
    res.setHeader("Retry-After", result.retryAfterSeconds);
    return res.status(202).json({ channel: result.channel, expiresAt: result.expiresAt, retryAfterSeconds: result.retryAfterSeconds });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send verification code";
    return res.status(/too many|wait .* seconds|already verified/i.test(message) ? 429 : 400).json({ error: message });
  }
});

authRouter.post("/verification/verify", requireVerificationUser, otpVerifyLimit, async (req, res) => {
  try {
    const channel = String(req.body?.channel ?? "").toLowerCase() as OtpChannel;
    const code = String(req.body?.code ?? "").trim();
    if (channel !== "email" && channel !== "phone") return res.status(400).json({ error: "channel must be email or phone" });
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "Enter the 6-digit verification code" });
    const db = await getDb();
    const result = await verifyOtp(db, req.userId!.toHexString(), channel, code);
    const user = await db.collection("users").findOne(
      { _id: req.userId! },
      { projection: { username: 1, sessionVersion: 1, nickname: 1, email: 1, countryCode: 1, accountType: 1, monetizationEnabled: 1, isVerified: 1, verificationType: 1, isPrivate: 1, profileSetupComplete: 1 } }
    );
    if (!user) return res.status(404).json({ error: "Account not found" });
    const token = issueUserToken({
      _id: user._id.toHexString(),
      username: user.username,
      sessionVersion: Number(user.sessionVersion ?? 0)
    });
    res.cookie(WEB_SESSION_COOKIE, token, cookieOptions);
    return res.json({ ...result, token, user: { ...user, _id: user._id.toHexString() } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to verify code";
    return res.status(/too many incorrect|rate/i.test(message) ? 429 : 400).json({ error: message });
  }
});

authRouter.get("/verification/status", requireVerificationUser, userReadLimit, async (req, res) => {
  try {
    const user = await (await getDb()).collection("users").findOne(
      { _id: req.userId! },
      { projection: { emailVerified: 1, phoneVerified: 1, email: 1, phone: 1 } }
    );
    if (!user) return res.status(404).json({ error: "Account not found" });
    return res.json({
      email: user.email ? { address: user.email, verified: user.emailVerified === true } : null,
      phone: user.phone ? { verified: user.phoneVerified === true } : null
    });
  } catch {
    return res.status(500).json({ error: "Unable to read verification status" });
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
    const user = await (await getDb()).collection("users").findOne(
      { _id: req.userId! },
      { projection: { _id: 1, username: 1, nickname: 1, email: 1, phone: 1, emailVerified: 1, phoneVerified: 1, countryCode: 1, accountType: 1, monetizationEnabled: 1, isVerified: 1, verificationType: 1, isPrivate: 1, profileSetupComplete: 1, bio: 1, avatarUrl: 1, createdAt: 1, updatedAt: 1 } }
    );
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