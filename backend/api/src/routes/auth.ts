import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo.js";
import { authenticateUser, createUser, issueUserToken, verifyUserToken } from "../auth/user.js";
import { requireUser } from "../auth/middleware.js";

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  try {
    const { username, password, email, phone, dateOfBirth, countryCode } = req.body ?? {};
    if (!password || !dateOfBirth || !countryCode) return res.status(400).json({ error: "password, dateOfBirth and countryCode are required" });
    const db = await getDb();
    const user = await createUser(db, { username, password, email, phone, dateOfBirth, countryCode });
    const token = issueUserToken(user);
    res.status(201).json({ token, user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create account";
    const status = /duplicate|E11000|already exists/i.test(message) ? 409 : 400;
    res.status(status).json({ error: message });
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    const { identifier, password } = req.body ?? {};
    if (!identifier || !password) return res.status(400).json({ error: "identifier and password are required" });
    const db = await getDb();
    const user = await authenticateUser(db, identifier, password);
    res.json({ token: issueUserToken(user), user });
  } catch (error) {
    res.status(401).json({ error: error instanceof Error ? error.message : "Invalid login credentials" });
  }
});

authRouter.get("/me", async (req, res) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Authorization required" });
    const token = verifyUserToken(header.slice(7));
    const db = await getDb();
    const { passwordHash: _passwordHash, ...user } = await db.collection("users").findOne({ _id: new (await import("mongodb")).ObjectId(token.sub) }) as any;
    res.json({ user });
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
});


authRouter.patch("/profile-setup", requireUser, async (req, res) => {
  try {
    const username = String(req.body?.username ?? "").trim().toLowerCase();
    const nickname = String(req.body?.nickname ?? "").trim();
    const bio = String(req.body?.bio ?? "").trim();
    const isPrivate = Boolean(req.body?.isPrivate);
    if (!/^[a-z0-9._]{3,24}$/.test(username) || username.endsWith(".")) return res.status(400).json({ error: "Username must be 3-24 characters, use letters, numbers, dots or underscores, and not end with a dot" });
    if (!nickname || nickname.length > 50) return res.status(400).json({ error: "Nickname is required and must be 1-50 characters" });
    if (bio.length > 80) return res.status(400).json({ error: "Bio must be 80 characters or less" });
    const db = await getDb();
    const current = await db.collection("users").findOne({ _id: req.userId! }, { projection: { username: 1, nickname: 1, nameLastChangedAt: 1 } });
    const nameChanged = username !== current?.username || nickname !== current?.nickname;
    if (nameChanged && current?.nameLastChangedAt) {
      const nextAllowed = new Date(new Date(current.nameLastChangedAt).getTime() + 28 * 24 * 60 * 60 * 1000);
      if (new Date() < nextAllowed) return res.status(429).json({ error: "You can change your name again after 28 days", nextNameChangeAt: nextAllowed.toISOString() });
    }
    const existing = await db.collection("users").findOne({ username, _id: { $ne: req.userId! } }, { projection: { _id: 1 } });
    if (existing) return res.status(409).json({ error: "That username is already taken" });
    await db.collection("users").updateOne({ _id: req.userId! }, { $set: { username, nickname, bio, isPrivate, profileSetupComplete: true, ...(nameChanged ? { nameLastChangedAt: new Date() } : {}), updatedAt: new Date() } });
    const user = await db.collection("users").findOne({ _id: req.userId! }, { projection: { passwordHash: 0 } });
    if (!user) return res.status(404).json({ error: "Account not found" });
    res.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to complete profile setup";
    res.status(/duplicate|E11000/i.test(message) ? 409 : 400).json({ error: message });
  }
});
