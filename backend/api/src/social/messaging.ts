import { ObjectId, type Db } from "mongodb";

export type MessageStatus = "SENT" | "DELIVERED" | "READ";

export async function ensureMessagingIndexes(db: Db) {
  await Promise.all([
    db.collection("conversations").createIndex({ memberIds: 1, updatedAt: -1 }),
    db.collection("messages").createIndex({ conversationId: 1, createdAt: -1 }),
    db.collection("messages").createIndex({ recipientId: 1, status: 1, createdAt: -1 }),
    db.collection("messages").createIndex({ senderId: 1, createdAt: -1 })
  ]);
}

async function assertActiveUser(db: Db, userId: ObjectId) {
  const user = await db.collection("users").findOne({ _id: userId, status: "ACTIVE" }, { projection: { _id: 1, username: 1, nickname: 1 } });
  if (!user) throw new Error("User not found");
  return user;
}

export async function getOrCreateDirectConversation(db: Db, userId: ObjectId, otherUserId: ObjectId) {
  if (userId.equals(otherUserId)) throw new Error("You cannot message yourself");
  await assertActiveUser(db, userId);
  await assertActiveUser(db, otherUserId);

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
  const users = await db.collection("users").find({ _id: { $in: otherIds } }, { projection: { username: 1, nickname: 1 } }).toArray();
  const byId = new Map(users.map(u => [u._id.toHexString(), u]));
  return conversations.map(c => ({
    id: c._id.toHexString(),
    otherUser: byId.get((c.memberIds as ObjectId[]).find(id => !id.equals(userId))?.toHexString() ?? "") ?? null,
    lastMessagePreview: c.lastMessagePreview ?? null,
    lastMessageAt: c.lastMessageAt ?? null,
    updatedAt: c.updatedAt
  }));
}

export async function listMessages(db: Db, userId: ObjectId, conversationId: ObjectId, before?: Date) {
  const conversation = await db.collection("conversations").findOne({ _id: conversationId, memberIds: userId });
  if (!conversation) throw new Error("Conversation not found");
  const query: any = { conversationId };
  if (before) query.createdAt = { $lt: before };
  const messages = await db.collection("messages").find(query).sort({ createdAt: -1 }).limit(50).toArray();
  return messages.reverse();
}

export async function createTextMessage(db: Db, userId: ObjectId, conversationId: ObjectId, text: string) {
  const clean = text.trim().slice(0, 4000);
  if (!clean) throw new Error("Message cannot be empty");

  const conversation = await db.collection("conversations").findOne({ _id: conversationId, memberIds: userId });
  if (!conversation) throw new Error("Conversation not found");

  const recipientId = (conversation.memberIds as ObjectId[]).find(id => !id.equals(userId));
  if (!recipientId) throw new Error("Recipient not found");

  const now = new Date();
  const result = await db.collection("messages").insertOne({
    conversationId,
    senderId: userId,
    recipientId,
    type: "TEXT",
    text: clean,
    status: "SENT" satisfies MessageStatus,
    createdAt: now,
    updatedAt: now,
    deliveredAt: null,
    readAt: null
  });

  await db.collection("conversations").updateOne(
    { _id: conversationId },
    { $set: { updatedAt: now, lastMessageAt: now, lastMessagePreview: clean.slice(0, 120) } }
  );

  return db.collection("messages").findOne({ _id: result.insertedId });
}

export async function markMessagesDelivered(db: Db, userId: ObjectId, conversationId: ObjectId) {
  const now = new Date();
  await db.collection("messages").updateMany(
    { conversationId, recipientId: userId, status: "SENT" },
    { $set: { status: "DELIVERED", deliveredAt: now, updatedAt: now } }
  );
  return now;
}

export async function markMessagesRead(db: Db, userId: ObjectId, conversationId: ObjectId) {
  const now = new Date();
  await db.collection("messages").updateMany(
    { conversationId, recipientId: userId, status: { $in: ["SENT", "DELIVERED"] } },
    { $set: { status: "READ", readAt: now, deliveredAt: now, updatedAt: now } }
  );
  return now;
}
