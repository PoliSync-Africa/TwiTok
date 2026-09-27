import { Db } from "mongodb";

export async function initializeCreatorIndexes(db: Db) {
  await Promise.all([
    db.collection("creator_profiles").createIndex({ userId: 1 }, { unique: true }),
    db.collection("creator_content").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("creator_analytics_daily").createIndex({ userId: 1, date: -1 }),
    db.collection("creator_monetization").createIndex({ userId: 1, program: 1 }, { unique: true })
  ]);
}

export async function getCreatorStudio(db: Db, userId: string) {
  const [profile, monetization, recentContent, analytics] = await Promise.all([
    db.collection("creator_profiles").findOne({ userId }),
    db.collection("creator_monetization").find({ userId }).sort({ program: 1 }).toArray(),
    db.collection("creator_content").find({ userId }).sort({ createdAt: -1 }).limit(20).toArray(),
    db.collection("creator_analytics_daily").find({ userId }).sort({ date: -1 }).limit(90).toArray()
  ]);
  return { profile, monetization, recentContent, analytics };
}

export async function upsertCreatorProfile(db: Db, userId: string, input: Record<string, unknown>) {
  const now = new Date();
  await db.collection("creator_profiles").updateOne(
    { userId },
    { $set: { ...input, userId, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );
  return db.collection("creator_profiles").findOne({ userId });
}