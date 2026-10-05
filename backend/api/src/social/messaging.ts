import { ObjectId, type Db } from "mongodb";

export type MessageStatus = "SENT" | "DELIVERED" | "READ";
export type MessageType = "TEXT" | "VOICE";

export async function ensureMessagingIndexes(db: Db) {
  await Promise.all([
    db.collection("conversations").createIndex({ memberIds: 1, updatedAt: -1 }),
    db.collection("messages").createIndex({ conversationId: 1, createdAt: -1 }),
    db.collection("messages").createIndex({ recipientId: 1, status: 1, createdAt: -1 }),
    db.collection("messages").createIndex({ senderId: 1, createdAt: -1 }),
    db.collection("blocks").createIndex({ blockerId: 1, blockedId: 1 }, { unique: true })
  ]);
}

async function assertActiveUser(db: Db, userId: ObjectId) {
  const user = await db.collection("users").findOne({ _id: userId, status: "ACTIVE" }, { projection: { _id: 1, username: 1, nickname: 1 } });
  if (!user) throw new Error("User not found");
  return user;
}

async function assertNotBlocked(db: Db, firstUserId: ObjectId, secondUserId: ObjectId) {
  const blocked = await db.collection("blocks").findOne({
    $or: [
      { blockerId: firstUserId, blockedId: secondUserId },
      { blockerId: secondUserId, blockedId: firstUserId }
    ]
  }, { projection: { _id: 1 } });
  if (blocked) throw new Error("Messaging is unavailable between these users");
}

async function getConversationForUser(db: Db, userId: ObjectId, conversationId: ObjectId) {
  const conversation = await db.collection("conversations").findOne({ _id: conversationId, memberIds: userId });
  if (!conversation) throw new Error("Conversation not found");
  return conversation;
}

function getRecipientId(conversation: { memberIds?: ObjectId[] }, userId: ObjectId) {
  const recipientId = (conversation.memberIds ?? []).find(id => !id.equals(userId));
  if (!recipientId) throw new Error("Recipient not found");
  return recipientId;
}

export async function getOrCreateDirectConversation(db: Db, userId: ObjectId, otherUserId: ObjectId) {
  if (userId.equals(otherUserId)) throw new Error("You cannot message yourself");
  await assertActiveUser(db, userId);
  await assertActiveUser(db, otherUserId);
  await assertNotBlocked(db, userId, otherUserId);

  const existing = await db.collection("conversations").findOne({ type: "DIRECT", memberIds: { $all: [userId, otherUserId], $size: 2 } });
  if (existing) return existing;

  const now = new Date();
  const result = await db.collection("conversations").insertOne({
    type: "DIRECT",
    memberIds: [userId, otherUserId],
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
    lastMessagePreview: null
  });
  return db.collection("conversations").findOne({ _id: result.insertedId });
}

export async function listConversations(db: Db, userId: ObjectId) {
  const conversations = await db.collection("conversations").find({ memberIds: userId }).sort({ updatedAt: -1 }).limit(100).toArray();
  const otherIds = conversations.flatMap(c => (c.memberIds as ObjectId[]).filter(id => !id.equals(userId)));
  const users = await db.collection("users").find(
    { _id: { $in: otherIds } },
    { projection: { username: 1, nickname: 1, profilePhotoUrl: 1 } }
  ).toArray();
  const byId = new Map(users.map(u => [u._id.toHexString(), u]));

  const conversationIds = conversations.map(c => c._id);
  const unreadRows = conversationIds.length
    ? await db.collection("messages").aggregate([
        { $match: { conversationId: { $in: conversationIds }, recipientId: userId, status: { $in: ["SENT", "DELIVERED"] } } },
        { $group: { _id: "$conversationId", count: { $sum: 1 } } }
      ]).toArray()
    : [];
  const unreadByConversation = new Map(unreadRows.map(row => [row._id.toHexString(), Number(row.count ?? 0)]));

  return conversations.map(c => {
    const otherId = (c.memberIds as ObjectId[]).find(id => !id.equals(userId))?.toHexString() ?? "";
    return {
      id: c._id.toHexString(),
      otherUser: byId.get(otherId) ?? null,
      lastMessagePreview: c.lastMessagePreview ?? null,
      lastMessageAt: c.lastMessageAt ?? null,
      updatedAt: c.updatedAt,
      unreadCount: unreadByConversation.get(c._id.toHexString()) ?? 0
    };
  });
}

export async function listMessages(db: Db, userId: ObjectId, conversationId: ObjectId, before?: Date) {
  const conversation = await getConversationForUser(db, userId, conversationId);
  const recipientId = getRecipientId(conversation as { memberIds?: ObjectId[] }, userId);
  await assertNotBlocked(db, userId, recipientId);
  const query: any = { conversationId };
  if (before) query.createdAt = { $lt: before };
  const messages = await db.collection("messages").find(query).sort({ createdAt: -1 }).limit(50).toArray();
  return messages.reverse();
}

