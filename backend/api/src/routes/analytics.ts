import { Router } from "express";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { rateLimit as expressRateLimit, ipKeyGenerator } from "express-rate-limit";

export const analyticsRouter = Router();

const analyticsReadLimit = expressRateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => req.userId?.toHexString() ?? ipKeyGenerator(req.ip ?? "unknown")
});

analyticsRouter.get("/creator/overview", requireUser, analyticsReadLimit, async (req, res) => {
  try {
    const db = await getDb();
    const rawDays = Number(req.query.days ?? 30);
    const days = [7, 28, 30, 90].includes(rawDays) ? rawDays : 30;
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    const userId = req.userId!;

    const videoRows = await db.collection("videos").find(
      { ownerId: userId },
      { projection: { _id: 1, caption: 1, mediaType: 1, publishedAt: 1, createdAt: 1, status: 1, thumbnail: 1 } }
    ).toArray();
    const videoIds = videoRows.map(v => v._id);

    if (!videoIds.length) {
      return res.json({
        period: { days, from: from.toISOString(), to: to.toISOString() },
        summary: { impressions: 0, views: 0, uniqueViewers: 0, completedViews: 0, completionRate: 0, rewatches: 0, watchTimeMs: 0, averageWatchTimeMs: 0, likes: 0, comments: 0, shares: 0, saves: 0, followsGained: 0, engagementRate: 0 },
        daily: [], topVideos: [], audienceCountries: [], live: { streams: 0, endedStreams: 0, totalDurationMs: 0, giftsUsd: 0, peakViewerCount: 0 }, trafficSources: [],
        earnings: { grossCreatorEarningsUsd: 0, cashCreditedUsd: 0, diamonds: 0 }
      });
    }

    const eventMatch = { videoId: { $in: videoIds }, createdAt: { $gte: from, $lte: to } };

    const summaryRows = await db.collection("feed_events").aggregate([
      { $match: eventMatch },
      { $group: {
        _id: null,
        impressions: { $sum: { $cond: [{ $eq: ["$type", "IMPRESSION"] }, 1, 0] } },
        views: { $sum: { $cond: [{ $eq: ["$type", "VIEW_2S"] }, 1, 0] } },
        completedViews: { $sum: { $cond: [{ $eq: ["$type", "VIEW_COMPLETE"] }, 1, 0] } },
        rewatches: { $sum: { $cond: [{ $eq: ["$type", "REWATCH"] }, 1, 0] } },
        likes: { $sum: { $cond: [{ $eq: ["$type", "LIKE"] }, 1, 0] } },
        comments: { $sum: { $cond: [{ $eq: ["$type", "COMMENT"] }, 1, 0] } },
        shares: { $sum: { $cond: [{ $eq: ["$type", "SHARE"] }, 1, 0] } },
        saves: { $sum: { $cond: [{ $eq: ["$type", "SAVE"] }, 1, 0] } },
        followsGained: { $sum: { $cond: [{ $eq: ["$type", "FOLLOW"] }, 1, 0] } },
        uniqueViewers: { $addToSet: { $cond: [{ $in: ["$type", ["VIEW_2S", "VIEW_COMPLETE", "REWATCH"]] }, "$userId", null] } }
      } }
    ]).toArray();

    const rawSummary = summaryRows[0] ?? {};
    const uniqueViewers = (rawSummary.uniqueViewers ?? []).filter(Boolean).length;

    const watchRows = await db.collection("feed_events").aggregate([
      { $match: { ...eventMatch, type: { $in: ["VIEW_START", "VIEW_2S", "VIEW_COMPLETE", "REWATCH"] } } },
      { $group: { _id: { videoId: "$videoId", userId: "$userId", sessionId: "$sessionId" }, watchMs: { $max: { $ifNull: ["$watchMs", 0] } } } },
      { $group: { _id: null, watchTimeMs: { $sum: "$watchMs" }, sessions: { $sum: 1 } } }
    ]).toArray();
    const watchTimeMs = Number(watchRows[0]?.watchTimeMs ?? 0);
    const views = Number(rawSummary.views ?? 0);
    const completedViews = Number(rawSummary.completedViews ?? 0);
    const totalEngagement = Number(rawSummary.likes ?? 0) + Number(rawSummary.comments ?? 0) + Number(rawSummary.shares ?? 0) + Number(rawSummary.saves ?? 0);
    const summary = {
      impressions: Number(rawSummary.impressions ?? 0),
      views,
      uniqueViewers,
      completedViews,
      completionRate: views ? Number(((completedViews / views) * 100).toFixed(2)) : 0,
      rewatches: Number(rawSummary.rewatches ?? 0),
      watchTimeMs,
      averageWatchTimeMs: views ? Math.round(watchTimeMs / views) : 0,
      likes: Number(rawSummary.likes ?? 0),
      comments: Number(rawSummary.comments ?? 0),
      shares: Number(rawSummary.shares ?? 0),
      saves: Number(rawSummary.saves ?? 0),
      followsGained: Number(rawSummary.followsGained ?? 0),
      engagementRate: views ? Number(((totalEngagement / views) * 100).toFixed(2)) : 0
    };

    const daily = await db.collection("feed_events").aggregate([
      { $match: eventMatch },
      { $set: { day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } } } },
      { $group: {
        _id: "$day",
        views: { $sum: { $cond: [{ $eq: ["$type", "VIEW_2S"] }, 1, 0] } },
        completedViews: { $sum: { $cond: [{ $eq: ["$type", "VIEW_COMPLETE"] }, 1, 0] } },
        likes: { $sum: { $cond: [{ $eq: ["$type", "LIKE"] }, 1, 0] } },
        comments: { $sum: { $cond: [{ $eq: ["$type", "COMMENT"] }, 1, 0] } },
        shares: { $sum: { $cond: [{ $eq: ["$type", "SHARE"] }, 1, 0] } },
        saves: { $sum: { $cond: [{ $eq: ["$type", "SAVE"] }, 1, 0] } },
        follows: { $sum: { $cond: [{ $eq: ["$type", "FOLLOW"] }, 1, 0] } }
      } },
      { $sort: { _id: 1 } }
    ]).toArray();

    const topVideos = await db.collection("feed_events").aggregate([
      { $match: eventMatch },
      { $group: {
        _id: "$videoId",
        views: { $sum: { $cond: [{ $eq: ["$type", "VIEW_2S"] }, 1, 0] } },
        completedViews: { $sum: { $cond: [{ $eq: ["$type", "VIEW_COMPLETE"] }, 1, 0] } },
        likes: { $sum: { $cond: [{ $eq: ["$type", "LIKE"] }, 1, 0] } },
        comments: { $sum: { $cond: [{ $eq: ["$type", "COMMENT"] }, 1, 0] } },
        shares: { $sum: { $cond: [{ $eq: ["$type", "SHARE"] }, 1, 0] } },
        saves: { $sum: { $cond: [{ $eq: ["$type", "SAVE"] }, 1, 0] } }
      } },
      { $sort: { views: -1, completedViews: -1, likes: -1 } },
      { $limit: 10 },
      { $lookup: { from: "videos", localField: "_id", foreignField: "_id", as: "video" } },
      { $unwind: "$video" },
      { $project: { _id: 1, views: 1, completedViews: 1, likes: 1, comments: 1, shares: 1, saves: 1, caption: "$video.caption", mediaType: "$video.mediaType", thumbnail: "$video.thumbnail", publishedAt: "$video.publishedAt" } }
    ]).toArray();

    const audienceCountries = await db.collection("feed_events").aggregate([
      { $match: { ...eventMatch, type: { $in: ["VIEW_2S", "VIEW_COMPLETE", "REWATCH"] } } },
      { $group: { _id: "$userId", views: { $sum: 1 } } },
      { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      { $group: { _id: { $ifNull: ["$user.countryCode", "UNKNOWN"] }, viewers: { $sum: 1 }, views: { $sum: "$views" } } },
      { $sort: { viewers: -1 } },
      { $limit: 20 }
    ]).toArray();

    const liveRows = await db.collection("live_streams").find(
      { hostUserId: userId.toHexString(), createdAt: { $gte: from, $lte: to } },
      { projection: { status: 1, startedAt: 1, endedAt: 1, viewerCount: 1, giftsUsd: 1 } }
    ).toArray();
    const live = liveRows.reduce((acc, stream) => {
      const start = stream.startedAt ? new Date(stream.startedAt).getTime() : 0;
      const end = stream.endedAt ? new Date(stream.endedAt).getTime() : Date.now();
      return {
        streams: acc.streams + 1,
        endedStreams: acc.endedStreams + (stream.status === "ENDED" ? 1 : 0),
        totalDurationMs: acc.totalDurationMs + (start && end >= start ? end - start : 0),
        giftsUsd: acc.giftsUsd + Number(stream.giftsUsd ?? 0),
        peakViewerCount: Math.max(acc.peakViewerCount, Number(stream.viewerCount ?? 0))
      };
    }, { streams: 0, endedStreams: 0, totalDurationMs: 0, giftsUsd: 0, peakViewerCount: 0 });

    const trafficRows = await db.collection("feed_events").aggregate([
      { $match: { ...eventMatch, type: { $in: ["IMPRESSION", "VIEW_2S", "VIEW_COMPLETE", "REWATCH"] } } },
      { $group: { _id: { $ifNull: ["$source", "UNKNOWN"] }, views: { $sum: { $cond: [{ $in: ["$type", ["VIEW_2S", "VIEW_COMPLETE", "REWATCH"]] }, 1, 0] } }, impressions: { $sum: { $cond: [{ $eq: ["$type", "IMPRESSION"] }, 1, 0] } } } },
      { $sort: { views: -1, impressions: -1 } }
    ]).toArray();

    const giftRows = await db.collection("gift_transactions").aggregate([
      { $match: { receiverId: userId, createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: null, grossCreatorEarningsUsd: { $sum: { $ifNull: ["$creatorEarningsUsd", 0] } }, cashCreditedUsd: { $sum: { $ifNull: ["$creatorCashCreditUsd", 0] } }, diamonds: { $sum: { $ifNull: ["$diamondsAwarded", 0] } } } }
    ]).toArray();

    return res.json({
      period: { days, from: from.toISOString(), to: to.toISOString() },
      summary,
      daily: daily.map(x => ({ date: x._id, views: Number(x.views ?? 0), completedViews: Number(x.completedViews ?? 0), likes: Number(x.likes ?? 0), comments: Number(x.comments ?? 0), shares: Number(x.shares ?? 0), saves: Number(x.saves ?? 0), follows: Number(x.follows ?? 0) })),
      topVideos: topVideos.map(x => ({ id: x._id.toHexString(), views: Number(x.views ?? 0), completedViews: Number(x.completedViews ?? 0), likes: Number(x.likes ?? 0), comments: Number(x.comments ?? 0), shares: Number(x.shares ?? 0), saves: Number(x.saves ?? 0), caption: x.caption ?? "", mediaType: x.mediaType ?? "VIDEO", thumbnail: x.thumbnail ?? null, publishedAt: x.publishedAt ?? null })),
      audienceCountries: audienceCountries.map(x => ({ countryCode: String(x._id ?? "UNKNOWN"), viewers: Number(x.viewers ?? 0), views: Number(x.views ?? 0) })),
      live,
      trafficSources: trafficRows.map(x => ({ source: String(x._id ?? "UNKNOWN"), views: Number(x.views ?? 0), impressions: Number(x.impressions ?? 0), tracked: true })),
      earnings: { grossCreatorEarningsUsd: Number(giftRows[0]?.grossCreatorEarningsUsd ?? 0), cashCreditedUsd: Number(giftRows[0]?.cashCreditedUsd ?? 0), diamonds: Number(giftRows[0]?.diamonds ?? 0) }
    });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to load creator analytics" });
  }
});
