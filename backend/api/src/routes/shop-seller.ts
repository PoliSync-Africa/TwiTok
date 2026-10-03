import { Router } from "express";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";

export const shopSellerRouter = Router();

shopSellerRouter.get("/seller/orders", requireUser, async (req, res) => {
  const db = await getDb();
  const sellerId = req.userId!.toHexString();
  const orders = await db.collection("shop_orders").find({
    "items.sellerId": sellerId,
    paymentStatus: "PAID"
  }).sort({ createdAt: -1 }).limit(100).toArray();
  const enriched = await Promise.all(orders.map(async (order: any) => ({
    ...order,
    sellerShipment: await db.collection("shop_seller_shipments").findOne({ orderId: order.id, sellerId })
  })));
  return res.json({ orders: enriched });
});

shopSellerRouter.get("/seller/orders/:orderId", requireUser, async (req, res) => {
  const db = await getDb();
  const order = await db.collection("shop_orders").findOne({
    id: String(req.params.orderId),
    "items.sellerId": req.userId!.toHexString()
  });
  if (!order) return res.status(404).json({ error: "Seller order not found" });
  return res.json({ order });
});

shopSellerRouter.post("/seller/orders/:orderId/fulfill", requireUser, async (req, res) => {
  const db = await getDb();
  const sellerId = req.userId!.toHexString();
  const trackingNumber = String(req.body?.trackingNumber ?? "").trim();
  const carrier = String(req.body?.carrier ?? "").trim();
  if (!trackingNumber || !carrier) return res.status(400).json({ error: "Carrier and tracking number are required" });
  const order = await db.collection("shop_orders").findOne({ id: String(req.params.orderId), "items.sellerId": sellerId, paymentStatus: "PAID" });
  if (!order) return res.status(404).json({ error: "Eligible seller order not found" });
  const existing = await db.collection("shop_seller_shipments").findOne({ orderId: order.id, sellerId });
  if (existing?.status === "DELIVERED") return res.status(409).json({ error: "Seller shipment is already delivered" });
  const now = new Date();
  await db.collection("shop_seller_shipments").updateOne(
    { orderId: order.id, sellerId },
    { $set: { orderId: order.id, sellerId, status: "SHIPPED", carrier, trackingNumber, shippedAt: now, updatedAt: now } },
    { upsert: true }
  );
  await db.collection("shop_orders").updateOne({ id: order.id }, { $set: { updatedAt: now } });
  return res.json({ ok: true, status: "SHIPPED" });
});

shopSellerRouter.post("/seller/orders/:orderId/deliver", requireUser, async (req, res) => {
  const db = await getDb();
  const sellerId = req.userId!.toHexString();
  const shipment = await db.collection("shop_seller_shipments").findOne({ orderId: String(req.params.orderId), sellerId, status: "SHIPPED" });
  if (!shipment) return res.status(404).json({ error: "Shipped seller shipment not found" });
  const deliveredAt = new Date();
  await db.collection("shop_seller_shipments").updateOne(
    { _id: shipment._id, status: "SHIPPED" },
    { $set: { status: "DELIVERED", deliveredAt, updatedAt: deliveredAt } }
  );
  await db.collection("shop_affiliate_commissions").updateMany(
    { orderId: shipment.orderId, sellerId, status: "PENDING" },
    { $set: { status: "EARNED", earnedAt: deliveredAt, updatedAt: deliveredAt } }
  );
  return res.json({ ok: true, status: "DELIVERED" });
});

shopSellerRouter.post("/seller/products/:productId/publish", requireUser, async (req, res) => {
  const db = await getDb();
  const sellerId = req.userId!.toHexString();
  const result = await db.collection("shop_products").updateOne(
    { id: String(req.params.productId), sellerId, status: "DRAFT" },
    { $set: { status: "ACTIVE", updatedAt: new Date() } }
  );
  if (!result.modifiedCount) return res.status(404).json({ error: "Draft product not found" });
  return res.json({ ok: true, status: "ACTIVE" });
});

shopSellerRouter.post("/seller/products/:productId/unpublish", requireUser, async (req, res) => {
  const db = await getDb();
  const sellerId = req.userId!.toHexString();
  const result = await db.collection("shop_products").updateOne(
    { id: String(req.params.productId), sellerId, status: "ACTIVE" },
    { $set: { status: "DRAFT", updatedAt: new Date() } }
  );
  if (!result.modifiedCount) return res.status(404).json({ error: "Active product not found" });
  return res.json({ ok: true, status: "DRAFT" });
});

shopSellerRouter.get("/seller/inventory", requireUser, async (req, res) => {
  const db = await getDb();
  const products = await db.collection("shop_products").find({ sellerId: req.userId!.toHexString() }).sort({ updatedAt: -1 }).limit(500).toArray();
  return res.json({ products });
});

shopSellerRouter.get("/seller/settlements", requireUser, async (req, res) => {
  const db = await getDb();
  const orders = await db.collection("shop_orders").find({
    "items.sellerId": req.userId!.toHexString(),
    status: "DELIVERED",
    paymentStatus: "PAID"
  }, { projection: { id: 1, currency: 1, totalMinor: 1, platformFeeMinor: 1, sellerSettlementMinor: 1, deliveredAt: 1 } }).sort({ deliveredAt: -1 }).limit(500).toArray();
  return res.json({ settlements: orders });
});
