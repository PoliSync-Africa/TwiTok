import { ObjectId, type Db } from "mongodb";
import { createNotification } from "./notifications.js";

function videoObjectId(videoId: string) {
  if (!ObjectId.isValid(videoId)) throw new Error("Invalid video id");
  return new ObjectId(videoId);
}

async function getPublicVideo(db: Db, videoId: ObjectId) {
  const video = await db.collection("videos").findOne(
    { _id: videoId, status: "PUBLISHED", visibility: "PUBLIC" },
    { projection: { _id: 1, allowComments: 1, ownerId: 1 } }
  );
  if (!video) throw new Error("Video not found");
  return video;
}

export async function initializeEngagementIndexes(db: Db) {
  await Promise.all([
    db.collection("video_likes").createIndex({ videoId: 1, userId: 1 }, { unique: true }),
    db.collection("video_likes").createIndex({ videoId: 1, createdAt: -1 }),
    db.collection("video_saves").createIndex({ videoId: 1, userId: 1 }, { unique: true }),
    db.collection("video_saves").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("video_comments").createIndex({ videoId: 1, createdAt: -1 }),
    db.collection("video_comments").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("video_shares").createIndex({ videoId: 1, createdAt: -1 }),
    db.collection("video_reposts").createIndex({ videoId: 1, userId: 1 }, { unique: true }),
    db.collection("video_reposts").createIndex({ videoId: 1, createdAt: -1 })
  ]);
}

export async function getEngagement(db: Db, userId: ObjectId, videoIdString: string) {
  const videoId = videoObjectId(videoIdString);
  await getPublicVideo(db, videoId);
  const [likes, comments, shares, saves, reposts, liked, saved, reposted] = await Promise.all([
    db.collection("video_likes").countDocuments({ videoId }),
    db.collection("video_comments").countDocuments({ videoId, status: { $ne: "DELETED" } }),
    db.collection("video_shares").countDocuments({ videoId }),
    db.collection("video_saves").countDocuments({ videoId }),
    db.collection("video_reposts").countDocuments({ videoId }),
    db.collection("video_likes").findOne({ videoId, userId }, { projection: { _id: 1 } }),
    db.collection("video_saves").findOne({ videoId, userId }, { projection: { _id: 1 } }),
    db.collection("video_reposts").findOne({ videoId, userId }, { projection: { _id: 1 } })
  ]);
  return { likeCount: likes, commentCount: comments, shareCount: shares, saveCount: saves, repostCount: reposts, liked: Boolean(liked), saved: Boolean(saved), reposted: Boolean(reposted) };
}

export async function toggleLike(db: Db, userId: ObjectId, videoIdString: string) {
  const videoId = videoObjectId(videoIdString);
  await getPublicVideo(db, videoId);
  const existing = await db.collection("video_likes").findOne({ videoId, userId }, { projection: { _id: 1 } });
  if (existing) {
    await db.collection("video_likes").deleteOne({ _id: existing._id });
    return { liked: false };
  }
  await db.collection("video_likes").insertOne({ videoId, userId, createdAt: new Date() });
  const video = await getPublicVideo(db, videoId);
  if (video.ownerId) await createNotification(db, { recipientId: video.ownerId, actorId: userId, type: "LIKE", videoId });
  return { liked: true };
}

export async function toggleSave(db: Db, userId: ObjectId, videoIdString: string) {
  const videoId = videoObjectId(videoIdString);
  await getPublicVideo(db, videoId);
  const existing = await db.collection("video_saves").findOne({ videoId, userId }, { projection: { _id: 1 } });
  if (existing) {
    await db.collection("video_saves").deleteOne({ _id: existing._id });
    return { saved: false };
  }
  await db.collection("video_saves").insertOne({ videoId, userId, createdAt: new Date() });
  return { saved: true };
}

export async function addComment(db: Db, userId: ObjectId, videoIdString: string, text: string) {
  const videoId = videoObjectId(videoIdString);
  const video = await getPublicVideo(db, videoId);
  if (video.allowComments === false) throw new Error("Comments are disabled for this video");
  const body = String(text ?? "").trim();
  if (!body) throw new Error("Comment cannot be empty");
  if (body.length > 500) throw new Error("Comment is limited to 500 characters");
  const createdAt = new Date();
  const result = await db.collection("video_comments").insertOne({
    videoId, userId, text: body, status: "ACTIVE", createdAt, updatedAt: createdAt
  });
  if (video.ownerId) await createNotification(db, { recipientId: video.ownerId, actorId: userId, type: "COMMENT", videoId, commentId: result.insertedId });
  return { id: result.insertedId.toHexString(), userId: userId.toHexString(), text: body, createdAt };
}

export async function listComments(db: Db, videoIdString: string, limit = 30) {
  const videoId = videoObjectId(videoIdString);
  await getPublicVideo(db, videoId);
  const safeLimit = Math.min(Math.max(Number.isFinite(limit) ? limit : 30, 1), 100);
  const comments = await db.collection("video_comments").find({ videoId, status: { $ne: "DELETED" } }).sort({ createdAt: -1 }).limit(safeLimit).toArray();
  return comments.map(comment => ({
    id: comment._id.toHexString(),
    userId: comment.userId.toHexString(),
    text: comment.text,
    createdAt: comment.createdAt
  }));
}

export async function recordShare(db: Db, userId: ObjectId, videoIdString: string) {
  const videoId = videoObjectId(videoIdString);
  await getPublicVideo(db, videoId);
  await db.collection("video_shares").insertOne({ videoId, userId, createdAt: new Date() });
  return { shared: true };
}

export async function toggleRepost(db: Db, userId: ObjectId, videoIdString: string) {
  const videoId = videoObjectId(videoIdString);
  const video = await getPublicVideo(db, videoId);
  const existing = await db.collection("video_reposts").findOne({ videoId, userId }, { projection: { _id: 1 } });
  if (existing) {
    await db.collection("video_reposts").deleteOne({ _id: existing._id });
    return { reposted: false };
  }
  await db.collection("video_reposts").insertOne({ videoId, userId, createdAt: new Date() });
  if (video.ownerId) await createNotification(db, { recipientId: video.ownerId, actorId: userId, type: "REPOST", videoId });
  return { reposted: true };
}
