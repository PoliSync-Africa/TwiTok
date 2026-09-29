import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { createPresignedPlayback, createPresignedUpload, headMediaObject, newMediaJobId, verifyMediaObject } from "../media/storage.js";
import { createTextMessage, createVoiceMessage, getOrCreateDirectConversation, listConversations, listMessages, markMessagesDelivered, markMessagesRead } from "../social/messaging.js";
import { broadcastToUser } from "../realtime/ws.js";

const MAX_VOICE_BYTES = 25 * 1024 * 1024;
const MAX_VOICE_DURATION_MS = 5 * 60 * 1000;
const VOICE_MIME_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/aac",
  "audio/x-m4a"
]);

export const messagesRouter = Router();

messagesRouter.get("/conversations", requireUser, async (req, res) => {
  try { res.json({ conversations: await listConversations(await getDb(), req.userId!) }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to load conversations" }); }
});

messagesRouter.post("/conversations/direct", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    let otherUserId: ObjectId;
    if (req.body?.userId && ObjectId.isValid(String(req.body.userId))) {
      otherUserId = new ObjectId(String(req.body.userId));
    } else if (req.body?.username) {
      const other = await db.collection("users").findOne({ username: String(req.body.username).trim().toLowerCase(), status: "ACTIVE" }, { projection: { _id: 1 } });
      if (!other) return res.status(404).json({ error: "User not found" });
      otherUserId = other._id;
    } else {
      return res.status(400).json({ error: "userId or username is required" });
    }
    const conversation = await getOrCreateDirectConversation(db, req.userId!, otherUserId);
    res.status(201).json({ conversation });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to create conversation" }); }
});

messagesRouter.get("/conversations/:conversationId/messages", requireUser, async (req, res) => {
  try {
    const conversationId = new ObjectId(String(req.params.conversationId));
    const before = req.query.before ? new Date(String(req.query.before)) : undefined;
    res.json({ messages: await listMessages(await getDb(), req.userId!, conversationId, before) });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to load messages" }); }
});

messagesRouter.post("/conversations/:conversationId/messages", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const conversationId = new ObjectId(String(req.params.conversationId));
    const message = await createTextMessage(db, req.userId!, conversationId, String(req.body?.text ?? ""));
    if (!message) throw new Error("Unable to create message");
    broadcastToUser(String(message.recipientId), { type: "message:new", message });
    broadcastToUser(String(req.userId!), { type: "message:sent", message });
    res.status(201).json({ message });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to send message" }); }
});

messagesRouter.post("/conversations/:conversationId/voice-upload-url", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const conversationId = new ObjectId(String(req.params.conversationId));
    const conversation = await db.collection("conversations").findOne({ _id: conversationId, memberIds: req.userId! });
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });

    const mimeType = String(req.body?.mimeType ?? "").toLowerCase().split(";")[0];
    if (!VOICE_MIME_TYPES.has(mimeType)) return res.status(400).json({ error: "Unsupported voice format" });

    const objectKey = `messages/${req.userId!.toHexString()}/${newMediaJobId()}`;
    const upload = await createPresignedUpload({ objectKey, mimeType, expiresInSeconds: 900 });
    res.json({ ...upload, objectKey, mimeType, maxBytes: MAX_VOICE_BYTES, maxDurationMs: MAX_VOICE_DURATION_MS });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to sign voice upload" }); }
});

messagesRouter.post("/conversations/:conversationId/voice", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const conversationId = new ObjectId(String(req.params.conversationId));
    const objectKey = String(req.body?.objectKey ?? "");
    const mimeType = String(req.body?.mimeType ?? "").toLowerCase().split(";")[0];
    const durationMs = Number(req.body?.durationMs ?? 0);

    if (!VOICE_MIME_TYPES.has(mimeType)) return res.status(400).json({ error: "Unsupported voice format" });
    if (!objectKey.startsWith(`messages/${req.userId!.toHexString()}/`)) return res.status(403).json({ error: "Invalid voice object" });

    const head = await headMediaObject(objectKey);
    const sizeBytes = Number(head.ContentLength ?? 0);
    if (!sizeBytes || sizeBytes > MAX_VOICE_BYTES) return res.status(400).json({ error: "Voice message is too large" });
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_VOICE_DURATION_MS) return res.status(400).json({ error: "Invalid voice duration" });

    const message = await createVoiceMessage(db, req.userId!, conversationId, { objectKey, mimeType, durationMs, sizeBytes });
    if (!message) throw new Error("Unable to create voice message");
    broadcastToUser(String(message.recipientId), { type: "message:new", message });
    broadcastToUser(String(req.userId!), { type: "message:sent", message });
    res.status(201).json({ message });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to send voice message" }); }
});

messagesRouter.get("/messages/:messageId/audio", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const messageId = new ObjectId(String(req.params.messageId));
    const message = await db.collection("messages").findOne({ _id: messageId, type: "VOICE", $or: [{ senderId: req.userId }, { recipientId: req.userId }] });
    if (!message?.media?.objectKey) return res.status(404).json({ error: "Voice message not found" });
    res.json(await createPresignedPlayback(String(message.media.objectKey)));
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to create voice playback URL" }); }
});

messagesRouter.post("/conversations/:conversationId/delivered", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const conversationId = new ObjectId(String(req.params.conversationId));
    const update = await markMessagesDelivered(db, req.userId!, conversationId);
    for (const senderId of update.senderIds) {
      broadcastToUser(senderId, { type: "message:status", ...update });
    }
    res.json({ status: update.status, messageIds: update.messageIds, updatedAt: update.at });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to update delivery status" }); }
});

messagesRouter.post("/conversations/:conversationId/read", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const conversationId = new ObjectId(String(req.params.conversationId));
    const update = await markMessagesRead(db, req.userId!, conversationId);
    for (const senderId of update.senderIds) {
      broadcastToUser(senderId, { type: "message:status", ...update });
    }
    res.json({ status: update.status, messageIds: update.messageIds, updatedAt: update.at });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to update read status" }); }
});
