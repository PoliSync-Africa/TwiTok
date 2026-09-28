import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { createTextMessage, getOrCreateDirectConversation, listConversations, listMessages, markMessagesDelivered, markMessagesRead } from "../social/messaging.js";
import { broadcastToUser } from "../realtime/ws.js";

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

messagesRouter.post("/conversations/:conversationId/delivered", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const conversationId = new ObjectId(String(req.params.conversationId));
    await markMessagesDelivered(db, req.userId!, conversationId);
    broadcastToUser(String(req.userId!), { type: "message:delivered", conversationId: conversationId.toHexString() });
    res.json({ status: "DELIVERED" });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to update delivery status" }); }
});

messagesRouter.post("/conversations/:conversationId/read", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const conversationId = new ObjectId(String(req.params.conversationId));
    await markMessagesRead(db, req.userId!, conversationId);
    broadcastToUser(String(req.userId!), { type: "message:read", conversationId: conversationId.toHexString() });
    res.json({ status: "READ" });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Unable to update read status" }); }
});
