import { Router } from "express";
import { getDb } from "../db/mongo.js";
import { authenticateUser, createUser, issueUserToken, verifyUserToken } from "../auth/user.js";
import { requireUser } from "../auth/middleware.js";
import { rateLimit, authRateLimit } from "../security/rate-limit.js";

const WEB_SESSION_COOKIE = "twitok_user_session";
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 24 * 60 * 60 };

export const authRouter = Router();


authRouter.post("/register", rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
  try {
    const { username, password, email, phone, dateOfBirth, countryCode } = req.body ?? {};
    if (!password || !dateOfBirth || !countryCode) return res.status(400).json({ error: "password, dateOfBirth and countryCode are required" });
    const db = await getDb(), user = await createUser(db, { username, password, email, phone, dateOfBirth, countryCode });
    const token = issueUserToken(user);
    res.status(201).json({ token, user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create account";
    res.status(/duplicate|E11000|already exists/i.test(message) ? 409 : 400).json({ error: message });
  }
});

authRouter.post("/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 8, key: authRateLimit }), async (req, res) => {
  try {
    const { identifier, password } = req.body ?? {};
    if (!identifier || !password) return res.status(400).json({ error: "identifier and password are required" });
    const user = await authenticateUser(await getDb(), identifier, password);
    const token = issueUserToken(user);
    res.cookie(WEB_SESSION_COOKIE, token, cookieOptions);
    res.json({ token, user });
  } catch { res.status(401).json({ error: "Invalid login credentials" }); }
});

authRouter.post("/logout", requireUser, async (req, res) => {
  try {
    await (await getDb()).collection("users").updateOne({ _id: req.userId! }, { $inc: { sessionVersion: 1 }, $set: { updatedAt: new Date() } });
    return res.status(204).send();
  } catch { return res.status(500).json({ error: "Unable to end session" }); }
});

authRouter.get("/me", requireUser, async (req, res) => {
  try {
    const user = await (await getDb()).collection("users").findOne({ _id: req.userId! }, { projection: { passwordHash: 0 } });
    if (!user) return res.status(404).json({ error: "Account not found" });
    res.json({ user });
  } catch { res.status(401).json({ error: "Invalid or expired session" }); }
});

authRouter.patch("/profile-setup", requireUser, async (req, res) => {
  try {
    const username = String(req.body?.username ?? "").trim().toLowerCase(), nickname = String(req.body?.nickname ?? "").trim(), bio = String(req.body?.bio ?? "").trim(), isPrivate = Boolean(req.body?.isPrivate);
    if (!/^[a-z0-9._]{3,24}$/.test(username) || username.endsWith(".")) return res.status(400).json({ error: "Username must be 3-24 characters, use letters, numbers, dots or underscores, and not end with a dot" });
    if (!nickname || nickname.length > 50) return res.status(400).json({ error: "Nickname is required and must be 1-50 characters" });
    if (bio.length > 80) return res.status(400).json({ error: "Bio must be 80 characters or less" });
    const db = await getDb(), current = await db.collection("users").findOne({ _id: req.userId! }, { projection: { username: 1, nickname: 1, nameLastChangedAt: 1 } });
    const nameChanged = username !== current?.username || nickname !== current?.nickname;
    if (nameChanged && current?.nameLastChangedAt) {
      const nextAllowed = new Date(new Date(current.nameLastChangedAt).getTime() + 28 * 24 * 60 * 60 * 1000);
      if (new Date() < nextAllowed) return res.status(429).json({ error: "You can change your name again after 28 days", nextNameChangeAt: nextAllowed.toISOString() });
    }
    if (await db.collection("users").findOne({ username, _id: { $ne: req.userId! } }, { projection: { _id: 1 } })) return res.status(409).json({ error: "That username is already taken" });
    await db.collection("users").updateOne({ _id: req.userId! }, { $set: { username, nickname, bio, isPrivate, profileSetupComplete: true, ...(nameChanged ? { nameLastChangedAt: new Date() } : {}), updatedAt: new Date() } });
    const user = await db.collection("users").findOne({ _id: req.userId! }, { projection: { passwordHash: 0 } });
    if (!user) return res.status(404).json({ error: "Account not found" });
    res.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to complete profile setup";
    res.status(/duplicate|E11000/i.test(message) ? 409 : 400).json({ error: message });
  }
});

authRouter.patch("/comment-settings", requireUser, async (req, res) => {
  try {
    const settings = { allowComments: req.body?.allowComments !== false, filterAll: Boolean(req.body?.filterAll), filterSpam: req.body?.filterSpam !== false, filterKeywords: Array.isArray(req.body?.filterKeywords) ? [...new Set(req.body.filterKeywords.map((x: unknown) => String(x).trim().toLowerCase()).filter(Boolean))].slice(0, 100) : [] };
    await (await getDb()).collection("users").updateOne({ _id: req.userId! }, { $set: { commentSettings: settings, updatedAt: new Date() } });
    res.json({ commentSettings: settings });
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Unable to update comment settings" }); }
});