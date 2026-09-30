import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { rateLimit } from "../security/rate-limit.js";
import { calculateTwiTokShopFee, TWITOK_SHOP_PLATFORM_FEE_PERCENT } from "../config/shop-fees.js";

export const shopOrdersRouter = Router();
const orderLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });

shopOrdersRouter.get("/cart", requireUser, async (req, res) => {
  const db = await getDb();
  const cart = await db.collection("shop_carts").findOne({ userId: req.userId!.toHexString() });
  return res.json({ cart: cart ?? { userId: req.userId!.toHexString(), items: [] } });
});

shopOrdersRouter.post("/cart/items", requireUser, async (req, res) => {
  const productId = String(req.body?.productId ?? "");
  const quantity = Math.floor(Number(req.body?.quantity ?? 1));
  if (!productId || quantity < 1 || quantity > 100) return res.status(400).json({ error: "Valid productId and quantity are required" });
  const db = await getDb();
  const product = await db.collection("shop_products").findOne({ id: productId, status: "ACTIVE" }, { projection: { id: 1, name: 1, priceMinor: 1, currency: 1, images: 1, stock: 1, sellerId: 1 } });
  if (!product) return res.status(404).json({ error: "Product not found" });
  if (Number(product.stock ?? 0) < quantity) return res.status(409).json({ error: "Insufficient stock" });
  await db.collection("shop_carts").updateOne(
    { userId: req.userId!.toHexString() },
    { $set: { updatedAt: new Date() }, $setOnInsert: { userId: req.userId!.toHexString(), items: [] }, $push: { items: { productId, quantity, priceMinor: Number(product.priceMinor), currency: product.currency, name: product.name, image: product.images?.[0] ?? null } } } as any,
    { upsert: true }
  );
  return res.status(201).json({ ok: true });
});

shopOrdersRouter.delete("/cart/items/:productId", requireUser, async (req, res) => {
  const db = await getDb();
  await db.collection("shop_carts").updateOne({ userId: req.userId!.toHexString() }, { $pull: { items: { productId: String(req.params.productId) } }, $set: { updatedAt: new Date() } } as any);
  return res.json({ ok: true });
});

shopOrdersRouter.post("/checkout", requireUser, orderLimit, async (req, res) => {
  const db = await getDb();
  const userId = req.userId!.toHexString();
  const idempotencyKey = String(req.header("Idempotency-Key") ?? "").trim();
  if (!/^[A-Za-z0-9._:-]{16,100}$/.test(idempotencyKey)) return res.status(400).json({ error: "A valid Idempotency-Key is required" });
  const existing = await db.collection("shop_orders").findOne({ buyerId: userId, idempotencyKey });
  if (existing) return res.json({ order: existing, idempotent: true });
  const cart = await db.collection("shop_carts").findOne({ userId });
  const items = Array.isArray(cart?.items) ? cart.items : [];
  if (!items.length) return res.status(400).json({ error: "Cart is empty" });
  const address = req.body?.shippingAddress;
  if (!address || typeof address !== "object") return res.status(400).json({ error: "Shipping address is required" });
  const currency = String(items[0].currency ?? "").toUpperCase();
  if (!currency || items.some((item: any) => String(item.currency).toUpperCase() !== currency)) return res.status(400).json({ error: "Cart must use one currency" });
  let subtotalMinor = 0;
  const reservedItems: any[] = [];
  for (const item of items) {
    const quantity = Math.floor(Number(item.quantity));
    const product = await db.collection("shop_products").findOne({ id: String(item.productId), status: "ACTIVE" }, { projection: { id: 1, sellerId: 1, stock: 1 } });
    if (!product) return res.status(404).json({ error: `Product not found: ${item.name}` });
    const result = await db.collection("shop_products").updateOne({ id: String(item.productId), status: "ACTIVE", stock: { $gte: quantity } }, { $inc: { stock: -quantity } });
    if (!result.modifiedCount) {
      for (const reserved of reservedItems) await db.collection("shop_products").updateOne({ id: reserved.productId }, { $inc: { stock: reserved.quantity } });
      return res.status(409).json({ error: `Insufficient stock for ${item.name}` });
    }
    subtotalMinor += Number(item.priceMinor) * quantity;
    reservedItems.push({ productId: String(item.productId), sellerId: String(product.sellerId), quantity, name: item.name, priceMinor: Number(item.priceMinor) });
  }
  const shippingMinor = Math.max(0, Math.round(Number(req.body?.shippingMinor ?? 0)));
  const totalMinor = subtotalMinor + shippingMinor;
  const shopFeeMinor = calculateTwiTokShopFee(totalMinor);
  const order = { id: randomUUID(), buyerId: userId, items: reservedItems, currency, subtotalMinor, shippingMinor, totalMinor, platformFeeMinor: shopFeeMinor, platformFeePercent: TWITOK_SHOP_PLATFORM_FEE_PERCENT, sellerSettlementMinor: totalMinor - shopFeeMinor, shippingAddress: address, paymentStatus: "PENDING", status: "PENDING_PAYMENT", idempotencyKey, createdAt: new Date(), updatedAt: new Date() };
  await db.collection("shop_orders").insertOne(order);
  await db.collection("shop_carts").updateOne({ userId }, { $set: { items: [], updatedAt: new Date() } });
  return res.status(201).json({ order, paymentRequired: true });
});

shopOrdersRouter.get("/orders/:orderId/shipments", requireUser, async (req, res) => {
  const db = await getDb();
  const order = await db.collection("shop_orders").findOne({ id: String(req.params.orderId), buyerId: req.userId!.toHexString() });
  if (!order) return res.status(404).json({ error: "Order not found" });
  const groups = new Map<string, any>();
  for (const item of order.items ?? []) {
    const sellerId = String(item.sellerId);
    const current = groups.get(sellerId) ?? { sellerId, items: [], status: "PENDING", carrier: null, trackingNumber: null, shippedAt: null, deliveredAt: null };
    current.items.push(item);
    groups.set(sellerId, current);
  }
  for (const shipment of groups.values()) {
    const sellerOrder = await db.collection("shop_seller_shipments").findOne({ orderId: order.id, sellerId: shipment.sellerId });
    if (sellerOrder) Object.assign(shipment, sellerOrder);
  }
  return res.json({ shipments: Array.from(groups.values()) });
});

shopOrdersRouter.get("/orders", requireUser, async (req, res) => {
  const db = await getDb();
  const orders = await db.collection("shop_orders").find({ buyerId: req.userId!.toHexString() }).sort({ createdAt: -1 }).limit(100).toArray();
  return res.json({ orders });
});

shopOrdersRouter.get("/orders/:orderId", requireUser, async (req, res) => {
  const db = await getDb();
  const order = await db.collection("shop_orders").findOne({ id: String(req.params.orderId), buyerId: req.userId!.toHexString() });
  if (!order) return res.status(404).json({ error: "Order not found" });
  return res.json({ order });
});
