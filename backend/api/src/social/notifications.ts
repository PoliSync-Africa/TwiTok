import { ObjectId, type Db } from "mongodb";
import { broadcastToUser } from "../realtime/ws.js";

export type NotificationType = "FOLLOW" | "LIKE" | "COMMENT" | "REPOST" | "MENTION";
export type SystemNotificationCategory =
  | "ACCOUNT_UPDATES"
  | "TWITOK"
  | "LIVE"
  | "PROMOTE_ASSISTANT"
  | "SAFETY"
  | "CREATOR";

export type SystemNotificationAudience = "ALL" | "CREATORS" | "VERIFIED" | "COUNTRY" | "INDIVIDUALS";

let systemIndexesPromise: Promise<unknown> | null = null;

async function ensureSystemIndexes(db: Db) {
  if (!systemIndexesPromise) {
    systemIndexesPromise = Promise.all([
      db.collection("system_announcements").createIndex({ status: 1, startsAt: 1, expiresAt: 1, createdAt: -1 }),
      db.collection("system_announcements").createIndex({ audience: 1, targetCountryCode: 1, createdAt: -1 }),
      db.collection("system_announcements").createIndex({ audience: 1, targetUserIds: 1, createdAt: -1 }),
      db.collection("system_notification_reads").createIndex({ userId: 1, announcementId: 1 }, { unique: true }),
      db.collection("system_notification_reads").createIndex({ userId: 1, readAt: 1 })
    ]);
  }
  await systemIndexesPromise;
}

export async function initializeNotificationIndexes(db: Db) {
  await Promise.all([
    db.collection("notifications").createIndex({ recipientId: 1, createdAt: -1 }),
    db.collection("notifications").createIndex({ recipientId: 1, readAt: 1, createdAt: -1 }),
    db.collection("notifications").createIndex({ actorId: 1, createdAt: -1 }),
    ensureSystemIndexes(db)
  ]);
}

export async function createNotification(
  db: Db,
  input: { recipientId: ObjectId; actorId: ObjectId; type: NotificationType; videoId?: ObjectId; commentId?: ObjectId }
) {
  if (input.recipientId.equals(input.actorId)) return null;
  if (await db.collection("blocks").findOne({
    $or: [
      { blockerId: input.recipientId, blockedId: input.actorId },
      { blockerId: input.actorId, blockedId: input.recipientId }
    ]
  })) return null;

  const now = new Date();
  const result = await db.collection("notifications").insertOne({
    recipientId: input.recipientId,
    actorId: input.actorId,
    type: input.type,
    videoId: input.videoId ?? null,
    commentId: input.commentId ?? null,
    readAt: null,
    createdAt: now
  });
  const payload = {
    id: result.insertedId.toHexString(),
    type: input.type,
    videoId: input.videoId?.toHexString?.() ?? null,
    commentId: input.commentId?.toHexString?.() ?? null,
    createdAt: now
  };
  broadcastToUser(input.recipientId.toHexString(), { type: "notification:new", notification: payload });
  return payload;
}

async function getSystemAudienceFilter(db: Db, userId: ObjectId) {
  const user = await db.collection("users").findOne(
    { _id: userId },
    { projection: { isVerified: 1, countryCode: 1 } }
  );
  const creator = await db.collection("creator_profiles").findOne({ userId }, { projection: { _id: 1 } });
  const audience: Array<Record<string, unknown>> = [{ audience: "ALL" }, { audience: "INDIVIDUALS", targetUserIds: userId }];
  if (creator) audience.push({ audience: "CREATORS" });
  if (user?.isVerified === true) audience.push({ audience: "VERIFIED" });
  if (typeof user?.countryCode === "string" && user.countryCode.trim()) {
    audience.push({ audience: "COUNTRY", targetCountryCode: user.countryCode.trim().toUpperCase() });
  }
  return { $or: audience };
}

