import { ObjectId, type Db } from "mongodb";
import { redisGetJson, redisSetJson } from "../cache/redis.js";

export type FeedSurface = "FOR_YOU" | "FOLLOWING" | "AFRICA";

function redisKey(userId: ObjectId, surface: FeedSurface) {
  return `feed:v1:${surface}:${userId.toHexString()}`;
}

export async function getCachedFeedIds(db: Db, userId: ObjectId, surface: FeedSurface) {
  const redisIds = await redisGetJson<string[]>(redisKey(userId, surface));
  if (Array.isArray(redisIds)) return redisIds.filter(ObjectId.isValid).map(id => new ObjectId(id));
  const row = await db.collection("feed_caches").findOne(
    { userId, surface, expiresAt: { $gt: new Date() } },
    { projection: { videoIds: 1 } }
  );
  return Array.isArray(row?.videoIds)
    ? row.videoIds.filter((id: unknown): id is ObjectId => id instanceof ObjectId)
    : [];
}

export async function setCachedFeedIds(db: Db, userId: ObjectId, surface: FeedSurface, videoIds: ObjectId[], ttlSeconds = 30) {
  const safeIds = videoIds.slice(0, 200);
  const ttl = Math.max(5, Math.min(ttlSeconds, 300));
  const storedInRedis = await redisSetJson(redisKey(userId, surface), safeIds.map(id => id.toHexString()), ttl);
  if (!storedInRedis) {
    const expiresAt = new Date(Date.now() + ttl * 1000);
    await db.collection("feed_caches").updateOne(
      { userId, surface },
      { $set: { userId, surface, videoIds: safeIds, expiresAt, updatedAt: new Date() } },
      { upsert: true }
    );
  }
}
