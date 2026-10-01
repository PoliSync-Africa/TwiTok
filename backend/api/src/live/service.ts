import { ObjectId, type Db } from "mongodb";

export async function initializeLiveIndexes(db: Db) {
  await Promise.all([
    db.collection("live_streams").createIndex({ streamId: 1 }, { unique: true }),
    db.collection("live_streams").createIndex({ hostUserId: 1, createdAt: -1 }),
    db.collection("live_streams").createIndex({ status: 1, startedAt: -1 }),
    db.collection("live_events").createIndex({ streamId: 1, createdAt: -1 }),
    db.collection("live_moderators").createIndex({ streamId: 1, userId: 1 }, { unique: true }),
    db.collection("live_viewers").createIndex({ streamId: 1, userId: 1 }, { unique: true }),
    db.collection("live_viewers").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("live_comments").createIndex({ streamId: 1, createdAt: -1 }),
    db.collection("live_reactions").createIndex({ streamId: 1, userId: 1 }, { unique: true }),
    db.collection("live_reactions").createIndex({ streamId: 1, reaction: 1 }),
    db.collection("live_blocks").createIndex({ streamId: 1, userId: 1 }, { unique: true }),
    db.collection("live_mutes").createIndex({ streamId: 1, userId: 1 }, { unique: true }),
    db.collection("live_mutes").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("live_reports").createIndex({ streamId: 1, createdAt: -1 })
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



const LIVE_COMMENT_MAX = 300;
const LIVE_REACTION_MAX_LENGTH = 64;

function normalizeLiveReaction(reaction: string) {
  const value = reaction.normalize("NFKC").trim();
  if (!value || value.length > LIVE_REACTION_MAX_LENGTH) throw new Error("Reaction must contain 1-64 characters");
  if (/[\\u0000-\\u001F\\u007F]/u.test(value)) throw new Error("Reaction contains unsupported control characters");
  return value;
}

export async function addLiveComment(db: Db, streamId: string, userId: string, text: string) {
  const clean = text.trim();
  if (!clean || clean.length > LIVE_COMMENT_MAX) throw new Error("Comment must contain 1-300 characters");
  const stream = await db.collection("live_streams").findOne({ streamId, status: "LIVE" }, { projection: { streamId: 1 } });
  if (stream && await isLiveRestricted(db, streamId, userId)) throw new Error("You are restricted from interacting in this LIVE");
  if (!stream) return null;
  const now = new Date();
  const comment = { commentId: new ObjectId().toHexString(), streamId, userId, text: clean, createdAt: now };
  await db.collection("live_comments").insertOne(comment);
  return comment;
}

export async function setLiveReaction(db: Db, streamId: string, userId: string, reaction: string) {
  const type = normalizeLiveReaction(reaction);
  const stream = await db.collection("live_streams").findOne({ streamId, status: "LIVE" }, { projection: { streamId: 1 } });
  if (!stream) return null;
  if (await isLiveRestricted(db, streamId, userId)) throw new Error("You are restricted from interacting in this LIVE");
  const now = new Date();
  await db.collection("live_reactions").updateOne(
    { streamId, userId },
    { $set: { streamId, userId, reaction: type, updatedAt: now } },
    { upsert: true }
  );
  return { streamId, reaction: type, updatedAt: now };
}

export async function removeLiveReaction(db: Db, streamId: string, userId: string) {
  await db.collection("live_reactions").deleteOne({ streamId, userId });
  return { streamId, removed: true };
}

async function isLiveRestricted(db: Db, streamId: string, userId: string) {\n  const blocked = await db.collection("live_blocks").findOne({ streamId, userId });\n  if (blocked) return true;\n  const mute = await db.collection("live_mutes").findOne({ streamId, userId, expiresAt: { $gt: new Date() } });\n  return Boolean(mute);\n}\n\nexport async function addLiveModerator(db: Db, streamId: string, hostUserId: string, userId: string) {\n  const stream = await db.collection("live_streams").findOne({ streamId, hostUserId });\n  if (!stream) throw new Error("Only the host can manage LIVE moderators");\n  const now = new Date();\n  await db.collection("live_moderators").updateOne({ streamId, userId }, { $set: { streamId, userId, createdAt: now } }, { upsert: true });\n  return { streamId, userId, moderator: true };\n}\n\nexport async function removeLiveModerator(db: Db, streamId: string, hostUserId: string, userId: string) {\n  const stream = await db.collection("live_streams").findOne({ streamId, hostUserId });\n  if (!stream) throw new Error("Only the host can manage LIVE moderators");\n  await db.collection("live_moderators").deleteOne({ streamId, userId });\n  return { streamId, userId, moderator: false };\n}\n\nasync function canModerateLive(db: Db, streamId: string, userId: string) {\n  const stream = await db.collection("live_streams").findOne({ streamId }, { projection: { hostUserId: 1 } });\n  if (!stream) return false;\n  if (String(stream.hostUserId) === userId) return true;\n  return Boolean(await db.collection("live_moderators").findOne({ streamId, userId }));\n}\n\nexport async function setLiveMute(db: Db, streamId: string, moderatorId: string, userId: string, durationSeconds = 300) {\n  if (!(await canModerateLive(db, streamId, moderatorId))) throw new Error("Only the host or a moderator can mute viewers");\n  const now = new Date();\n  const expiresAt = new Date(now.getTime() + Math.min(86400, Math.max(10, durationSeconds)) * 1000);\n  await db.collection("live_mutes").updateOne({ streamId, userId }, { $set: { streamId, userId, moderatorId, createdAt: now, expiresAt } }, { upsert: true });\n  return { streamId, userId, expiresAt };\n}\n\nexport async function setLiveBlock(db: Db, streamId: string, moderatorId: string, userId: string) {\n  if (!(await canModerateLive(db, streamId, moderatorId))) throw new Error("Only the host or a moderator can block viewers");\n  await db.collection("live_blocks").updateOne({ streamId, userId }, { $set: { streamId, userId, moderatorId, createdAt: new Date() } }, { upsert: true });\n  await db.collection("live_viewers").deleteOne({ streamId, userId });\n  return { streamId, userId, blocked: true };\n}\n\nexport async function removeLiveBlock(db: Db, streamId: string, moderatorId: string, userId: string) {\n  if (!(await canModerateLive(db, streamId, moderatorId))) throw new Error("Only the host or a moderator can unblock viewers");\n  await db.collection("live_blocks").deleteOne({ streamId, userId });\n  return { streamId, userId, blocked: false };\n}\n\nexport async function reportLiveUser(db: Db, streamId: string, reporterId: string, targetUserId: string, reason: string) {\n  const cleanReason = reason.trim().slice(0, 500);\n  if (!cleanReason) throw new Error("A report reason is required");\n  const stream = await db.collection("live_streams").findOne({ streamId });\n  if (!stream) throw new Error("LIVE stream not found");\n  const report = { reportId: new ObjectId().toHexString(), streamId, reporterId, targetUserId, reason: cleanReason, createdAt: new Date() };\n  await db.collection("live_reports").insertOne(report);\n  return report;\n}\n\nexport async function refreshLiveViewer(db: Db, streamId: string, userId: string) {
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
