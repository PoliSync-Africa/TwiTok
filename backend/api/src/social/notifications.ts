import { ObjectId, type Db } from "mongodb";
import { broadcastToUser } from "../realtime/ws.js";

export type NotificationType = "FOLLOW" | "LIKE" | "COMMENT" | "REPOST" | "MENTION" | "LIVE_GUEST_INVITE" | "LIVE_GUEST_RESPONSE";

export async function initializeNotificationIndexes(db: Db) {
  await Promise.all([
    db.collection("notifications").createIndex({ recipientId: 1, createdAt: -1 }),
    db.collection("notifications").createIndex({ recipientId: 1, readAt: 1, createdAt: -1 }),
    db.collection("notifications").createIndex({ actorId: 1, createdAt: -1 })
  ]);
}

export async function createNotification(
  db: Db,
  input: { recipientId: ObjectId; actorId: ObjectId; type: NotificationType; videoId?: ObjectId; commentId?: ObjectId; streamId?: string; metadata?: Record<string, string> }
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
    streamId: input.streamId ?? null,
    metadata: input.metadata ?? null,
    readAt: null,
    createdAt: now
  });
  const payload = { id: result.insertedId.toHexString(), type: input.type, videoId: input.videoId?.toHexString?.() ?? null, commentId: input.commentId?.toHexString?.() ?? null, streamId: input.streamId ?? null, metadata: input.metadata ?? null, createdAt: now };
  broadcastToUser(input.recipientId.toHexString(), { type: "notification:new", notification: payload });
  return payload;
}

export async function listNotifications(db: Db, userId: ObjectId, limit = 30) {
  const safeLimit = Math.min(Math.max(Number.isFinite(limit) ? limit : 30, 1), 100);
  const items = await db.collection("notifications").aggregate([
    { $match: { recipientId: userId } },
    { $sort: { createdAt: -1 } },
    { $limit: safeLimit },
    { $lookup: { from: "users", localField: "actorId", foreignField: "_id", as: "actor" } },
    { $unwind: { path: "$actor", preserveNullAndEmptyArrays: true } }
  ]).toArray();
  return items.map(item => ({
    id: item._id.toHexString(),
    type: item.type,
    read: Boolean(item.readAt),
    createdAt: item.createdAt,
    videoId: item.videoId?.toHexString?.() ?? null,
    commentId: item.commentId?.toHexString?.() ?? null,
    streamId: item.streamId ?? null,
    metadata: item.metadata ?? null,
    actor: item.actor ? {
      id: item.actor._id.toHexString(),
      username: item.actor.username,
      nickname: item.actor.nickname
    } : null
  }));
}

export async function getUnreadNotificationCount(db: Db, userId: ObjectId) {
  return db.collection("notifications").countDocuments({ recipientId: userId, readAt: null });
}

export async function markNotificationsRead(db: Db, userId: ObjectId, notificationId?: string) {
  const filter: any = { recipientId: userId, readAt: null };
  if (notificationId) {
    if (!ObjectId.isValid(notificationId)) throw new Error("Invalid notification id");
    filter._id = new ObjectId(notificationId);
  }
  const result = await db.collection("notifications").updateMany(filter, { $set: { readAt: new Date() } });
  return { markedRead: result.modifiedCount };
}
