import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { blockUser, followUser, getProfile, removeFollower, respondToFollowRequest, unfollowUser, unblockUser } from "../social/follows.js";
import { verifyUserToken } from "../auth/user.js";

export const profileRouter = Router();

profileRouter.get("/:username", async (req, res) => {
  try {
    const db = await getDb();
    let viewerId: ObjectId | undefined;
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) { try { viewerId = new ObjectId(verifyUserToken(header.slice(7)).sub); } catch {} }
    const profile = await getProfile(db, req.params.username, viewerId);
    if (!profile || ("unavailable" in profile && profile.unavailable)) return res.status(404).json({ error: "Profile not available" });
    res.json({ profile });
  } catch { res.status(500).json({ error: "Unable to load profile" }); }
});

profileRouter.post("/:username/follow", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const target = await db.collection("users").findOne({ username: req.params.username.trim().toLowerCase(), status: "ACTIVE" }, { projection: { _id: 1 } });
    if (!target) return res.status(404).json({ error: "User not found" });
    res.json(await followUser(db, req.userId!, target._id));
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Unable to follow user" }); }
});

profileRouter.delete("/:username/follow", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const target = await db.collection("users").findOne({ username: req.params.username.trim().toLowerCase(), status: "ACTIVE" }, { projection: { _id: 1 } });
    if (!target) return res.status(404).json({ error: "User not found" });
    res.json(await unfollowUser(db, req.userId!, target._id));
  } catch { res.status(400).json({ error: "Unable to unfollow user" }); }
});

profileRouter.get("/requests/incoming", requireUser, async (req, res) => {
  const db = await getDb();
  const requests = await db.collection("follow_requests").find({ targetId: req.userId!, status: "PENDING" }).sort({ createdAt: -1 }).limit(100).toArray();
  res.json({ requests });
});

profileRouter.post("/requests/:requesterId/approve", requireUser, async (req, res) => {
  try { res.json(await respondToFollowRequest(await getDb(), req.userId!, new ObjectId(req.params.requesterId), true)); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to approve request" }); }
});

profileRouter.post("/requests/:requesterId/reject", requireUser, async (req, res) => {
  try { res.json(await respondToFollowRequest(await getDb(), req.userId!, new ObjectId(req.params.requesterId), false)); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to reject request" }); }
});

profileRouter.delete("/:username/followers/:followerId", requireUser, async (req, res) => {
  try { res.json(await removeFollower(await getDb(), req.userId!, new ObjectId(req.params.followerId))); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to remove follower" }); }
});

profileRouter.post("/:username/block", requireUser, async (req, res) => {
  try {
    const target = await (await getDb()).collection("users").findOne({ username: req.params.username.trim().toLowerCase(), status: "ACTIVE" }, { projection: { _id: 1 } });
    if (!target) return res.status(404).json({ error: "User not found" });
    res.json(await blockUser(await getDb(), req.userId!, target._id));
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to block user" }); }
});

profileRouter.delete("/:username/block", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const target = await db.collection("users").findOne({ username: req.params.username.trim().toLowerCase(), status: "ACTIVE" }, { projection: { _id: 1 } });
    if (!target) return res.status(404).json({ error: "User not found" });
    res.json(await unblockUser(db, req.userId!, target._id));
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to unblock user" }); }
});
