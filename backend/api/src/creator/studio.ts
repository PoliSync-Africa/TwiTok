import type { Db } from "mongodb";

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
  const allowed = new Set(["displayName", "bio", "category", "niche", "website", "avatarUrl", "coverUrl", "socialLinks"]);
  const profile: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!allowed.has(key)) continue;
    if (typeof value === "string") profile[key] = value.slice(0, 500);
    else if (key === "socialLinks" && value && typeof value === "object" && !Array.isArray(value)) {
      profile[key] = Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 10).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 300) : ""]));
    }
  }
  await db.collection("creator_profiles").updateOne(
    { userId },
    { $set: { ...profile, userId, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );
  return db.collection("creator_profiles").findOne({ userId });
}
