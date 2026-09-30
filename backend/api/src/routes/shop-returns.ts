import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";

export const shopReturnsRouter = Router();

shopReturnsRouter.post("/orders/:orderId/return", requireUser, async (req, res) => {
  const db = await getDb();
  const buyerId = req.userId!.toHexString();
  const order = await db.collection("shop_orders").findOne({ id: String(req.params.orderId), buyerId, paymentStatus: "PAID" });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!["DELIVERED"].includes(String(order.status))) return res.status(409).json({ error: "Only delivered orders can be returned" });
  const reason = String(req.body?.reason ?? "").trim();
  if (!reason || reason.length > 500) return res.status(400).json({ error: "A return reason is required" });
  const existing = await db.collection("shop_returns").findOne({ orderId: order.id, buyerId, status: { $in: ["REQUESTED", "APPROVED", "IN_TRANSIT"] } });
  if (existing) return res.status(409).json({ error: "A return request already exists for this order" });
  const request = { id: randomUUID(), orderId: order.id, buyerId, reason, status: "REQUESTED", createdAt: new Date(), updatedAt: new Date() };
  await db.collection("shop_returns").insertOne(request);
  await db.collection("shop_orders").updateOne({ id: order.id }, { $set: { returnStatus: "REQUESTED", updatedAt: new Date() } });
  return res.status(201).json({ returnRequest: request });
});

shopReturnsRouter.get("/orders/:orderId/return", requireUser, async (req, res) => {
  const db = await getDb();
  const request = await db.collection("shop_returns").findOne({ orderId: String(req.params.orderId), buyerId: req.userId!.toHexString() });
  return res.json({ returnRequest: request ?? null });
});

shopReturnsRouter.post("/seller/returns/:returnId/approve", requireUser, async (req, res) => {
  const db = await getDb();
  const request = await db.collection("shop_returns").findOne({ id: String(req.params.returnId), status: "REQUESTED" });
  if (!request) return res.status(404).json({ error: "Return request not found" });
  const order = await db.collection("shop_orders").findOne({ id: request.orderId, "items.sellerId": req.userId!.toHexString() });
  if (!order) return res.status(403).json({ error: "Seller is not associated with this order" });
  await db.collection("shop_returns").updateOne({ _id: request._id, status: "REQUESTED" }, { $set: { status: "APPROVED", approvedAt: new Date(), updatedAt: new Date() } });
  return res.json({ ok: true, status: "APPROVED" });
});

shopReturnsRouter.post("/seller/returns/:returnId/reject", requireUser, async (req, res) => {
  const db = await getDb();
  const request = await db.collection("shop_returns").findOne({ id: String(req.params.returnId), status: "REQUESTED" });
  if (!request) return res.status(404).json({ error: "Return request not found" });
  const order = await db.collection("shop_orders").findOne({ id: request.orderId, "items.sellerId": req.userId!.toHexString() });
  if (!order) return res.status(403).json({ error: "Seller is not associated with this order" });
  await db.collection("shop_returns").updateOne({ _id: request._id, status: "REQUESTED" }, { $set: { status: "REJECTED", rejectedAt: new Date(), updatedAt: new Date() } });
  return res.json({ ok: true, status: "REJECTED" });
});

shopReturnsRouter.get("/seller/returns", requireUser, async (req, res) => {
  const db = await getDb();
  const sellerId = req.userId!.toHexString();
  const orders = await db.collection("shop_orders").find({ "items.sellerId": sellerId }, { projection: { id: 1 } }).limit(500).toArray();
  const orderIds = orders.map((o: any) => o.id);
  const requests = await db.collection("shop_returns").find({ orderId: { $in: orderIds } }).sort({ createdAt: -1 }).limit(200).toArray();
  return res.json({ returnRequests: requests });
});
