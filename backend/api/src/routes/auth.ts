import { Router } from "express";
import { getDb } from "../db/mongo.js";
import { authenticateUser, createUser, ensureUserIndexes, issueUserToken, verifyUserToken } from "../auth/user.js";

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  try {
    const { username, password, email, phone, dateOfBirth, countryCode } = req.body ?? {};
    if (!username || !password || !dateOfBirth || !countryCode) return res.status(400).json({ error: "username, password, dateOfBirth and countryCode are required" });
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
