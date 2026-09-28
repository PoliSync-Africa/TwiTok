import { ObjectId, type Db } from "mongodb";

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

export async function initializeStoryIndexes(db: Db) {
  await Promise.all([
    db.collection("stories").createIndex({ ownerId: 1, createdAt: -1 }),
    db.collection("stories").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("story_views").createIndex({ storyId: 1, viewerId: 1 }, { unique: true }),
    db.collection("story_views").createIndex({ viewerId: 1, createdAt: -1 })
  ]);
}

export async function createStoryFromVideo(db: Db, userId: ObjectId, videoId: string) {
  if (!ObjectId.isValid(videoId)) throw new Error("Invalid video id");
  const video = await db.collection("videos").findOne({ _id: new ObjectId(videoId), ownerId: userId, status: "PUBLISHED", visibility: "PUBLIC" });
  if (!video) throw new Error("Published video not found");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + STORY_TTL_MS);
  const result = await db.collection("stories").insertOne({
    ownerId: userId, videoId: video._id, playback: video.playback ?? null,
    thumbnail: video.thumbnail ?? null, caption: video.caption ?? "",
    createdAt: now, expiresAt
  });
  return { id: result.insertedId.toHexString(), videoId: video._id.toHexString(), playback: video.playback ?? null, thumbnail: video.thumbnail ?? null, caption: video.caption ?? "", createdAt: now, expiresAt };
}

export async function listStories(db: Db, userId: ObjectId) {
  const following = await db.collection("follows").find({ followerId: userId }).project({ followingId: 1 }).limit(5000).toArray();
  const ownerIds = [userId, ...following.map(x => x.followingId)];
  const blocked = await db.collection("blocks").find({ $or: [{ blockerId: userId }, { blockedId: userId }] }).project({ blockerId: 1, blockedId: 1 }).limit(5000).toArray();
  const blockedIds = new Set(blocked.flatMap(x => [x.blockerId?.toHexString?.(), x.blockedId?.toHexString?.()]).filter(Boolean));
  const eligible = ownerIds.filter(id => !blockedIds.has(id.toHexString()));
  const stories = await db.collection("stories").aggregate([
    { $match: { ownerId: { $in: eligible }, expiresAt: { $gt: new Date() } } },
    { $sort: { createdAt: 1 } },
    { $lookup: { from: "users", localField: "ownerId", foreignField: "_id", as: "owner" } },
    { $unwind: { path: "$owner", preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "story_views", let: { storyId: "$_id" }, pipeline: [{ $match: { viewerId: userId } }, { $match: { $expr: { $eq: ["$storyId", "$$storyId"] } } }], as: "viewed" } }
  ]).toArray();
  return stories.map(s => ({
    id: s._id.toHexString(), ownerId: s.ownerId.toHexString(),
    username: s.owner?.username ?? "", nickname: s.owner?.nickname ?? "",
    playback: s.playback ?? null, thumbnail: s.thumbnail ?? null, caption: s.caption ?? "",
    createdAt: s.createdAt, expiresAt: s.expiresAt, viewed: s.viewed.length > 0
  }));
}

export async function markStoryViewed(db: Db, userId: ObjectId, storyId: string) {
  if (!ObjectId.isValid(storyId)) throw new Error("Invalid story id");
  const story = await db.collection("stories").findOne({ _id: new ObjectId(storyId), expiresAt: { $gt: new Date() } });
  if (!story) throw new Error("Story not found");
  if (await db.collection("blocks").findOne({ $or: [{ blockerId: userId, blockedId: story.ownerId }, { blockerId: story.ownerId, blockedId: userId }] })) return { viewed: false };
  await db.collection("story_views").updateOne({ storyId: story._id, viewerId: userId }, { $setOnInsert: { storyId: story._id, viewerId: userId, createdAt: new Date() } }, { upsert: true });
  return { viewed: true };
}