export async function createTextMessage(db: Db, userId: ObjectId, conversationId: ObjectId, text: string) {
  const clean = text.trim().slice(0, 4000);
  if (!clean) throw new Error("Message cannot be empty");

  const conversation = await getConversationForUser(db, userId, conversationId);
  const recipientId = getRecipientId(conversation as { memberIds?: ObjectId[] }, userId);
  await assertNotBlocked(db, userId, recipientId);
  const now = new Date();
  const result = await db.collection("messages").insertOne({
    conversationId, senderId: userId, recipientId, type: "TEXT" satisfies MessageType, text: clean,
    status: "SENT" satisfies MessageStatus, createdAt: now, updatedAt: now, deliveredAt: null, readAt: null
  });
  await db.collection("conversations").updateOne({ _id: conversationId }, { $set: { updatedAt: now, lastMessageAt: now, lastMessagePreview: clean.slice(0, 120) } });
  return db.collection("messages").findOne({ _id: result.insertedId });
}

export async function createVoiceMessage(db: Db, userId: ObjectId, conversationId: ObjectId, input: { objectKey: string; mimeType: string; durationMs: number; sizeBytes: number }) {
  const conversation = await getConversationForUser(db, userId, conversationId);
  const recipientId = getRecipientId(conversation as { memberIds?: ObjectId[] }, userId);
  await assertNotBlocked(db, userId, recipientId);
  const durationMs = Math.max(0, Math.min(Math.round(input.durationMs), 5 * 60 * 1000));
  if (!durationMs) throw new Error("Voice message duration is required");
  if (!input.objectKey || !input.mimeType.startsWith("audio/")) throw new Error("Invalid voice media");
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > 25 * 1024 * 1024) throw new Error("Voice message is too large");
  const now = new Date();
  const result = await db.collection("messages").insertOne({
    conversationId, senderId: userId, recipientId, type: "VOICE" satisfies MessageType, text: "",
    media: { objectKey: input.objectKey, mimeType: input.mimeType, durationMs, sizeBytes: input.sizeBytes },
    status: "SENT" satisfies MessageStatus, createdAt: now, updatedAt: now, deliveredAt: null, readAt: null
  });
  await db.collection("conversations").updateOne({ _id: conversationId }, { $set: { updatedAt: now, lastMessageAt: now, lastMessagePreview: "🎤 Voice message" } });
  return db.collection("messages").findOne({ _id: result.insertedId });
}

export type MessageStatusUpdate = { conversationId: string; status: Exclude<MessageStatus, "SENT">; messageIds: string[]; senderIds: string[]; at: string; };

export async function markMessagesDelivered(db: Db, userId: ObjectId, conversationId: ObjectId) {
  const conversation = await getConversationForUser(db, userId, conversationId);
  const senderId = getRecipientId(conversation as { memberIds?: ObjectId[] }, userId);
  await assertNotBlocked(db, userId, senderId);
  const now = new Date();
  const pending = await db.collection("messages").find({ conversationId, recipientId: userId, status: "SENT" }, { projection: { _id: 1, senderId: 1 } }).toArray();
  if (!pending.length) return { conversationId: conversationId.toHexString(), status: "DELIVERED" as const, messageIds: [] as string[], senderIds: [] as string[], at: now.toISOString() };
  await db.collection("messages").updateMany({ _id: { $in: pending.map(message => message._id) }, status: "SENT" }, { $set: { status: "DELIVERED", deliveredAt: now, updatedAt: now } });
  return { conversationId: conversationId.toHexString(), status: "DELIVERED" as const, messageIds: pending.map(message => message._id.toHexString()), senderIds: [...new Set(pending.map(message => message.senderId.toHexString()))], at: now.toISOString() };
}

export async function markMessagesRead(db: Db, userId: ObjectId, conversationId: ObjectId) {
  const conversation = await getConversationForUser(db, userId, conversationId);
  const senderId = getRecipientId(conversation as { memberIds?: ObjectId[] }, userId);
  await assertNotBlocked(db, userId, senderId);
  const now = new Date();
  const pending = await db.collection("messages").find({ conversationId, recipientId: userId, status: { $in: ["SENT", "DELIVERED"] } }, { projection: { _id: 1, senderId: 1 } }).toArray();
  if (!pending.length) return { conversationId: conversationId.toHexString(), status: "READ" as const, messageIds: [] as string[], senderIds: [] as string[], at: now.toISOString() };
  await db.collection("messages").updateMany({ _id: { $in: pending.map(message => message._id) }, status: { $in: ["SENT", "DELIVERED"] } }, { $set: { status: "READ", readAt: now, deliveredAt: now, updatedAt: now } });
  return { conversationId: conversationId.toHexString(), status: "READ" as const, messageIds: pending.map(message => message._id.toHexString()), senderIds: [...new Set(pending.map(message => message.senderId.toHexString()))], at: now.toISOString() };
}