async function listSystemNotifications(db: Db, userId: ObjectId, limit: number) {
  await ensureSystemIndexes(db);
  const now = new Date();
  const audienceFilter = await getSystemAudienceFilter(db, userId);
  const announcements = await db.collection("system_announcements").find({
    status: "PUBLISHED",
    startsAt: { $lte: now },
    $and: [
      audienceFilter,
      { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }
    ]
  }).sort({ priority: -1, createdAt: -1 }).limit(limit).toArray();

  const ids = announcements.map(item => item._id);
  const reads = ids.length
    ? await db.collection("system_notification_reads").find({ userId, announcementId: { $in: ids } }).toArray()
    : [];
  const readIds = new Set(reads.map(row => row.announcementId.toHexString()));

  return announcements.map(item => ({
    id: `system:${item._id.toHexString()}`,
    type: "SYSTEM" as const,
    category: item.category as SystemNotificationCategory,
    title: item.title as string,
    body: item.body as string,
    actionLabel: item.actionLabel ?? null,
    actionUrl: item.actionUrl ?? null,
    read: readIds.has(item._id.toHexString()),
    createdAt: item.createdAt,
    videoId: null,
    commentId: null,
    actor: null
  }));
}

export async function listNotifications(db: Db, userId: ObjectId, limit = 30) {
  const safeLimit = Math.min(Math.max(Number.isFinite(limit) ? limit : 30, 1), 100);
  const [personalItems, systemItems] = await Promise.all([
    db.collection("notifications").aggregate([
      { $match: { recipientId: userId } },
      { $sort: { createdAt: -1 } },
      { $limit: safeLimit },
      { $lookup: { from: "users", localField: "actorId", foreignField: "_id", as: "actor" } },
      { $unwind: { path: "$actor", preserveNullAndEmptyArrays: true } }
    ]).toArray(),
    listSystemNotifications(db, userId, safeLimit)
  ]);

  const personal = personalItems.map(item => ({
    id: item._id.toHexString(),
    type: item.type as NotificationType,
    category: null,
    title: null,
    body: null,
    actionLabel: null,
    actionUrl: null,
    read: Boolean(item.readAt),
    createdAt: item.createdAt,
    videoId: item.videoId?.toHexString?.() ?? null,
    commentId: item.commentId?.toHexString?.() ?? null,
    actor: item.actor ? {
      id: item.actor._id.toHexString(),
      username: item.actor.username,
      nickname: item.actor.nickname
    } : null
  }));

  return [...personal, ...systemItems]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, safeLimit);
}

async function getRelevantSystemAnnouncements(db: Db, userId: ObjectId) {
  await ensureSystemIndexes(db);
  const now = new Date();
  const audienceFilter = await getSystemAudienceFilter(db, userId);
  return db.collection("system_announcements").find({
    status: "PUBLISHED",
    startsAt: { $lte: now },
    $and: [
      audienceFilter,
      { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }
    ]
  }, { projection: { _id: 1 } }).toArray();
}

export async function getUnreadNotificationCount(db: Db, userId: ObjectId) {
  const [personalCount, systemAnnouncements] = await Promise.all([
    db.collection("notifications").countDocuments({ recipientId: userId, readAt: null }),
    getRelevantSystemAnnouncements(db, userId)
  ]);
  if (!systemAnnouncements.length) return personalCount;
  const readCount = await db.collection("system_notification_reads").countDocuments({
    userId,
    announcementId: { $in: systemAnnouncements.map(item => item._id) }
  });
  return personalCount + Math.max(0, systemAnnouncements.length - readCount);
}

export async function markNotificationsRead(db: Db, userId: ObjectId, notificationId?: string) {
  await ensureSystemIndexes(db);

  if (notificationId?.startsWith("system:")) {
    const id = notificationId.slice("system:".length);
    if (!ObjectId.isValid(id)) throw new Error("Invalid system notification id");
    await db.collection("system_notification_reads").updateOne(
      { userId, announcementId: new ObjectId(id) },
      { $set: { userId, announcementId: new ObjectId(id), readAt: new Date() } },
      { upsert: true }
    );
    return { markedRead: 1 };
  }

  const filter: Record<string, unknown> = { recipientId: userId, readAt: null };
  if (notificationId) {
    if (!ObjectId.isValid(notificationId)) throw new Error("Invalid notification id");
    filter._id = new ObjectId(notificationId);
  }

  const result = await db.collection("notifications").updateMany(filter, { $set: { readAt: new Date() } });

  if (!notificationId) {
    const systemAnnouncements = await getRelevantSystemAnnouncements(db, userId);
    if (systemAnnouncements.length) {
      await db.collection("system_notification_reads").bulkWrite(
        systemAnnouncements.map(item => ({
          updateOne: {
            filter: { userId, announcementId: item._id },
            update: { $set: { userId, announcementId: item._id, readAt: new Date() } },
            upsert: true
          }
        })),
        { ordered: false }
      );
    }
  }

  return { markedRead: result.modifiedCount };
}
