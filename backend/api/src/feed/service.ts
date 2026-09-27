import { Db, ObjectId } from "mongodb";

export type FeedSurface = "FOR_YOU" | "FOLLOWING" | "AFRICA";
export type FeedEventType = "IMPRESSION" | "VIEW_START" | "VIEW_2S" | "VIEW_COMPLETE" | "REWATCH" | "LIKE" | "COMMENT" | "SHARE" | "SAVE" | "FOLLOW" | "NOT_INTERESTED";

export async function initializeFeedIndexes(db: Db) {
  await Promise.all([
    db.collection("feed_events").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("feed_events").createIndex({ videoId: 1, createdAt: -1 }),
    db.collection("video_feedback").createIndex({ userId: 1, videoId: 1, type: 1 }, { unique: true }),
    db.collection("feed_caches").createIndex({ userId: 1, surface: 1 }, { unique: true }),
    db.collection("feed_caches").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  ]);
}

export async function recordFeedEvent(db: Db, userId: ObjectId, input: { videoId: string; type: FeedEventType; watchMs?: number; sessionId?: string }) {
  if (!ObjectId.isValid(input.videoId)) throw new Error("Invalid video id");
  const videoId = new ObjectId(input.videoId);
  await db.collection("feed_events").insertOne({
    userId, videoId, type: input.type, watchMs: Math.max(0, Number(input.watchMs ?? 0)),
    sessionId: input.sessionId ? String(input.sessionId).slice(0, 128) : null, createdAt: new Date()
  });
  if (["LIKE","SAVE","NOT_INTERESTED"].includes(input.type)) {
    await db.collection("video_feedback").updateOne(
      { userId, videoId, type: input.type },
      { $set: { userId, videoId, type: input.type, createdAt: new Date() } },
      { upsert: true }
    );
  }
}

export async function getFeed(db: Db, userId: ObjectId, surface: FeedSurface, countryCode?: string, limit = 20) {
  const following = await db.collection("follows").find({ followerId: userId }).project({ followingId: 1 }).limit(5000).toArray();
  const followingIds = following.map(x => x.followingId);
  const blocked = await db.collection("blocks").find({ $or: [{ blockerId: userId }, { blockedId: userId }] }).limit(5000).toArray();
  const blockedIds = blocked.flatMap(x => [x.blockerId, x.blockedId]).filter(Boolean);
  const feedback = await db.collection("video_feedback").find({ userId, type: "NOT_INTERESTED" }).project({ videoId: 1 }).limit(5000).toArray();
  const excluded = [...blockedIds, ...feedback.map(x => x.videoId)];
  const query: any = { status: "PUBLISHED", visibility: "PUBLIC", ownerId: { $nin: excluded } };
  if (surface === "FOLLOWING") query.ownerId = { $in: followingIds.filter((id: ObjectId) => !excluded.some((x: ObjectId) => x.equals(id))) };
  if (surface === "AFRICA" && countryCode) query.countryCode = String(countryCode).toUpperCase();
  const videos = await db.collection("videos").find(query).sort({ publishedAt: -1, _id: -1 }).limit(Math.min(Math.max(limit, 1), 20)).toArray();
  return videos.map(v => ({ id: v._id.toHexString(), ownerId: v.ownerId?.toHexString?.() ?? String(v.ownerId), caption: v.caption ?? "", hashtags: v.hashtags ?? [], playback: v.playback ?? null, thumbnail: v.thumbnail ?? null, autoCaptionsUrl: v.autoCaptionsUrl ?? null, autoCaptionsStatus: v.autoCaptionsStatus ?? null, publishedAt: v.publishedAt ?? null }));
}
