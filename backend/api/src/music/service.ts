import { Db, ObjectId } from "mongodb";

export type SoundType = "LICENSED" | "ORIGINAL" | "COMMERCIAL";

export interface Sound {
  _id?: ObjectId;
  title: string;
  artist: string;
  type: SoundType;
  countryCodes: string[];
  audioUrl?: string;
  coverUrl?: string;
  durationMs: number;
  usageCount: number;
  status: "ACTIVE" | "REMOVED";
  createdAt: Date;
  updatedAt: Date;
}

export async function ensureSoundIndexes(db: Db) {
  await Promise.all([
    db.collection<Sound>("sounds").createIndex({ title: "text", artist: "text" }),
    db.collection<Sound>("sounds").createIndex({ countryCodes: 1, status: 1 }),
    db.collection<Sound>("sounds").createIndex({ usageCount: -1 }),
    db.collection("video_sounds").createIndex({ videoId: 1 }, { unique: true }),
    db.collection("video_sounds").createIndex({ soundId: 1, createdAt: -1 })
  ]);
}

export async function searchSounds(db: Db, q: string, countryCode?: string, limit = 20) {
  const filter: any = { status: "ACTIVE" };
  if (q.trim()) filter.$text = { $search: q.trim() };
  if (countryCode) filter.countryCodes = { $in: [countryCode.toUpperCase(), "GLOBAL"] };
  return db.collection<Sound>("sounds").find(filter).sort({ usageCount: -1 }).limit(Math.min(limit, 50)).toArray();
}

export async function attachSound(db: Db, userId: ObjectId, videoId: string, soundId: string) {
  if (!ObjectId.isValid(videoId) || !ObjectId.isValid(soundId)) throw new Error("Invalid video or sound id");
  const sound = await db.collection<Sound>("sounds").findOne({ _id: new ObjectId(soundId), status: "ACTIVE" });
  if (!sound) throw new Error("Sound unavailable");
  const video = await db.collection("videos").findOne({ _id: new ObjectId(videoId), ownerId: userId });
  if (!video) throw new Error("Video not found");
  await db.collection("video_sounds").updateOne(
    { videoId: new ObjectId(videoId) },
    { $set: { videoId: new ObjectId(videoId), soundId: sound._id, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );
  await db.collection<Sound>("sounds").updateOne({ _id: sound._id }, { $inc: { usageCount: 1 }, $set: { updatedAt: new Date() } });
  return sound;
}


export async function getSoundPage(db: Db, soundId: string, limit = 20) {
  if (!ObjectId.isValid(soundId)) throw new Error("Invalid sound id");
  const _id = new ObjectId(soundId);
  const sound = await db.collection<Sound>("sounds").findOne({ _id, status: "ACTIVE" });
  if (!sound) throw new Error("Sound not found");
  const links = await db.collection("video_sounds").find({ soundId: _id }).sort({ createdAt: -1 }).limit(Math.min(limit, 50)).toArray();
  const videoIds = links.map(link => link.videoId).filter(Boolean);
  const videos = await db.collection("videos").find({
    _id: { $in: videoIds }, status: "PUBLISHED", visibility: "PUBLIC"
  }).project({
    ownerId: 1, caption: 1, hashtags: 1, playback: 1, thumbnail: 1, publishedAt: 1
  }).limit(Math.min(limit, 50)).toArray();
  return { sound, videos };
}
