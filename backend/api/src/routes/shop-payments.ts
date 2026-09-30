import { Router } from "express";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { rateLimit } from "../security/rate-limit.js";

export const shopPaymentsRouter = Router();
const paymentLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });

async function markShopOrderPaid(db: any, orderId: string, buyerId?: string) {
  const query: any = { id: orderId, paymentStatus: "PENDING" };
  if (buyerId) query.buyerId = buyerId;
  const order = await db.collection("shop_orders").findOneAndUpdate(
    query,
    { $set: { paymentStatus: "PAID", status: "PAID", paidAt: new Date(), updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  if (!order) return null;
  if (order.affiliate?.creatorId && Number(order.affiliate.commissionMinor) > 0) {
    await db.collection("shop_affiliate_commissions").updateOne(
      { orderId: order.id, creatorId: order.affiliate.creatorId },
      { $setOnInsert: {
        id: randomUUID(),
        orderId: order.id,
        offerId: order.affiliate.offerId,
        productId: order.affiliate.productId,
        sellerId: order.items?.find((item: any) => item.productId === order.affiliate.productId)?.sellerId,
        creatorId: order.affiliate.creatorId,
        amountMinor: Number(order.affiliate.commissionMinor),
        currency: order.currency,
        status: "PENDING",
        createdAt: new Date(),
        updatedAt: new Date()
      } },
      { upsert: true }
    );
  }
  return order;
}

shopPaymentsRouter.post("/orders/:orderId/pay", requireUser, paymentLimit, async (req, res) => {
  try {
    const orderId = String(req.params.orderId);
    const db = await getDb();
    const order = await db.collection("shop_orders").findOne({ id: orderId, buyerId: req.userId!.toHexString(), paymentStatus: "PENDING" });
    if (!order) return res.status(404).json({ error: "Pending Shop order not found" });
    const user = await db.collection("users").findOne({ _id: req.userId! }, { projection: { email: 1 } });
    const email = String(req.body?.email ?? user?.email ?? "").trim();
    if (!email.includes("@") || email.length > 200) return res.status(400).json({ error: "A valid account email is required" });
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return res.status(503).json({ error: "TwiTok payments are not configured yet" });
    const reference = "twitok_shop_" + randomUUID().replace(/-/g, "");
    const requestedChannels = Array.isArray(req.body?.channels) ? req.body.channels.map((x: unknown) => String(x)) : ["card", "mobile_money", "bank", "ussd"];
    const allowedChannels = ["card", "mobile_money", "bank", "ussd"];
    const channels = requestedChannels.filter((x: string) => allowedChannels.includes(x));
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
      body: JSON.stringify({ email, amount: Number(order.totalMinor), currency: String(order.currency).toUpperCase(), reference, channels: channels.length ? channels : allowedChannels, callback_url: process.env.PAYSTACK_CALLBACK_URL || undefined, metadata: { type: "SHOP_ORDER", orderId, userId: req.userId!.toHexString() } })
    });
    const data: any = await response.json();
    if (!response.ok || !data?.status || !data?.data?.authorization_url) return res.status(502).json({ error: "Payment provider could not initialize the transaction" });
    await db.collection("shop_payments").insertOne({ reference, orderId, userId: req.userId!, amountMinor: Number(order.totalMinor), currency: String(order.currency).toUpperCase(), status: "INITIALIZED", provider: "PAYSTACK", createdAt: new Date() });
    return res.json({ reference, authorizationUrl: data.data.authorization_url, accessCode: data.data.access_code, channels });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to initialize Shop payment" }); }
});

shopPaymentsRouter.post("/payments/verify", requireUser, paymentLimit, async (req, res) => {
  try {
    const reference = String(req.body?.reference ?? "");
    if (!/^twitok_shop_[A-Za-z0-9]+$/.test(reference)) return res.status(400).json({ error: "Invalid payment reference" });
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return res.status(503).json({ error: "TwiTok payments are not configured yet" });
    const db = await getDb();
    const payment = await db.collection("shop_payments").findOne({ reference, userId: req.userId! });
    if (!payment) return res.status(404).json({ error: "Shop payment not found" });
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: "Bearer " + secret } });
    const data: any = await response.json();
    const transaction = data?.data;
    if (!response.ok || !data?.status || transaction?.status !== "success") return res.status(402).json({ error: "Payment has not been completed" });
    if (Number(transaction.amount) !== Number(payment.amountMinor) || String(transaction.currency).toUpperCase() !== String(payment.currency).toUpperCase()) return res.status(400).json({ error: "Payment amount or currency mismatch" });
    await db.collection("shop_payments").updateOne({ _id: payment._id, status: { $ne: "PAID" } }, { $set: { status: "PAID", verifiedAt: new Date(), providerTransactionId: transaction.id } });
    await markShopOrderPaid(db, payment.orderId, req.userId!.toHexString());
    return res.json({ paid: true, orderId: payment.orderId });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to verify Shop payment" }); }
});

shopPaymentsRouter.post("/payments/webhook", async (req, res) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const rawBody = (req as any).rawBody as Buffer | undefined;
    const signature = String(req.get("x-paystack-signature") ?? "");
    if (!secret || !rawBody || !signature) return res.status(400).json({ error: "Invalid webhook request" });
    const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
    const expectedBuf = Buffer.from(expected, "utf8");
    const receivedBuf = Buffer.from(signature, "utf8");
    if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) return res.status(401).json({ error: "Invalid webhook signature" });
    const payload = JSON.parse(rawBody.toString("utf8"));
    if (payload?.event !== "charge.success") return res.json({ received: true });
    const transaction = payload.data;
    const reference = String(transaction?.reference ?? "");
    if (!/^twitok_shop_[A-Za-z0-9]+$/.test(reference)) return res.json({ received: true });
    const db = await getDb();
    const payment = await db.collection("shop_payments").findOne({ reference });
    if (!payment) return res.json({ received: true });
    if (Number(transaction.amount) !== Number(payment.amountMinor) || String(transaction.currency).toUpperCase() !== String(payment.currency).toUpperCase()) return res.status(400).json({ error: "Payment amount or currency mismatch" });
    await db.collection("shop_payments").updateOne({ _id: payment._id, status: { $ne: "PAID" } }, { $set: { status: "PAID", verifiedAt: new Date(), providerTransactionId: transaction.id } });
    await markShopOrderPaid(db, payment.orderId);
    return res.json({ received: true });
  } catch { return res.status(400).json({ error: "Unable to process Shop payment webhook" }); }
});

shopPaymentsRouter.get("/orders/:orderId/payment", requireUser, async (req, res) => {
  const db = await getDb();
  const payment = await db.collection("shop_payments").findOne({ orderId: String(req.params.orderId), userId: req.userId! }, { sort: { createdAt: -1 } });
  return res.json({ payment: payment ?? null });
});
