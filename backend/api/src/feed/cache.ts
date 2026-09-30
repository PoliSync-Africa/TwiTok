import { ObjectId, type Db } from "mongodb";

export type FeedSurface = "FOR_YOU" | "FOLLOWING" | "AFRICA";

export async function getCachedFeedIds(db: Db, userId: ObjectId, surface: FeedSurface) {
  const row = await db.collection("feed_caches").findOne(
    { userId, surface, expiresAt: { $gt: new Date() } },
    { projection: { videoIds: 1 } }
  );
  return Array.isArray(row?.videoIds)
    ? row.videoIds.filter((id: unknown): id is ObjectId => id instanceof ObjectId)
    : [];
}

export async function setCachedFeedIds(
  db: Db,
  userId: ObjectId,
  surface: FeedSurface,
  videoIds: ObjectId[],
  ttlSeconds = 30
) {
  const expiresAt = new Date(Date.now() + Math.max(5, Math.min(ttlSeconds, 300)) * 1000);
  await db.collection("feed_caches").updateOne(
    { userId, surface },
    {
      $set: {
        userId,
        surface,
        videoIds: videoIds.slice(0, 200),
        expiresAt,
        updatedAt: new Date()
      }
    },
    { upsert: true }
  );
}
