import { ObjectId, type Db } from "mongodb";
import { createPresignedPlayback, mediaConfigured } from "../media/storage.js";
import { getCachedFeedIds, setCachedFeedIds } from "./cache.js";

export type FeedSurface = "FOR_YOU" | "FOLLOWING" | "AFRICA";
export type FeedEventType = "IMPRESSION" | "VIEW_START" | "VIEW_2S" | "VIEW_COMPLETE" | "REWATCH" | "LIKE" | "COMMENT" | "SHARE" | "SAVE" | "FOLLOW" | "NOT_INTERESTED";

export async function initializeFeedIndexes(db: Db) {
  await Promise.all([
    db.collection("feed_events").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("feed_events").createIndex({ videoId: 1, createdAt: -1 }),
    db.collection("feed_events").createIndex({ videoId: 1, type: 1, createdAt: -1 }),
    db.collection("video_feedback").createIndex({ userId: 1, videoId: 1, type: 1 }, { unique: true }),
    db.collection("feed_caches").createIndex({ userId: 1, surface: 1 }, { unique: true }),
    db.collection("feed_caches").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  ]);
}

export async function recordFeedEvent(db: Db, userId: ObjectId, input: { videoId: string; type: FeedEventType; watchMs?: number; sessionId?: string; source?: string }) {
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
    sessionId: input.sessionId ? String(input.sessionId).slice(0, 128) : null, source: input.source ? String(input.source).slice(0, 40).toUpperCase() : "UNKNOWN", createdAt: new Date()
  });
  if (input.type === "IMPRESSION") {
    await db.collection("promotion_campaigns").updateOne(
      { videoId, status: "ACTIVE", $expr: { $lt: ["$spentMinor", "$budgetMinor"] } },
      { $inc: { spentMinor: 1, "metrics.impressions": 1 }, $set: { updatedAt: new Date() } }
    );
  }
  if (input.type === "VIEW_2S") {
    await db.collection("promotion_campaigns").updateOne(
      { videoId, status: "ACTIVE", $expr: { $lt: ["$spentMinor", "$budgetMinor"] } },
      { $inc: { "metrics.views": 1 }, $set: { updatedAt: new Date() } }
    );
  }
  if (input.type === "FOLLOW") {
    await db.collection("promotion_campaigns").updateOne(
      { videoId, status: "ACTIVE" },
      { $inc: { "metrics.follows": 1 }, $set: { updatedAt: new Date() } }
    );
  }
  if (["LIKE","SAVE","NOT_INTERESTED"].includes(input.type)) {
    await db.collection("video_feedback").updateOne(
      { userId, videoId, type: input.type },
      { $set: { userId, videoId, type: input.type, createdAt: new Date() } },
      { upsert: true }
    );
  }
}

