import { ObjectId, type Db } from "mongodb";

export async function initializePlaylistIndexes(db: Db) {
  await Promise.all([
    db.collection("playlists").createIndex({ ownerId: 1, createdAt: -1 }),
    db.collection("playlists").createIndex({ ownerId: 1, title: 1 }, { unique: true }),
    db.collection("playlists").createIndex({ videoIds: 1 })
  ]);
}

function cleanTitle(value: unknown) {
  return String(value ?? "").trim().slice(0, 80);
}

export async function listMyPlaylists(db: Db, userId: ObjectId) {
  const items = await db.collection("playlists").find({ ownerId: userId }).sort({ updatedAt: -1 }).limit(100).toArray();
  return items.map(toPlaylist);
}

export async function createPlaylist(db: Db, userId: ObjectId, input: { title: unknown; description?: unknown; visibility?: unknown }) {
  const title = cleanTitle(input.title);
  if (!title) throw new Error("Playlist title is required");
  const now = new Date();
  const doc = {
    ownerId: userId,
    title,
    description: String(input.description ?? "").trim().slice(0, 300),
    visibility: input.visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC",
    videoIds: [] as ObjectId[],
    createdAt: now,
    updatedAt: now
  };
  try {
    const result = await db.collection("playlists").insertOne(doc);
    return { id: result.insertedId.toHexString(), ...doc, videoIds: [] };
  } catch (e: any) {
    if (e?.code === 11000) throw new Error("A playlist with this title already exists");
    throw e;
  }
}

export async function addVideoToPlaylist(db: Db, userId: ObjectId, playlistId: string, videoId: string) {
  if (!ObjectId.isValid(playlistId) || !ObjectId.isValid(videoId)) throw new Error("Invalid playlist or video id");
  const playlistObjectId = new ObjectId(playlistId);
  const videoObjectId = new ObjectId(videoId);
  const playlist = await db.collection("playlists").findOne({ _id: playlistObjectId, ownerId: userId });
  if (!playlist) throw new Error("Playlist not found");
  const video = await db.collection("videos").findOne({ _id: videoObjectId, ownerId: userId, status: "PUBLISHED" }, { projection: { _id: 1 } });
  if (!video) throw new Error("Published video not found");
  await db.collection("playlists").updateOne({ _id: playlistObjectId, ownerId: userId }, { $addToSet: { videoIds: videoObjectId }, $set: { updatedAt: new Date() } });
  return getPlaylist(db, playlistObjectId, userId);
}

export async function removeVideoFromPlaylist(db: Db, userId: ObjectId, playlistId: string, videoId: string) {
  if (!ObjectId.isValid(playlistId) || !ObjectId.isValid(videoId)) throw new Error("Invalid playlist or video id");
  const playlistObjectId = new ObjectId(playlistId);
  const result = await db.collection("playlists").updateOne(
    { _id: playlistObjectId, ownerId: userId },
    { $pull: { videoIds: new ObjectId(videoId) } as any, $set: { updatedAt: new Date() } }
  );
  if (!result.matchedCount) throw new Error("Playlist not found");
  const updated = await db.collection("playlists").findOne({ _id: playlistObjectId, ownerId: userId });
  if (!updated) throw new Error("Playlist not found");
  return toPlaylist(updated);
}

export async function getPlaylist(db: Db, playlistId: ObjectId, viewerId?: ObjectId) {
  const playlist = await db.collection("playlists").findOne({
    _id: playlistId,
    $or: [{ visibility: "PUBLIC" }, ...(viewerId ? [{ ownerId: viewerId }] : [])]
  });
  if (!playlist) throw new Error("Playlist not found");
  const videos = await db.collection("videos").find({ _id: { $in: playlist.videoIds }, status: "PUBLISHED", visibility: "PUBLIC" }).toArray();
  const byId = new Map<any, any>(videos.map((v: any) => [v._id.toHexString(), v]));
  const orderedVideos = playlist.videoIds.map((id: ObjectId) => byId.get(id.toHexString())).filter(Boolean).map((v: any) => ({
    id: v._id.toHexString(), ownerId: v.ownerId?.toHexString?.() ?? String(v.ownerId),
    caption: v.caption ?? "", hashtags: v.hashtags ?? [], playback: v.playback ?? null, thumbnail: v.thumbnail ?? null, publishedAt: v.publishedAt ?? null
  }));
  return { ...toPlaylist(playlist), videos: orderedVideos };
}

function toPlaylist(item: any) {
  return {
    id: item._id.toHexString(),
    ownerId: item.ownerId.toHexString(),
    title: item.title,
    description: item.description ?? "",
    visibility: item.visibility,
    videoIds: (item.videoIds ?? []).map((id: ObjectId) => id.toHexString()),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}
