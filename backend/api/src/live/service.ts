import type { Db } from "mongodb";

export async function initializeLiveIndexes(db: Db) {
  await Promise.all([
    db.collection("live_streams").createIndex({ streamId: 1 }, { unique: true }),
    db.collection("live_streams").createIndex({ hostUserId: 1, createdAt: -1 }),
    db.collection("live_streams").createIndex({ status: 1, startedAt: -1 }),
    db.collection("live_events").createIndex({ streamId: 1, createdAt: -1 }),
    db.collection("live_moderators").createIndex({ streamId: 1, userId: 1 }, { unique: true }),
    db.collection("live_viewers").createIndex({ streamId: 1, userId: 1 }, { unique: true }),
    db.collection("live_viewers").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  ]);
}

export async function createLiveStream(db: Db, input: { streamId:string; hostUserId:string; title:string; category?:string; coverUrl?:string }) {
  const now = new Date();
  const stream = {
    ...input,
    status: "SCHEDULED",
    viewerCount: 0,
    giftsUsd: 0,
    createdAt: now,
    updatedAt: now
  };
  await db.collection("live_streams").insertOne(stream);
  return stream;
}

export async function setLiveStatus(db: Db, streamId: string, status: "LIVE"|"ENDED"|"SUSPENDED") {
  const now = new Date();
  const update: Record<string, unknown> = { status, updatedAt: now };
  if (status === "LIVE") update.startedAt = now;
  if (status === "ENDED") update.endedAt = now;
  await db.collection("live_streams").updateOne({ streamId }, { $set: update });
  return db.collection("live_streams").findOne({ streamId });
}

export async function refreshLiveViewer(db: Db, streamId: string, userId: string) {
  const stream = await db.collection("live_streams").findOne({ streamId, status: "LIVE" }, { projection: { streamId: 1 } });
  if (!stream) return null;
  const now = new Date();
  const expiresAt = new Date(Date.now() + 90_000);
  await db.collection("live_viewers").updateOne(
    { streamId, userId },
    { $set: { streamId, userId, lastSeenAt: now, expiresAt } },
    { upsert: true }
  );
  const viewerCount = await db.collection("live_viewers").countDocuments({ streamId, expiresAt: { $gt: now } });
  await db.collection("live_streams").updateOne({ streamId, status: "LIVE" }, { $set: { viewerCount, updatedAt: now } });
  return { streamId, viewerCount, expiresAt };
}

export async function leaveLiveViewer(db: Db, streamId: string, userId: string) {
  await db.collection("live_viewers").deleteOne({ streamId, userId });
  const now = new Date();
  const viewerCount = await db.collection("live_viewers").countDocuments({ streamId, expiresAt: { $gt: now } });
  await db.collection("live_streams").updateOne({ streamId, status: "LIVE" }, { $set: { viewerCount, updatedAt: now } });
  return { streamId, viewerCount };
}