export async function getFeed(db: Db, userId: ObjectId, surface: FeedSurface, countryCode?: string, limit = 20, cursor?: string) {
  const viewer = await db.collection("users").findOne({ _id: userId }, { projection: { countryCode: 1 } });
  const viewerCountryCode = String(countryCode ?? viewer?.countryCode ?? "").toUpperCase();
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
  const cachedIds = cursor ? [] : await getCachedFeedIds(db, userId, surface);
  const candidateQuery = cachedIds.length
    ? { $and: [query, { _id: { $in: cachedIds } }] }
    : query;
  const videos = await db.collection("videos").aggregate([
    { $match: candidateQuery },
    { $lookup: { from: "feed_events", let: { candidateVideoId: "$_id" }, pipeline: [
      { $match: { $expr: { $and: [
        { $eq: ["$userId", userId] },
        { $eq: ["$videoId", "$candidateVideoId"] }
      ] } } },
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
    { $lookup: { from: "feed_events", let: { candidateVideoId: "$_id" }, pipeline: [
      { $match: { $expr: { $and: [
        { $eq: ["$videoId", "$candidateVideoId"] },
        { $gte: ["$createdAt", new Date(Date.now() - 24 * 60 * 60 * 1000)] },
        { $in: ["$type", ["VIEW_2S", "VIEW_COMPLETE", "REWATCH", "LIKE", "COMMENT", "SHARE", "SAVE", "FOLLOW"]] }
      ] } } },
      { $group: { _id: null,
        recentScore: { $sum: { $switch: { branches: [
          { case: { $eq: ["$type", "VIEW_2S"] }, then: 0.5 },
          { case: { $eq: ["$type", "VIEW_COMPLETE"] }, then: 2 },
          { case: { $eq: ["$type", "REWATCH"] }, then: 3 },
          { case: { $eq: ["$type", "LIKE"] }, then: 5 },
          { case: { $eq: ["$type", "COMMENT"] }, then: 6 },
          { case: { $eq: ["$type", "SHARE"] }, then: 8 },
          { case: { $eq: ["$type", "SAVE"] }, then: 6 },
          { case: { $eq: ["$type", "FOLLOW"] }, then: 7 }
        ], default: 0 } } },
        recentUsers: { $addToSet: "$userId" },
        recentWatchMs: { $sum: { $ifNull: ["$watchMs", 0] } }
      } }
    ], as: "_velocity" } },
    { $lookup: { from: "video_likes", let: { candidateVideoId: "$_id" }, pipeline: [
      { $match: { $expr: { $eq: ["$videoId", "$candidateVideoId"] } } },
      { $group: { _id: null, count: { $sum: 1 }, viewerHas: { $max: { $cond: [{ $eq: ["$userId", userId] }, 1, 0] } } } }
    ], as: "_likeStats" } },
    { $lookup: { from: "video_comments", let: { candidateVideoId: "$_id" }, pipeline: [
      { $match: { $expr: { $and: [{ $eq: ["$videoId", "$candidateVideoId"] }, { $ne: ["$status", "DELETED"] }] } } },
      { $group: { _id: null, count: { $sum: 1 } } }
    ], as: "_commentStats" } },
    { $lookup: { from: "video_shares", let: { candidateVideoId: "$_id" }, pipeline: [
      { $match: { $expr: { $eq: ["$videoId", "$candidateVideoId"] } } },
      { $group: { _id: null, count: { $sum: 1 } } }
    ], as: "_shareStats" } },
    { $lookup: { from: "video_saves", let: { candidateVideoId: "$_id" }, pipeline: [
      { $match: { $expr: { $eq: ["$videoId", "$candidateVideoId"] } } },
      { $group: { _id: null, count: { $sum: 1 }, viewerHas: { $max: { $cond: [{ $eq: ["$userId", userId] }, 1, 0] } } } }
    ], as: "_saveStats" } },
    { $lookup: { from: "video_reposts", let: { candidateVideoId: "$_id" }, pipeline: [
      { $match: { $expr: { $eq: ["$videoId", "$candidateVideoId"] } } },
      { $group: { _id: null, count: { $sum: 1 }, viewerHas: { $max: { $cond: [{ $eq: ["$userId", userId] }, 1, 0] } } } }
    ], as: "_repostStats" } },
    { $addFields: {
      _interest: { $size: { $setIntersection: [
        { $map: { input: { $ifNull: ["$hashtags", []] }, as: "tag", in: { $toLower: "$$tag" } } },
        interestHashtags
      ] } },
      _velocityScore: { $add: [
        { $multiply: [{ $ifNull: [{ $arrayElemAt: ["$_velocity.recentScore", 0] }, 0] }, 0.75] },
        { $multiply: [{ $size: { $ifNull: [{ $arrayElemAt: ["$_velocity.recentUsers", 0] }, []] } }, 1.5] },
        { $multiply: [{ $ifNull: [{ $arrayElemAt: ["$_velocity.recentWatchMs", 0] }, 0] }, 0.00001] }
      ] },
      _freshness: { $divide: [{ $subtract: [new Date(), { $ifNull: ["$publishedAt", new Date(0)] }] }, 3600000] }
    } },
        { $lookup: { from: "promotion_campaigns", let: { candidateVideoId: "$_id" }, pipeline: [
      { $match: { $expr: { $and: [
        { $eq: ["$videoId", "$candidateVideoId"] },
        { $eq: ["$status", "ACTIVE"] },
        { $lt: ["$spentMinor", "$budgetMinor"] },
        { $or: [
          { $eq: [{ $size: { $ifNull: ["$target.countryCodes", []] } }, 0] },
          { $in: [viewerCountryCode, { $ifNull: ["$target.countryCodes", []] }] }
        ] },
        { $or: [
          { $eq: [{ $size: { $ifNull: ["$target.interests", []] } }, 0] },
          { $gt: [
            { $size: { $setIntersection: [
              { $map: { input: { $ifNull: ["$hashtags", []] }, as: "tag", in: { $toLower: "$tag" } } },
              { $ifNull: ["$target.interests", []] }
            ] } },
            0
          ] }
        ] }
      ] } } },
      { $project: { _id: 1, objective: 1, budgetMinor: 1, spentMinor: 1 } },
      { $limit: 1 }
    ], as: "_promotion" } },
    { $addFields: {
      _promotionScore: { $cond: [
        { $gt: [{ $size: "$_promotion" }, 0] },
        { $switch: { branches: [
          { case: { $eq: [{ $arrayElemAt: ["$_promotion.objective", 0] }, "MORE_FOLLOWERS"] }, then: 7 },
          { case: { $eq: [{ $arrayElemAt: ["$_promotion.objective", 0] }, "LIVE_AUDIENCE"] }, then: 6 },
          { case: { $eq: [{ $arrayElemAt: ["$_promotion.objective", 0] }, "WEBSITE_TRAFFIC"] }, then: 5 }
        ], default: 8 } },
        0
      ] }
    } },

    { $addFields: {
      _engagement: { $add: [
        { $multiply: [{ $ifNull: [{ $arrayElemAt: ["$viewerEvents.eventScore", 0] }, 0] }, 1] },
        { $multiply: [{ $ifNull: [{ $arrayElemAt: ["$viewerEvents.totalWatchMs", 0] }, 0] }, 0.00002] },
        { $multiply: [{ $ifNull: [{ $arrayElemAt: ["$_likeStats.count", 0] }, 0] }, 0.15] },
        { $multiply: [{ $ifNull: [{ $arrayElemAt: ["$_commentStats.count", 0] }, 0] }, 0.25] },
        { $multiply: [{ $ifNull: [{ $arrayElemAt: ["$_shareStats.count", 0] }, 0] }, 0.35] },
        { $multiply: [{ $ifNull: [{ $arrayElemAt: ["$_saveStats.count", 0] }, 0] }, 0.3] },
        { $multiply: [{ $ifNull: [{ $arrayElemAt: ["$_repostStats.count", 0] }, 0] }, 0.2] },
        { $multiply: ["$_interest", 2.5] },
        { $multiply: ["$_velocityScore", 1.5] },
        { $cond: [{ $lte: ["$_freshness", 24] }, 2, 0] },
        { $multiply: ["$_promotionScore", 1] }
      ] }
    } },
    { $lookup: { from: "video_sounds", localField: "_id", foreignField: "videoId", as: "_soundLink" } },
    { $addFields: { _soundId: { $arrayElemAt: ["$_soundLink.soundId", 0] } } },
    { $lookup: { from: "users", localField: "ownerId", foreignField: "_id", as: "_owner" } },
    { $addFields: {
      engagement: {
        likeCount: { $ifNull: [{ $arrayElemAt: ["$_likeStats.count", 0] }, 0] },
        commentCount: { $ifNull: [{ $arrayElemAt: ["$_commentStats.count", 0] }, 0] },
        shareCount: { $ifNull: [{ $arrayElemAt: ["$_shareStats.count", 0] }, 0] },
        saveCount: { $ifNull: [{ $arrayElemAt: ["$_saveStats.count", 0] }, 0] },
        liked: { $eq: [{ $ifNull: [{ $arrayElemAt: ["$_likeStats.viewerHas", 0] }, 0] }, 1] },
        saved: { $eq: [{ $ifNull: [{ $arrayElemAt: ["$_saveStats.viewerHas", 0] }, 0] }, 1] },
        repostCount: { $ifNull: [{ $arrayElemAt: ["$_repostStats.count", 0] }, 0] },
        reposted: { $eq: [{ $ifNull: [{ $arrayElemAt: ["$_repostStats.viewerHas", 0] }, 0] }, 1] }
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
    { $limit: Math.min(safeLimit * 8, 160) }
  ]).toArray();
  // Diversify the candidate pool so a strong creator/sound does not monopolize the For You feed.
  // Keep the ranking score primary, while enforcing light creator/sound exploration constraints.
  const diversified: any[] = [];
  const creatorCounts = new Map<string, number>();
  const soundCounts = new Map<string, number>();
  for (const video of videos) {
    const creatorId = video.ownerId?.toHexString?.() ?? String(video.ownerId ?? "unknown");
    const soundId = video._soundId?.toHexString?.() ?? String(video._soundId ?? "");
    const creatorCount = creatorCounts.get(creatorId) ?? 0;
    const soundCount = soundId ? (soundCounts.get(soundId) ?? 0) : 0;
    if (creatorCount >= 2) continue;
    if (soundId && soundCount >= 3) continue;
    diversified.push(video);
    creatorCounts.set(creatorId, creatorCount + 1);
    if (soundId) soundCounts.set(soundId, soundCount + 1);
    if (diversified.length >= safeLimit) break;
  }
  // If diversity constraints were too strict for a small feed, fill remaining slots by rank.
  if (diversified.length < safeLimit) {
    for (const video of videos) {
      if (diversified.some((x: any) => x._id.equals(video._id))) continue;
      diversified.push(video);
      if (diversified.length >= safeLimit) break;
    }
  }
  const selectedVideos = diversified;
  if (!cursor && videos.length > 0) {
    await setCachedFeedIds(db, userId, surface, videos.map((video: any) => video._id));
  }
  const next = selectedVideos.length === safeLimit && selectedVideos.length > 0 ? (() => {
    const last: any = selectedVideos[selectedVideos.length - 1];
    return Buffer.from(JSON.stringify({
      score: Number(last._engagement ?? 0), freshness: Number(last._freshness ?? 0),
      publishedAt: (last.publishedAt ?? new Date(0)).toISOString(), id: last._id.toHexString()
    })).toString("base64url");
  })() : null;
  const videoIds = selectedVideos.map((video: any) => video._id);
  const soundLinks = await db.collection("video_sounds").find({ videoId: { $in: videoIds } }).toArray();
  const soundIds = soundLinks.map((link: any) => link.soundId);
  const sounds = soundIds.length
    ? await db.collection("sounds").find({ _id: { $in: soundIds }, status: "ACTIVE" }, { projection: { _id: 1, title: 1, artist: 1, coverUrl: 1 } }).toArray()
    : [];
  const soundByVideo = new Map(soundLinks.map((link: any) => [link.videoId.toHexString(), sounds.find((sound: any) => sound._id.equals(link.soundId)) ?? null]));

  const shopTags = await db.collection("video_shop_products").find({ videoId: { $in: videoIds } }).sort({ sortOrder: 1 }).toArray();
  const shopProductIds = [...new Set(shopTags.map((tag: any) => String(tag.productId)))];
  const shopProductDocs = shopProductIds.length
    ? await db.collection("shop_products").find({ id: { $in: shopProductIds }, status: "ACTIVE" }).toArray()
    : [];
  const shopById = new Map(shopProductDocs.map((product: any) => [String(product.id), product]));
  const shopByVideo = new Map<string, any[]>();
  for (const tag of shopTags) {
    const product = shopById.get(String(tag.productId));
    if (!product) continue;
    const list = shopByVideo.get(tag.videoId.toHexString()) ?? [];
    if (list.length < 10) list.push(product);
    shopByVideo.set(tag.videoId.toHexString(), list);
  }

  const hydrated = await Promise.all(selectedVideos.map(async (v: any) => {
    const photoKeys = Array.isArray(v.photoObjectKeys) ? v.photoObjectKeys : [];
    const sound = soundByVideo.get(v._id.toHexString()) ?? null;
    const shopProducts = (shopByVideo.get(v._id.toHexString()) ?? []).map((product: any) => ({
      id: product.id, name: product.name, priceMinor: product.priceMinor, currency: product.currency,
      images: product.images ?? [], stock: product.stock ?? 0, variants: product.variants ?? []
    }));
    const photos = mediaConfigured()
      ? (await Promise.all(photoKeys.map((key: string) => createPresignedPlayback(key, 3600).catch(() => null)))).filter(Boolean).map((x: any) => x.url)
      : [];
    return { id: v._id.toHexString(), promoted: Boolean(v._promotion?.length), promotionObjective: v._promotion?.[0]?.objective ?? null, ownerId: v.ownerId?.toHexString?.() ?? String(v.ownerId), owner: v.owner ? { username: v.owner.username, nickname: v.owner.nickname, countryCode: v.owner.countryCode, isVerified: v.owner.isVerified === true, verificationType: v.owner.verificationType ?? null } : null, mediaType: v.mediaType ?? "VIDEO", textBody: v.textBody ?? "", photos, engagement: v.engagement ?? { likeCount: 0, commentCount: 0, shareCount: 0, saveCount: 0, repostCount: 0, liked: false, saved: false, reposted: false }, caption: v.caption ?? "", hashtags: v.hashtags ?? [], shopProducts, sound: sound ? { id: sound._id.toHexString(), title: sound.title ?? "", artist: sound.artist ?? "", coverUrl: sound.coverUrl ?? null } : null, playback: v.playback ?? null, thumbnail: v.thumbnail ?? null, autoCaptionsUrl: v.autoCaptionsUrl ?? null, autoCaptionsStatus: v.autoCaptionsStatus ?? null, autoCaptionLanguage: v.autoCaptionLanguage ?? "auto", captionTracks: v.captionTracks ?? {}, publishedAt: v.publishedAt ?? null };
  }));
  return { videos: hydrated, nextCursor: next };
}
