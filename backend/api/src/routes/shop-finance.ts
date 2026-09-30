import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { calculateTwiTokShopFee } from "../config/shop-fees.js";

export const shopFinanceRouter = Router();

shopFinanceRouter.post("/seller/payout-account", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const sellerId = req.userId!.toHexString();
    const accountNumber = String(req.body?.accountNumber ?? "").trim();
    const bankCode = String(req.body?.bankCode ?? "").trim();
    const accountName = String(req.body?.accountName ?? "").trim();
    const type = String(req.body?.type ?? "nuban").trim() || "nuban";
    if (!accountNumber || !bankCode || !accountName) return res.status(400).json({ error: "accountNumber, bankCode and accountName are required" });
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return res.status(503).json({ error: "Shop payout provider is not configured" });

    const providerResponse = await fetch("https://api.paystack.co/transferrecipient", {
      method: "POST",
      headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
      body: JSON.stringify({ type, name: accountName, account_number: accountNumber, bank_code: bankCode, currency: "GHS" })
    });
    const providerData: any = await providerResponse.json();
    if (!providerResponse.ok || !providerData?.status || !providerData?.data?.recipient_code) {
      return res.status(502).json({ error: "Payment provider could not create the payout destination" });
    }

    const payoutAccount = {
      sellerId,
      type,
      bankCode,
      accountName,
      accountLast4: accountNumber.slice(-4),
      currency: "GHS",
      provider: "PAYSTACK",
      recipientCode: String(providerData.data.recipient_code),
      updatedAt: new Date(),
      createdAt: new Date()
    };
    await db.collection("shop_payout_accounts").updateOne({ sellerId }, { $set: payoutAccount }, { upsert: true });
    return res.status(201).json({ payoutAccount: { ...payoutAccount, accountNumber: undefined } });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to save payout account" });
  }
});

shopFinanceRouter.get("/seller/payout-account", requireUser, async (req, res) => {
  const db = await getDb();
  const account = await db.collection("shop_payout_accounts").findOne({ sellerId: req.userId!.toHexString() });
  if (!account) return res.status(404).json({ error: "Payout account not configured" });
  return res.json({ payoutAccount: { sellerId: account.sellerId, type: account.type, bankCode: account.bankCode, accountName: account.accountName, accountLast4: account.accountLast4, currency: account.currency, provider: account.provider } });
});

shopFinanceRouter.post("/seller/returns/:returnId/refund", requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const sellerId = req.userId!.toHexString();
    const request = await db.collection("shop_returns").findOne({ id: String(req.params.returnId), status: "APPROVED" });
    if (!request) return res.status(404).json({ error: "Approved return not found" });
    const order = await db.collection("shop_orders").findOne({ id: request.orderId, "items.sellerId": sellerId, paymentStatus: "PAID" });
    if (!order) return res.status(403).json({ error: "Seller is not associated with this order" });

    const existing = await db.collection("shop_refunds").findOne({ orderId: order.id, returnId: request.id, sellerId, status: { $in: ["REQUESTED", "PROCESSING", "REFUNDED"] } });
    if (existing) return res.status(409).json({ error: "Refund already exists for this seller" });

    const sellerItems = (order.items ?? []).filter((item: any) => String(item.sellerId) === sellerId);
    if (!sellerItems.length) return res.status(403).json({ error: "No seller items found in this order" });
    const refundMinor = sellerItems.reduce((sum: number, item: any) => sum + Number(item.priceMinor || 0) * Number(item.quantity || 0), 0);
    if (refundMinor <= 0) return res.status(400).json({ error: "Refund amount is invalid" });

    const payment = await db.collection("shop_payments").findOne({ orderId: order.id, status: "PAID" }, { sort: { createdAt: -1 } });
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!payment?.providerTransactionId || !secret) return res.status(503).json({ error: "A provider-backed Shop payment is required before this refund can be processed" });

    const providerResponse = await fetch("https://api.paystack.co/refund", {
      method: "POST",
      headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
      body: JSON.stringify({ transaction: payment.providerTransactionId, amount: refundMinor })
    });
    const providerData: any = await providerResponse.json();
    if (!providerResponse.ok || !providerData?.status) return res.status(502).json({ error: "Payment provider could not process the refund" });

    const refund = {
      id: randomUUID(),
      orderId: order.id,
      returnId: request.id,
      buyerId: order.buyerId,
      sellerId,
      amountMinor: refundMinor,
      currency: order.currency,
      status: "REFUNDED",
      provider: "PAYSTACK",
      providerReference: providerData?.data?.reference ?? null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    await db.collection("shop_refunds").insertOne(refund);
    const remaining = await db.collection("shop_refunds").find({ orderId: order.id, status: "REFUNDED" }).toArray();
    const totalRefunded = remaining.reduce((sum: number, item: any) => sum + Number(item.amountMinor || 0), 0);
    const sellerIds: string[] = Array.from(new Set<string>((order.items ?? []).map((item: any) => String(item.sellerId))));
    const refundedSellerIds = new Set(remaining.map((item: any) => String(item.sellerId)));
    const fullyRefunded = sellerIds.every(id => refundedSellerIds.has(id));
    await db.collection("shop_returns").updateOne(
      { _id: request._id, status: "APPROVED" },
      { $set: { status: fullyRefunded ? "REFUNDED" : "REFUND_REQUESTED", ...(fullyRefunded ? { refundedAt: new Date() } : {}), updatedAt: new Date() } }
    );
    await db.collection("shop_orders").updateOne(
      { id: order.id },
      { $set: { refundStatus: totalRefunded >= Number(order.totalMinor) ? "REFUNDED" : "PARTIALLY_REFUNDED", updatedAt: new Date() } }
    );
    return res.status(201).json({ refund });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to process Shop refund" });
  }
});

shopFinanceRouter.get("/seller/wallet", requireUser, async (req, res) => {
  const db = await getDb();
  const sellerId = req.userId!.toHexString();
  const delivered = await db.collection("shop_orders").find({ "items.sellerId": sellerId, status: "DELIVERED", paymentStatus: "PAID" }).toArray();
  const refunded = await db.collection("shop_refunds").find({ sellerId, status: "REFUNDED" }).toArray();
  const sellerEntries = delivered.map((o: any) => o.sellerBreakdown?.find((s: any) => s.sellerId === sellerId)).filter(Boolean);
  const grossMinor = sellerEntries.reduce((sum: number, s: any) => sum + Number(s.grossMinor || 0), 0);
  const feesMinor = sellerEntries.reduce((sum: number, s: any) => sum + Number(s.platformFeeMinor ?? calculateTwiTokShopFee(Number(s.grossMinor || 0))), 0);
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
