import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { calculateTwiTokShopFee } from "../config/shop-fees.js";

export const shopFinanceRouter = Router();

shopFinanceRouter.post("/seller/returns/:returnId/refund", requireUser, async (req, res) => {
  const db = await getDb();
  const sellerId = req.userId!.toHexString();
  const request = await db.collection("shop_returns").findOne({ id: String(req.params.returnId), status: "APPROVED" });
  if (!request) return res.status(404).json({ error: "Approved return not found" });
  const order = await db.collection("shop_orders").findOne({ id: request.orderId, "items.sellerId": sellerId, paymentStatus: "PAID" });
  if (!order) return res.status(403).json({ error: "Seller is not associated with this order" });
  const existing = await db.collection("shop_refunds").findOne({ orderId: order.id, returnId: request.id, status: { $in: ["REQUESTED", "PROCESSING", "REFUNDED"] } });
  if (existing) return res.status(409).json({ error: "Refund already exists" });

  const refundMinor = Number(order.totalMinor);
  const refund = {
    id: randomUUID(),
    orderId: order.id,
    returnId: request.id,
    buyerId: order.buyerId,
    sellerId,
    amountMinor: refundMinor,
    currency: order.currency,
    status: "REQUESTED",
    createdAt: new Date(),
    updatedAt: new Date()
  };
  await db.collection("shop_refunds").insertOne(refund);
  await db.collection("shop_returns").updateOne({ _id: request._id }, { $set: { status: "REFUND_REQUESTED", updatedAt: new Date() } });
  await db.collection("shop_orders").updateOne({ id: order.id }, { $set: { refundStatus: "REQUESTED", updatedAt: new Date() } });
  return res.status(201).json({ refund });
});

shopFinanceRouter.get("/seller/wallet", requireUser, async (req, res) => {
  const db = await getDb();
  const sellerId = req.userId!.toHexString();
  const delivered = await db.collection("shop_orders").find({ "items.sellerId": sellerId, status: "DELIVERED", paymentStatus: "PAID" }).toArray();
  const refunded = await db.collection("shop_refunds").find({ sellerId, status: "REFUNDED" }).toArray();
  const grossMinor = delivered.reduce((sum: number, o: any) => sum + Number(o.totalMinor || 0), 0);
  const feesMinor = delivered.reduce((sum: number, o: any) => sum + Number(o.platformFeeMinor ?? calculateTwiTokShopFee(Number(o.totalMinor || 0))), 0);
  const refundsMinor = refunded.reduce((sum: number, r: any) => sum + Number(r.amountMinor || 0), 0);
  return res.json({ grossMinor, feesMinor, refundsMinor, availableMinor: Math.max(0, grossMinor - feesMinor - refundsMinor), currency: delivered[0]?.currency ?? null });
});

shopFinanceRouter.post("/seller/payouts", requireUser, async (req, res) => {
  const db = await getDb();
  const sellerId = req.userId!.toHexString();
  const amountMinor = Math.floor(Number(req.body?.amountMinor));
  const currency = String(req.body?.currency ?? "").toUpperCase();
  if (!Number.isFinite(amountMinor) || amountMinor <= 0 || !currency) return res.status(400).json({ error: "Valid amountMinor and currency are required" });
  const wallet = await db.collection("shop_payouts").find({ sellerId, status: { $in: ["REQUESTED", "PROCESSING", "PAID"] } }).toArray();
  const delivered = await db.collection("shop_orders").find({ "items.sellerId": sellerId, status: "DELIVERED", paymentStatus: "PAID", currency }).toArray();
  const refunds = await db.collection("shop_refunds").find({ sellerId, status: "REFUNDED", currency }).toArray();
  const earned = delivered.reduce((sum: number, o: any) => { const seller = o.sellerBreakdown?.find((s: any) => s.sellerId === sellerId); return sum + Number(seller?.settlementMinor || 0); }, 0);
  const alreadyPaid = wallet.reduce((sum: number, p: any) => sum + Number(p.amountMinor || 0), 0);
  const refunded = refunds.reduce((sum: number, r: any) => sum + Number(r.amountMinor || 0), 0);
  const available = Math.max(0, earned - alreadyPaid - refunded);
  if (amountMinor > available) return res.status(409).json({ error: "Requested payout exceeds available balance", availableMinor: available });
  const payout = { id: randomUUID(), sellerId, amountMinor, currency, status: "REQUESTED", createdAt: new Date(), updatedAt: new Date() };
  await db.collection("shop_payouts").insertOne(payout);
  return res.status(201).json({ payout });
});

shopFinanceRouter.get("/seller/payouts", requireUser, async (req, res) => {
  const db = await getDb();
  const payouts = await db.collection("shop_payouts").find({ sellerId: req.userId!.toHexString() }).sort({ createdAt: -1 }).limit(100).toArray();
  return res.json({ payouts });
});
