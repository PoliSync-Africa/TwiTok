import { type Db, ObjectId } from "mongodb";

function escapeRegex(value: string) { return value.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&"); }

async function ensureSearchIndex(
  db: Db,
  collectionName: string,
  key: Record<string, 1 | -1 | "text">,
  options: { unique?: boolean; name?: string } = {}
) {
  const collection = db.collection(collectionName);
  const indexes = await collection.listIndexes().toArray();
  const requestedName = options.name;
  const sameKey = indexes.filter((index) => JSON.stringify(index.key) === JSON.stringify(key));
  const existing = requestedName
    ? indexes.find((index) => index.name === requestedName)
    : sameKey[0];

  if (existing) {
    const uniqueMatches = Boolean(existing.unique) === Boolean(options.unique);
    if (uniqueMatches) return;
    await collection.dropIndex(existing.name);
  }

  await collection.createIndex(key, options);
}

export async function initializeSearchIndexes(db: Db) {
  await Promise.all([
    ensureSearchIndex(db, "videos", { caption: "text", hashtags: "text" }),
    ensureSearchIndex(db, "users", { username: 1 }, { unique: true, name: "username_1" }),
    ensureSearchIndex(db, "users", { nickname: 1 })
  ]);
}

export async function searchTwiTok(db: Db, userId: ObjectId, query: string, limit = 20) {
  const q = query.trim().slice(0, 80);
  const safeLimit = Math.min(Math.max(Number.isFinite(limit) ? limit : 20, 1), 50);
  if (!q) return { users: [], videos: [] };
  const pattern = new RegExp(escapeRegex(q.replace(/^[@#]/, "")), "i");
  const [users, videos] = await Promise.all([
    db.collection("users").find({ $or: [{ username: pattern }, { nickname: pattern }] }).project({ _id: 1, username: 1, nickname: 1, avatarUrl: 1 }).limit(safeLimit).toArray(),
    db.collection("videos").find({ status: "PUBLISHED", visibility: "PUBLIC", $or: [{ caption: pattern }, { hashtags: pattern }] }).sort({ publishedAt: -1 }).limit(safeLimit).toArray()
  ]);
  return {
    users: users.map(u => ({ id: u._id.toHexString(), username: u.username ?? "", nickname: u.nickname ?? "", avatarUrl: u.avatarUrl ?? null })),
    videos: videos.map(v => ({ id: v._id.toHexString(), ownerId: v.ownerId?.toHexString?.() ?? String(v.ownerId), caption: v.caption ?? "", hashtags: v.hashtags ?? [], playback: v.playback ?? null, thumbnail: v.thumbnail ?? null, publishedAt: v.publishedAt ?? null }))
  };
}
