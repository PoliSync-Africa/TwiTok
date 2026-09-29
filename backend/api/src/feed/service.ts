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
  const video = await db.collection("videos").findOne(
    { _id: videoId, status: "PUBLISHED", visibility: "PUBLIC" },
    { projection: { _id: 1 } }
  );
  if (!video) throw new Error("Video not found");
  const watchMs = Number(input.watchMs ?? 0);
  if (!Number.isFinite(watchMs) || watchMs < 0 || watchMs > 24 * 60 * 60 * 1000) throw new Error("Invalid watch duration");
  await db.collection("feed_events").insertOne({
    userId, videoId, type: input.type, watchMs,
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
  const interestRows = await db.collection("feed_events").aggregate([
    { $match: { userId, type: { $in: ["VIEW_2S", "VIEW_COMPLETE", "REWATCH", "LIKE", "COMMENT", "SHARE", "SAVE", "FOLLOW"] } } },
    { $sort: { createdAt: -1 } }, { $limit: 1000 },
    { $set: { eventWeight: { $switch: { branches: [
      { case: { $eq: ["$type", "FOLLOW"] }, then: 3 },
      { case: { $eq: ["$type", "SHARE"] }, then: 2.5 },
      { case: { $eq: ["$type", "LIKE"] }, then: 2 },
      { case: { $eq: ["$type", "SAVE"] }, then: 2.25 },
      { case: { $eq: ["$type", "COMMENT"] }, then: 2 },
      { case: { $eq: ["$type", "REWATCH"] }, then: 1.75 },
      { case: { $eq: ["$type", "VIEW_COMPLETE"] }, then: 1.5 },
      { case: { $eq: ["$type", "VIEW_2S"] }, then: 0.75 }
    ], default: 0 } } } },
    { $set: { recencyWeight: { $exp: { $multiply: [ -0.04, { $divide: [ { $subtract: [ new Date(), "$createdAt" ] }, 86400000 ] } ] } } } },
    { $lookup: { from: "videos", localField: "videoId", foreignField: "_id", as: "video" } },
    { $unwind: "$video" },
    { $unwind: { path: "$video.hashtags", preserveNullAndEmptyArrays: false } },
    { $group: { _id: "$video.hashtags", weight: { $sum: { $multiply: ["$eventWeight", "$recencyWeight"] } } } },
    { $sort: { weight: -1 } }, { $limit: 100 }
  ]).toArray();
  const interestHashtags = [...new Set(interestRows.map((x: any) => String(x._id ?? "").toLowerCase()).filter(Boolean))];
  const query: any = { status: "PUBLISHED", visibility: "PUBLIC", ownerId: { $nin: blockedOwnerIds }, _id: { $nin: excludedVideoIds } };
  if (surface === "FOLLOWING") query.ownerId = { $in: followingIds.filter((id: ObjectId) => !blockedOwnerIds.some((x: ObjectId) => x.equals(id))) };
  if (surface === "AFRICA" && countryCode) query.countryCode = String(countryCode).toUpperCase();
  const safeLimit = Math.min(Math.max(Number.isFinite(limit) ? limit : 20, 1), 20);
  const videos = await db.collection("videos").aggregate([
    { $match: query },
    { $lookup: { from: "feed_events", let: { videoId: "$_id" }, pipeline: [
      { $match: { userId } },
      { $match: { $expr: { $eq: ["$videoId", "\u0024\u0024videoId"] } } },
      { $group: { _id: null,
        eventScore: { $sum: { $switch: {
          branches: [
            { case: { $eq: ["$type", "VIEW_2S"] }, then: 1 },
            { case: { $eq: ["$type", "VIEW_COMPLETE"] }, then: 3 },
            { case: { $eq: ["$type", "REWATCH"] }, then: 4 },
            { case: { $eq: ["$type", "LIKE"] }, then: 8 },
            { case: { $eq: ["$type", "COMMENT"] }, then: 7 },
            { case: { $eq: ["$type", "SHARE"] }, then: 9 },
            { case: { $eq: ["$type", "SAVE"] }, then: 6 },
            { case: { $eq: ["$type", "FOLLOW"] }, then: 10 },
            { case: { $eq: ["$type", "NOT_INTERESTED"] }, then: -50 }
          ],
          default: 0
        } } },
        totalWatchMs: { $sum: { $ifNull: ["$watchMs", 0] } }
      } }
    ], as: "viewerEvents" } },
    { $lookup: { from: "video_likes", localField: "_id", foreignField: "videoId", as: "_likes" } },
    { $lookup: { from: "video_comments", localField: "_id", foreignField: "videoId", as: "_comments" } },
    { $lookup: { from: "video_shares", localField: "_id", foreignField: "videoId", as: "_shares" } },
    { $lookup: { from: "video_saves", localField: "_id", foreignField: "videoId", as: "_saves" } },
    { $lookup: { from: "video_reposts", localField: "_id", foreignField: "videoId", as: "_reposts" } },
    { $addFields: {
      _interest: { $size: { $setIntersection: [
        { $map: { input: { $ifNull: ["$hashtags", []] }, as: "tag", in: { $toLower: "$tag" } } },
        interestHashtags
      ] } },
      _engagement: { $add: [
        { $multiply: [{ $ifNull: [{ $arrayElemAt: ["$viewerEvents.eventScore", 0] }, 0] }, 1] },
        { $multiply: [{ $ifNull: [{ $arrayElemAt: ["$viewerEvents.totalWatchMs", 0] }, 0] }, 0.00002] },
        { $multiply: [{ $size: "$_likes" }, 0.15] },
        { $multiply: [{ $size: "$_comments" }, 0.25] },
        { $multiply: [{ $size: "$_shares" }, 0.35] },
        { $multiply: [{ $size: "$_saves" }, 0.3] },
        { $multiply: [{ $size: "$_reposts" }, 0.2] },
        { $multiply: ["$_interest", 2.5] }
      ] },
      _freshness: { $divide: [{ $subtract: [new Date(), { $ifNull: ["$publishedAt", new Date(0)] }] }, 3600000] }
    } },
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
    const soundLink = await db.collection("video_sounds").findOne({ videoId: v._id });
    const sound = soundLink ? await db.collection("sounds").findOne({ _id: soundLink.soundId, status: "ACTIVE" }, { projection: { _id: 1, title: 1, artist: 1, coverUrl: 1 } }) : null;
    const photos = mediaConfigured() ? (await Promise.all(photoKeys.map((key: string) => createPresignedPlayback(key, 3600).catch(() => null)))).filter(Boolean).map((x: any) => x.url) : [];
    return { id: v._id.toHexString(), ownerId: v.ownerId?.toHexString?.() ?? String(v.ownerId), owner: v.owner ? { username: v.owner.username, nickname: v.owner.nickname, countryCode: v.owner.countryCode } : null, mediaType: v.mediaType ?? "VIDEO", textBody: v.textBody ?? "", photos, engagement: v.engagement ?? { likeCount: 0, commentCount: 0, shareCount: 0, saveCount: 0, repostCount: 0, liked: false, saved: false, reposted: false }, caption: v.caption ?? "", hashtags: v.hashtags ?? [], sound: sound ? { id: sound._id.toHexString(), title: sound.title ?? "", artist: sound.artist ?? "", coverUrl: sound.coverUrl ?? null } : null, playback: v.playback ?? null, thumbnail: v.thumbnail ?? null, autoCaptionsUrl: v.autoCaptionsUrl ?? null, autoCaptionsStatus: v.autoCaptionsStatus ?? null, autoCaptionLanguage: v.autoCaptionLanguage ?? "auto", captionTracks: v.captionTracks ?? {}, publishedAt: v.publishedAt ?? null };
  }));
  return { videos: hydrated, nextCursor: next };
}
