import { ObjectId, type Db } from "mongodb";
import { createPresignedPlayback, mediaConfigured } from "../media/storage.js";

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

export async function getFeed(db: Db, userId: ObjectId, surface: FeedSurface, countryCode?: string, limit = 20, cursor?: string) {
  const following = await db.collection("follows").find({ followerId: userId }).project({ followingId: 1 }).limit(5000).toArray();
  const followingIds = following.map(x => x.followingId);
  const blocked = await db.collection("blocks").find({ $or: [{ blockerId: userId }, { blockedId: userId }] }).limit(5000).toArray();
  const blockedIds = blocked.flatMap(x => [x.blockerId, x.blockedId]).filter(Boolean);
  const feedback = await db.collection("video_feedback").find({ userId, type: "NOT_INTERESTED" }).project({ videoId: 1 }).limit(5000).toArray();
  const blockedOwnerIds = blockedIds;
  const excludedVideoIds = feedback.map(x => x.videoId);
  const query: any = { status: "PUBLISHED", visibility: "PUBLIC", ownerId: { $nin: blockedOwnerIds }, _id: { $nin: excludedVideoIds } };
  if (surface === "FOLLOWING") query.ownerId = { $in: followingIds.filter((id: ObjectId) => !blockedOwnerIds.some((x: ObjectId) => x.equals(id))) };
  if (surface === "AFRICA" && countryCode) query.countryCode = String(countryCode).toUpperCase();
  const safeLimit = Math.min(Math.max(Number.isFinite(limit) ? limit : 20, 1), 20);
  const videos = await db.collection("videos").aggregate([
    { $match: query },
    { $lookup: { from: "feed_events", let: { videoId: "$_id" }, pipeline: [
      { $match: { userId } },
      { $match: { $expr: { $eq: ["$videoId", "$videoId"] } } },
      { $group: { _id: null, count: { $sum: 1 }, totalWatchMs: { $sum: { $ifNull: ["$watchMs", 0] } }, latest: { $max: "$createdAt" } } }
    ], as: "viewerEvents" } },
    { $addFields: {
      _engagement: { $add: [
        { $multiply: [{ $ifNull: [{ $arrayElemAt: ["$viewerEvents.count", 0] }, 0] }, 0.5] },
        { $multiply: [{ $ifNull: [{ $arrayElemAt: ["$viewerEvents.totalWatchMs", 0] }, 0] }, 0.00005] }
      ] },
      _freshness: { $divide: [{ $subtract: [new Date(), { $ifNull: ["$publishedAt", new Date(0)] }] }, 3600000] }
    } },
    { $lookup: { from: "video_likes", localField: "_id", foreignField: "videoId", as: "_likes" } },
    { $lookup: { from: "video_comments", localField: "_id", foreignField: "videoId", as: "_comments" } },
    { $lookup: { from: "video_shares", localField: "_id", foreignField: "videoId", as: "_shares" } },
    { $lookup: { from: "video_saves", localField: "_id", foreignField: "videoId", as: "_saves" } },
    { $lookup: { from: "video_reposts", localField: "_id", foreignField: "videoId", as: "_reposts" } },
    { $lookup: { from: "users", localField: "ownerId", foreignField: "_id", as: "_owner" } },
    { $addFields: {
      engagement: {
        likeCount: { $size: "$_likes" },
        commentCount: { $size: { $filter: { input: "$_comments", as: "comment", cond: { $ne: ["$comment.status", "DELETED"] } } } },
        shareCount: { $size: "$_shares" },
        saveCount: { $size: "$_saves" },
        liked: { $in: [userId, "$_likes.userId"] },
        saved: { $in: [userId, "$_saves.userId"] },
        repostCount: { $size: "$_reposts" },
        reposted: { $in: [userId, "$_reposts.userId"] }
      },
      owner: { $arrayElemAt: ["$_owner", 0] }
    } },
    ...(cursor ? (() => {
      try {
        const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
        if (!Number.isFinite(parsed.score) || !Number.isFinite(parsed.freshness) || !ObjectId.isValid(parsed.id)) return [];
        return [{ $match: { $or: [
          { _engagement: { $lt: parsed.score } },
          { _engagement: parsed.score, _freshness: { $gt: parsed.freshness } },
          { _engagement: parsed.score, _freshness: parsed.freshness, publishedAt: { $lt: new Date(parsed.publishedAt) } },
          { _engagement: parsed.score, _freshness: parsed.freshness, publishedAt: new Date(parsed.publishedAt), _id: { $lt: new ObjectId(parsed.id) } }
        ] } }];
      } catch { return []; }
    })() : []),
    { $sort: { _engagement: -1, _freshness: 1, publishedAt: -1, _id: -1 } },
    { $limit: safeLimit }
  ]).toArray();
  const next = videos.length === safeLimit && videos.length > 0 ? (() => {
    const last: any = videos[videos.length - 1];
    return Buffer.from(JSON.stringify({
      score: Number(last._engagement ?? 0), freshness: Number(last._freshness ?? 0),
      publishedAt: (last.publishedAt ?? new Date(0)).toISOString(), id: last._id.toHexString()
    })).toString("base64url");
  })() : null;
  const hydrated = await Promise.all(videos.map(async (v: any) => {
    const photoKeys = Array.isArray(v.photoObjectKeys) ? v.photoObjectKeys : [];
    const photos = mediaConfigured() ? (await Promise.all(photoKeys.map((key: string) => createPresignedPlayback(key, 3600).catch(() => null)))).filter(Boolean).map((x: any) => x.url) : [];
    return { id: v._id.toHexString(), ownerId: v.ownerId?.toHexString?.() ?? String(v.ownerId), owner: v.owner ? { username: v.owner.username, nickname: v.owner.nickname, countryCode: v.owner.countryCode } : null, mediaType: v.mediaType ?? "VIDEO", textBody: v.textBody ?? "", photos, engagement: v.engagement ?? { likeCount: 0, commentCount: 0, shareCount: 0, saveCount: 0, repostCount: 0, liked: false, saved: false, reposted: false }, caption: v.caption ?? "", hashtags: v.hashtags ?? [], playback: v.playback ?? null, thumbnail: v.thumbnail ?? null, autoCaptionsUrl: v.autoCaptionsUrl ?? null, autoCaptionsStatus: v.autoCaptionsStatus ?? null, autoCaptionLanguage: v.autoCaptionLanguage ?? "auto", captionTracks: v.captionTracks ?? {}, publishedAt: v.publishedAt ?? null };
  }));
  return { videos: hydrated, nextCursor: next };
}
