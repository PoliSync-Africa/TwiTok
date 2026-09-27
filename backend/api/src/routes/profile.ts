import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { followUser, getProfile, unfollowUser } from "../social/follows.js";

export const profileRouter = Router();

profileRouter.get("/:username", async (req, res) => {
  try {
    const db = await getDb();
    const viewerId = req.headers.authorization?.startsWith("Bearer ")
      ? (() => { try { return new ObjectId(JSON.parse(Buffer.from(req.headers.authorization.slice(7).split(".")[1], "base64url").toString()).sub); } catch { return undefined; } })()
      : undefined;
    const profile = await getProfile(db, req.params.username, viewerId);
    if (!profile) return res.status(404).json({ error: "Profile not found" });
    res.json({ profile });
  } catch {
    res.status(500).json({ error: "Unable to load profile" });
  }
});

profileRouter.post("/:username/follow", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const target = await db.collection("users").findOne({ username: req.params.username.trim().toLowerCase(), status: "ACTIVE" }, { projection: { _id: 1 } });
    if (!target) return res.status(404).json({ error: "User not found" });
    res.json(await followUser(db, req.userId!, target._id));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Unable to follow user" });
  }
});

profileRouter.delete("/:username/follow", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const target = await db.collection("users").findOne({ username: req.params.username.trim().toLowerCase(), status: "ACTIVE" }, { projection: { _id: 1 } });
    if (!target) return res.status(404).json({ error: "User not found" });
    res.json(await unfollowUser(db, req.userId!, target._id));
  } catch {
    res.status(400).json({ error: "Unable to unfollow user" });
  }
});
