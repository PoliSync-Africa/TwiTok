import { Db, ObjectId } from "mongodb";

export type FollowState = "FOLLOWING" | "PENDING";

export async function ensureFollowIndexes(db: Db) {
  await Promise.all([
    db.collection("follows").createIndex({ followerId: 1, followingId: 1 }, { unique: true }),
    db.collection("follows").createIndex({ followingId: 1, createdAt: -1 }),
    db.collection("follows").createIndex({ followerId: 1, createdAt: -1 }),
    db.collection("follow_requests").createIndex({ requesterId: 1, targetId: 1 }, { unique: true }),
    db.collection("follow_requests").createIndex({ targetId: 1, createdAt: -1 }),
    db.collection("blocks").createIndex({ blockerId: 1, blockedId: 1 }, { unique: true }),
    db.collection("blocks").createIndex({ blockedId: 1, createdAt: -1 })
  ]);
}

export async function isBlockedEitherWay(db: Db, a: ObjectId, b: ObjectId) {
  return Boolean(await db.collection("blocks").findOne({
    $or: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }]
  }));
}

export async function getProfile(db: Db, username: string, viewerId?: ObjectId) {
  const user = await db.collection("users").findOne(
    { username: username.trim().toLowerCase(), status: "ACTIVE" },
    { projection: { passwordHash: 0, dateOfBirth: 0, email: 0, phone: 0 } }
  );
  if (!user) return null;

  const blocked = viewerId ? await isBlockedEitherWay(db, viewerId, user._id) : false;
  if (blocked && !viewerId?.equals(user._id)) return { unavailable: true };

  const [followers, following, relationship] = await Promise.all([
    db.collection("follows").countDocuments({ followingId: user._id }),
    db.collection("follows").countDocuments({ followerId: user._id }),
    viewerId ? db.collection("follows").findOne({ followerId: viewerId, followingId: user._id }) : null
  ]);
  const pending = viewerId ? Boolean(await db.collection("follow_requests").findOne({ requesterId: viewerId, targetId: user._id, status: "PENDING" })) : false;

  return {
    id: user._id.toHexString(), username: user.username, nickname: user.nickname,
    countryCode: user.countryCode, accountType: user.accountType, isPrivate: Boolean(user.isPrivate),
    followers, following, isFollowing: Boolean(relationship), followPending: pending, createdAt: user.createdAt
  };
}

export async function followUser(db: Db, followerId: ObjectId, followingId: ObjectId) {
  if (followerId.equals(followingId)) throw new Error("You cannot follow yourself");
  if (await isBlockedEitherWay(db, followerId, followingId)) throw new Error("You cannot follow this account");

  const target = await db.collection("users").findOne({ _id: followingId, status: "ACTIVE" }, { projection: { isPrivate: 1 } });
  if (!target) throw new Error("User not found");
  if (target.isPrivate) {
    const existing = await db.collection("follow_requests").findOne({ requesterId: followerId, targetId: followingId, status: "PENDING" });
    if (existing) return { following: false, pending: true };
    await db.collection("follow_requests").insertOne({ requesterId: followerId, targetId: followingId, status: "PENDING", createdAt: new Date() });
    return { following: false, pending: true };
  }
  await db.collection("follows").updateOne({ followerId, followingId }, { $setOnInsert: { followerId, followingId, createdAt: new Date() } }, { upsert: true });
  return { following: true, pending: false };
}

export async function unfollowUser(db: Db, followerId: ObjectId, followingId: ObjectId) {
  await db.collection("follows").deleteOne({ followerId, followingId });
  await db.collection("follow_requests").deleteOne({ requesterId: followerId, targetId: followingId, status: "PENDING" });
  return { following: false, pending: false };
}

export async function respondToFollowRequest(db: Db, targetId: ObjectId, requesterId: ObjectId, approve: boolean) {
  const request = await db.collection("follow_requests").findOne({ requesterId, targetId, status: "PENDING" });
  if (!request) throw new Error("Follow request not found");
  if (approve) await db.collection("follows").updateOne({ followerId: requesterId, followingId: targetId }, { $setOnInsert: { followerId: requesterId, followingId: targetId, createdAt: new Date() } }, { upsert: true });
  await db.collection("follow_requests").updateOne({ _id: request._id }, { $set: { status: approve ? "APPROVED" : "REJECTED", resolvedAt: new Date() } });
  return { approved: approve };
}

export async function removeFollower(db: Db, ownerId: ObjectId, followerId: ObjectId) {
  await db.collection("follows").deleteOne({ followerId, followingId: ownerId });
  return { removed: true };
}

export async function blockUser(db: Db, blockerId: ObjectId, blockedId: ObjectId) {
  if (blockerId.equals(blockedId)) throw new Error("You cannot block yourself");
  await db.collection("blocks").updateOne({ blockerId, blockedId }, { $setOnInsert: { blockerId, blockedId, createdAt: new Date() } }, { upsert: true });
  await db.collection("follows").deleteMany({ $or: [{ followerId: blockerId, followingId: blockedId }, { followerId: blockedId, followingId: blockerId }] });
  await db.collection("follow_requests").deleteMany({ $or: [{ requesterId: blockerId, targetId: blockedId }, { requesterId: blockedId, targetId: blockerId }] });
  return { blocked: true };
}

export async function unblockUser(db: Db, blockerId: ObjectId, blockedId: ObjectId) {
  await db.collection("blocks").deleteOne({ blockerId, blockedId });
  return { blocked: false };
}
