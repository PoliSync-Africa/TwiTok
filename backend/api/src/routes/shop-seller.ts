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
  return res.json({ orders });
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
  const result = await db.collection("shop_orders").updateOne(
    { id: String(req.params.orderId), "items.sellerId": sellerId, paymentStatus: "PAID", status: { $in: ["PAID", "PROCESSING"] } },
    { $set: { status: "SHIPPED", carrier, trackingNumber, shippedAt: new Date(), updatedAt: new Date() } }
  );
  if (!result.modifiedCount) return res.status(404).json({ error: "Eligible seller order not found" });
  return res.json({ ok: true, status: "SHIPPED" });
});

shopSellerRouter.post("/seller/orders/:orderId/deliver", requireUser, async (req, res) => {
  const db = await getDb();
  const result = await db.collection("shop_orders").updateOne(
    { id: String(req.params.orderId), "items.sellerId": req.userId!.toHexString(), status: "SHIPPED" },
    { $set: { status: "DELIVERED", deliveredAt: new Date(), updatedAt: new Date() } }
  );
  if (!result.modifiedCount) return res.status(404).json({ error: "Shipped seller order not found" });
  return res.json({ ok: true, status: "DELIVERED" });
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
