import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { blockUser, followUser, getProfile, removeFollower, respondToFollowRequest, unfollowUser, unblockUser } from "../social/follows.js";
import { verifyUserToken } from "../auth/user.js";
import { createPresignedPlayback, createPresignedUpload, mediaConfigured } from "../media/storage.js";

export const profileRouter = Router();


profileRouter.patch("/me", requireUser, async (req, res) => {
  try {
    const username = String(req.body?.username ?? "").trim().toLowerCase();
    const nickname = String(req.body?.nickname ?? "").trim();
    const bio = String(req.body?.bio ?? "").trim();
    const isPrivate = Boolean(req.body?.isPrivate);
    const current = await db.collection("users").findOne({ _id: req.userId! }, { projection: { username: 1, nickname: 1, nameLastChangedAt: 1 } });
    const nameChanged = username !== current?.username || nickname !== current?.nickname;
    if (nameChanged && current?.nameLastChangedAt) {
      const nextAllowed = new Date(new Date(current.nameLastChangedAt).getTime() + 60 * 24 * 60 * 60 * 1000);
      if (new Date() < nextAllowed) return res.status(429).json({ error: "You can change your name again after 60 days", nextNameChangeAt: nextAllowed.toISOString() });
    }
    if (!/^[a-z0-9._]{3,24}$/.test(username) || username.endsWith(".")) return res.status(400).json({ error: "Invalid username" });
    if (!nickname || nickname.length > 50) return res.status(400).json({ error: "Nickname is required and must be 1-50 characters" });
    if (bio.length > 80) return res.status(400).json({ error: "Bio must be 80 characters or less" });
    const db = await getDb();
    const existing = await db.collection("users").findOne({ username, _id: { $ne: req.userId! } }, { projection: { _id: 1 } });
    if (existing) return res.status(409).json({ error: "That username is already taken" });
    await db.collection("users").updateOne({ _id: req.userId! }, { $set: { username, nickname, bio, isPrivate, profileSetupComplete: true, ...(nameChanged ? { nameLastChangedAt: new Date() } : {}), updatedAt: new Date() } });
    const user = await db.collection("users").findOne({ _id: req.userId! }, { projection: { passwordHash: 0 } });
    res.json({ user });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to update profile" }); }
});

profileRouter.post("/me/photo-upload-url", requireUser, async (req, res) => {
  try {
    const mimeType = String(req.body?.mimeType ?? "");
    if (!/^image\/(jpeg|png|webp)$/i.test(mimeType)) return res.status(400).json({ error: "Profile photo must be JPEG, PNG or WebP" });
    if (!mediaConfigured()) throw new Error("Media storage is not configured");
    const objectKey = `profile-photos/${req.userId!.toHexString()}/${new ObjectId().toHexString()}`;
    const signed = await createPresignedUpload({ objectKey, mimeType, expiresInSeconds: 900 });
    await (await getDb()).collection("users").updateOne({ _id: req.userId! }, { $set: { profilePhotoKey: objectKey, updatedAt: new Date() } });
    res.json({ objectKey, uploadUrl: signed.url, expiresInSeconds: signed.expiresInSeconds });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to prepare profile photo upload" }); }
});

profileRouter.get("/:username/videos", async (req, res) => {
  try {
    const db = await getDb();
    const owner = await db.collection("users").findOne({ username: String(req.params.username).trim().toLowerCase(), status: "ACTIVE" }, { projection: { _id: 1, isPrivate: 1 } });
    if (!owner) return res.status(404).json({ error: "User not found" });
    let viewerId: ObjectId | undefined;
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) { try { viewerId = new ObjectId(verifyUserToken(header.slice(7)).sub); } catch {} }
    const following = viewerId ? Boolean(await db.collection("follows").findOne({ followerId: viewerId, followingId: owner._id })) : false;
    if (owner.isPrivate && !viewerId?.equals(owner._id) && !following) return res.json({ videos: [] });
    const videos = await db.collection("videos").find({ ownerId: owner._id, status: "PUBLISHED", visibility: "PUBLIC" }).sort({ publishedAt: -1 }).limit(60).project({ _id: 1, playback: 1, thumbnail: 1, caption: 1, publishedAt: 1 }).toArray();
    res.json({ videos: videos.map(v => ({ id: v._id.toHexString(), playback: v.playback ?? null, thumbnail: v.thumbnail ?? null, caption: v.caption ?? "", publishedAt: v.publishedAt ?? null })) });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to load creator videos" }); }
});


profileRouter.post("/:username/follow", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const target = await db.collection("users").findOne({ username: String(req.params.username).trim().toLowerCase(), status: "ACTIVE" }, { projection: { _id: 1 } });
    if (!target) return res.status(404).json({ error: "User not found" });
    res.json(await followUser(db, req.userId!, target._id));
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Unable to follow user" }); }
});

profileRouter.delete("/:username/follow", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const target = await db.collection("users").findOne({ username: String(req.params.username).trim().toLowerCase(), status: "ACTIVE" }, { projection: { _id: 1 } });
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
  try { res.json(await respondToFollowRequest(await getDb(), req.userId!, new ObjectId(String(req.params.requesterId)), true)); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to approve request" }); }
});

profileRouter.post("/requests/:requesterId/reject", requireUser, async (req, res) => {
  try { res.json(await respondToFollowRequest(await getDb(), req.userId!, new ObjectId(String(req.params.requesterId)), false)); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to reject request" }); }
});

profileRouter.delete("/:username/followers/:followerId", requireUser, async (req, res) => {
  try { res.json(await removeFollower(await getDb(), req.userId!, new ObjectId(String(req.params.followerId)))); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to remove follower" }); }
});

profileRouter.post("/:username/block", requireUser, async (req, res) => {
  try {
    const target = await (await getDb()).collection("users").findOne({ username: String(req.params.username).trim().toLowerCase(), status: "ACTIVE" }, { projection: { _id: 1 } });
    if (!target) return res.status(404).json({ error: "User not found" });
    res.json(await blockUser(await getDb(), req.userId!, target._id));
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to block user" }); }
});

profileRouter.delete("/:username/block", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const target = await db.collection("users").findOne({ username: String(req.params.username).trim().toLowerCase(), status: "ACTIVE" }, { projection: { _id: 1 } });
    if (!target) return res.status(404).json({ error: "User not found" });
    res.json(await unblockUser(db, req.userId!, target._id));
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to unblock user" }); }
});

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
