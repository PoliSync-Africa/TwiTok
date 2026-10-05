import { ObjectId, type Db } from "mongodb";

export type SoundType = "LICENSED" | "ORIGINAL" | "COMMERCIAL" | "COMMUNITY";

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
  source?: "TWITOK" | "AUDIUS";
  sourceTrackId?: string;
  licenseUrl?: string;
}

export async function ensureSoundIndexes(db: Db) {
  await Promise.all([
    db.collection<Sound>("sounds").createIndex({ title: "text", artist: "text" }),
    db.collection<Sound>("sounds").createIndex({ countryCodes: 1, status: 1 }),
    db.collection<Sound>("sounds").createIndex({ usageCount: -1 }),
    db.collection("video_sounds").createIndex({ videoId: 1 }, { unique: true }),
    db.collection("video_sounds").createIndex({ soundId: 1, createdAt: -1 }),
    db.collection<Sound>("sounds").createIndex({ source: 1, sourceTrackId: 1 }, { unique: true, sparse: true })
  ]);
}

export async function searchSounds(db: Db, q: string, countryCode?: string, limit = 20) {
  const filter: any = { status: "ACTIVE" };
  if (q.trim()) filter.$text = { $search: q.trim() };
  if (countryCode) filter.countryCodes = { $in: [countryCode.toUpperCase(), "GLOBAL"] };

  const local = await db.collection<Sound>("sounds").find(filter).sort({ usageCount: -1 }).limit(Math.min(limit, 50)).toArray();
  if (local.length >= Math.min(limit, 20)) return local;

  // Audius exposes a free read-only catalog for discovery and streaming.
  // Community tracks are not marked as commercially licensed by TwiTok.
  try {
    const baseUrl = (process.env.AUDIUS_API_BASE_URL ?? "https://api.audius.co/v1").replace(/\/$/, "");
    const apiKey = process.env.AUDIUS_API_KEY;
    const params = new URLSearchParams({ limit: String(Math.min(limit, 20)) });
    const endpoint = q.trim()
      ? baseUrl + "/tracks/search?" + new URLSearchParams({ query: q.trim(), limit: String(Math.min(limit, 20)) }).toString()
      : baseUrl + "/tracks/trending?" + params.toString();
    const response = await fetch(endpoint, {
      headers: apiKey ? { "X-API-Key": apiKey } : undefined
    });
    if (!response.ok) return local;
    const payload = await response.json() as any;
    const tracks = Array.isArray(payload?.data) ? payload.data : [];
    const imported: Sound[] = [];

    for (const track of tracks) {
      const sourceTrackId = String(track?.id ?? "").trim();
      if (!sourceTrackId) continue;
      const existing = await db.collection<Sound>("sounds").findOne({ source: "AUDIUS", sourceTrackId });
      if (existing) { imported.push(existing); continue; }

      const sound: Sound = {
        _id: new ObjectId(),
        title: String(track?.title ?? "Untitled").trim().slice(0, 200),
        artist: String(track?.user?.name ?? track?.user?.handle ?? "Audius creator").trim().slice(0, 120),
        type: "COMMUNITY",
        countryCodes: ["GLOBAL"],
        audioUrl: "https://api.audius.co/v1/tracks/" + encodeURIComponent(sourceTrackId) + "/stream",
        coverUrl: typeof track?.artwork?.["480x480"] === "string" ? track.artwork["480x480"] : undefined,
        durationMs: Math.max(0, Math.round(Number(track?.duration ?? 0) * 1000)),
        usageCount: 0,
        status: "ACTIVE",
        source: "AUDIUS",
        sourceTrackId,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      try {
        await db.collection<Sound>("sounds").insertOne(sound);
        imported.push(sound);
      } catch {
        const raced = await db.collection<Sound>("sounds").findOne({ source: "AUDIUS", sourceTrackId });
        if (raced) imported.push(raced);
      }
    }
    return [...local, ...imported].slice(0, Math.min(limit, 50));
  } catch {
    return local;
  }
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


export async function createOriginalSound(db: Db, videoId: ObjectId, audioUrl: string, durationMs: number) {
  const video = await db.collection("videos").findOne({ _id: videoId });
  if (!video) throw new Error("Video not found");
  const owner = await db.collection("users").findOne({ _id: video.ownerId }, { projection: { username: 1 } });
  const username = owner?.username ? String(owner.username) : "creator";
  const now = new Date();
  const existing = await db.collection<Sound>("sounds").findOne({ type: "ORIGINAL", "sourceVideoId": videoId });
  if (existing) return existing;
  const sound: Sound & { sourceVideoId: ObjectId } = {
    _id: new ObjectId(),
    title: `Original sound - ${username}`,
    artist: username,
    type: "ORIGINAL",
    countryCodes: ["GLOBAL"],
    audioUrl,
    durationMs,
    usageCount: 0,
    status: "ACTIVE",
    sourceVideoId: videoId,
    createdAt: now,
    updatedAt: now
  };
  await db.collection("sounds").insertOne(sound);
  await db.collection("video_sounds").updateOne(
    { videoId },
    { $set: { videoId, soundId: sound._id, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );
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
