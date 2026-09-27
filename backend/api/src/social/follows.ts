import { Db, ObjectId } from "mongodb";

export async function ensureFollowIndexes(db: Db) {
  await Promise.all([
    db.collection("follows").createIndex({ followerId: 1, followingId: 1 }, { unique: true }),
    db.collection("follows").createIndex({ followingId: 1, createdAt: -1 }),
    db.collection("follows").createIndex({ followerId: 1, createdAt: -1 })
  ]);
}

export async function getProfile(db: Db, username: string, viewerId?: ObjectId) {
  const user = await db.collection("users").findOne(
    { username: username.trim().toLowerCase(), status: "ACTIVE" },
    { projection: { passwordHash: 0, dateOfBirth: 0, email: 0, phone: 0 } }
  );
  if (!user) return null;

  const [followers, following, isFollowing] = await Promise.all([
    db.collection("follows").countDocuments({ followingId: user._id }),
    db.collection("follows").countDocuments({ followerId: user._id }),
    viewerId ? db.collection("follows").findOne({ followerId: viewerId, followingId: user._id }) : null
  ]);

  return {
    id: user._id.toHexString(),
    username: user.username,
    nickname: user.nickname,
    countryCode: user.countryCode,
    accountType: user.accountType,
    isPrivate: Boolean(user.isPrivate),
    followers,
    following,
    isFollowing: Boolean(isFollowing),
    createdAt: user.createdAt
  };
}

export async function followUser(db: Db, followerId: ObjectId, followingId: ObjectId) {
  if (followerId.equals(followingId)) throw new Error("You cannot follow yourself");
  const target = await db.collection("users").findOne({ _id: followingId, status: "ACTIVE" }, { projection: { isPrivate: 1 } });
  if (!target) throw new Error("User not found");

  const now = new Date();
  try {
    await db.collection("follows").insertOne({ followerId, followingId, createdAt: now });
  } catch (error) {
    if ((error as any)?.code === 11000) return { following: true, pending: false };
    throw error;
  }
  return { following: true, pending: Boolean(target.isPrivate) };
}

export async function unfollowUser(db: Db, followerId: ObjectId, followingId: ObjectId) {
  await db.collection("follows").deleteOne({ followerId, followingId });
  return { following: false };
}
