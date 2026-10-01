import { ObjectId, type Db } from "mongodb";

export async function initializeLiveIndexes(db: Db) {
  await Promise.all([
    db.collection("live_streams").createIndex({ streamId: 1 }, { unique: true }),
    db.collection("live_streams").createIndex({ hostUserId: 1, createdAt: -1 }),
    db.collection("live_streams").createIndex({ status: 1, startedAt: -1 }),
    db.collection("live_events").createIndex({ streamId: 1, createdAt: -1 }),
    db.collection("live_moderators").createIndex({ streamId: 1, userId: 1 }, { unique: true }),
    db.collection("live_guests").createIndex({ streamId: 1, userId: 1 }, { unique: true }),
    db.collection("live_guests").createIndex({ streamId: 1, status: 1, updatedAt: -1 }),
    db.collection("live_viewers").createIndex({ streamId: 1, userId: 1 }, { unique: true }),
    db.collection("live_viewers").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("live_comments").createIndex({ streamId: 1, createdAt: -1 }),
    db.collection("live_reactions").createIndex({ streamId: 1, userId: 1 }, { unique: true }),
    db.collection("live_reactions").createIndex({ streamId: 1, reaction: 1 }),
    db.collection("live_blocks").createIndex({ streamId: 1, userId: 1 }, { unique: true }),
    db.collection("live_mutes").createIndex({ streamId: 1, userId: 1 }, { unique: true }),
    db.collection("live_mutes").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("live_reports").createIndex({ streamId: 1, createdAt: -1 }),
    db.collection("live_gift_events").createIndex({ transactionId: 1 }, { unique: true }),
    db.collection("live_gift_events").createIndex({ streamId: 1, createdAt: -1 }),
    db.collection("live_gift_events").createIndex({ streamId: 1, senderId: 1, createdAt: -1 })
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


export async function getLiveGiftLeaderboard(db: Db, streamId: string, limit = 20) {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const rows = await db.collection("live_gift_events").aggregate([
    { $match: { streamId } },
    {
      $group: {
        _id: "$senderId",
        gifts: { $sum: 1 },
        quantity: { $sum: "$quantity" },
        coinsSpent: { $sum: "$coinsSpent" }
      }
    },
    { $sort: { coinsSpent: -1, quantity: -1, _id: 1 } },
    { $limit: safeLimit }
  ]).toArray();

  return rows.map((row, index) => ({
    rank: index + 1,
    userId: String(row._id),
    gifts: Number(row.gifts),
    quantity: Number(row.quantity),
    coinsSpent: Number(row.coinsSpent)
  }));
}

export async function getLiveReactionSummary(db: Db, streamId: string) {
  const rows = await db.collection("live_reactions").aggregate([
    { $match: { streamId } },
    { $group: { _id: "$reaction", count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } }
  ]).toArray();
  return rows.map((row) => ({ reaction: String(row._id), count: Number(row.count) }));
}

async function isLiveRestricted(db: Db, streamId: string, userId: string) {
  const blocked = await db.collection("live_blocks").findOne({ streamId, userId });
  if (blocked) return true;
  const mute = await db.collection("live_mutes").findOne({ streamId, userId, expiresAt: { $gt: new Date() } });
  return Boolean(mute);
}


const LIVE_GUEST_MAX = 15;

async function getLiveGuestState(db: Db, streamId: string, userId: string) {
  return db.collection("live_guests").findOne({ streamId, userId });
}

export async function inviteLiveGuest(db: Db, streamId: string, hostUserId: string, userId: string) {
  const stream = await db.collection("live_streams").findOne({ streamId, hostUserId, status: "LIVE" }, { projection: { streamId: 1 } });
  if (!stream) throw new Error("Only the host can invite guests to an active LIVE");
  if (!userId || userId === hostUserId) throw new Error("A valid guest user is required");
  if (await isLiveRestricted(db, streamId, userId)) throw new Error("This user is restricted from joining the LIVE");
  const activeCount = await db.collection("live_guests").countDocuments({ streamId, status: "ACTIVE" });
  const existing = await getLiveGuestState(db, streamId, userId);
  if (existing?.status === "ACTIVE") return existing;
  if (activeCount >= LIVE_GUEST_MAX) throw new Error("This LIVE already has the maximum number of guests");
  const now = new Date();
  const guest = {
    streamId,
    userId,
    hostUserId,
    status: "INVITED" as const,
    invitedAt: now,
    updatedAt: now
  };
  await db.collection("live_guests").updateOne(
    { streamId, userId },
    { $set: guest, $unset: { respondedAt: "", joinedAt: "", leftAt: "" } },
    { upsert: true }
  );
  return guest;
}

export async function respondLiveGuestInvite(db: Db, streamId: string, userId: string, response: "ACCEPT" | "DECLINE") {
  const invite = await getLiveGuestState(db, streamId, userId);
  if (!invite || invite.status !== "INVITED") throw new Error("LIVE guest invitation not found");
  const stream = await db.collection("live_streams").findOne({ streamId, status: "LIVE" }, { projection: { streamId: 1 } });
  if (!stream) throw new Error("LIVE stream is no longer active");
  const now = new Date();
  if (response === "DECLINE") {
    await db.collection("live_guests").updateOne(
      { streamId, userId, status: "INVITED" },
      { $set: { status: "DECLINED", respondedAt: now, updatedAt: now } }
    );
    return { streamId, userId, status: "DECLINED" };
  }
  if (await isLiveRestricted(db, streamId, userId)) throw new Error("You are restricted from joining this LIVE");
  const activeCount = await db.collection("live_guests").countDocuments({ streamId, status: "ACTIVE" });
  if (activeCount >= LIVE_GUEST_MAX) throw new Error("The LIVE guest slots are full");
  await db.collection("live_guests").updateOne(
    { streamId, userId, status: "INVITED" },
    { $set: { status: "ACTIVE", respondedAt: now, joinedAt: now, updatedAt: now } }
  );
  return { streamId, userId, status: "ACTIVE" };
}

export async function removeLiveGuest(db: Db, streamId: string, actorUserId: string, userId: string) {
  const stream = await db.collection("live_streams").findOne({ streamId }, { projection: { hostUserId: 1, status: 1 } });
  if (!stream) throw new Error("LIVE stream not found");
  if (String(stream.hostUserId) !== actorUserId && actorUserId !== userId) throw new Error("Only the host or guest can leave this LIVE guest session");
  await db.collection("live_guests").updateOne(
    { streamId, userId, status: "ACTIVE" },
    { $set: { status: "REMOVED", leftAt: new Date(), updatedAt: new Date() } }
  );
  return { streamId, userId, status: "REMOVED" };
}

export async function listLiveGuests(db: Db, streamId: string) {
  return db.collection("live_guests").find(
    { streamId, status: { $in: ["INVITED", "ACTIVE"] } },
    { projection: { _id: 0, streamId: 1, userId: 1, hostUserId: 1, status: 1, invitedAt: 1, respondedAt: 1, joinedAt: 1, updatedAt: 1 } }
  ).sort({ status: 1, updatedAt: -1 }).limit(LIVE_GUEST_MAX + 10).toArray();
}

export async function addLiveModerator(db: Db, streamId: string, hostUserId: string, userId: string) {
  const stream = await db.collection("live_streams").findOne({ streamId, hostUserId });
  if (!stream) throw new Error("Only the host can manage LIVE moderators");
  const now = new Date();
  await db.collection("live_moderators").updateOne({ streamId, userId }, { $set: { streamId, userId, createdAt: now } }, { upsert: true });
  return { streamId, userId, moderator: true };
}

export async function removeLiveModerator(db: Db, streamId: string, hostUserId: string, userId: string) {
  const stream = await db.collection("live_streams").findOne({ streamId, hostUserId });
  if (!stream) throw new Error("Only the host can manage LIVE moderators");
  await db.collection("live_moderators").deleteOne({ streamId, userId });
  return { streamId, userId, moderator: false };
}

async function canModerateLive(db: Db, streamId: string, userId: string) {
  const stream = await db.collection("live_streams").findOne({ streamId }, { projection: { hostUserId: 1 } });
  if (!stream) return false;
  if (String(stream.hostUserId) === userId) return true;
  return Boolean(await db.collection("live_moderators").findOne({ streamId, userId }));
}

export async function setLiveMute(db: Db, streamId: string, moderatorId: string, userId: string, durationSeconds = 300) {
  if (!(await canModerateLive(db, streamId, moderatorId))) throw new Error("Only the host or a moderator can mute viewers");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Math.min(86400, Math.max(10, durationSeconds)) * 1000);
  await db.collection("live_mutes").updateOne({ streamId, userId }, { $set: { streamId, userId, moderatorId, createdAt: now, expiresAt } }, { upsert: true });
  return { streamId, userId, expiresAt };
}

export async function setLiveBlock(db: Db, streamId: string, moderatorId: string, userId: string) {
  if (!(await canModerateLive(db, streamId, moderatorId))) throw new Error("Only the host or a moderator can block viewers");
  await db.collection("live_blocks").updateOne({ streamId, userId }, { $set: { streamId, userId, moderatorId, createdAt: new Date() } }, { upsert: true });
  await db.collection("live_viewers").deleteOne({ streamId, userId });
  return { streamId, userId, blocked: true };
}

export async function removeLiveBlock(db: Db, streamId: string, moderatorId: string, userId: string) {
  if (!(await canModerateLive(db, streamId, moderatorId))) throw new Error("Only the host or a moderator can unblock viewers");
  await db.collection("live_blocks").deleteOne({ streamId, userId });
  return { streamId, userId, blocked: false };
}

export async function reportLiveUser(db: Db, streamId: string, reporterId: string, targetUserId: string, reason: string) {
  const cleanReason = reason.trim().slice(0, 500);
  if (!cleanReason) throw new Error("A report reason is required");
  const stream = await db.collection("live_streams").findOne({ streamId });
  if (!stream) throw new Error("LIVE stream not found");
  const report = { reportId: new ObjectId().toHexString(), streamId, reporterId, targetUserId, reason: cleanReason, createdAt: new Date() };
  await db.collection("live_reports").insertOne(report);
  return report;
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
