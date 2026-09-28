import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/mongo.js";
import { COIN_PACKAGES, MIN_WITHDRAWAL_USD, creditPurchasedCoins, ensureWallet } from "../money/wallet.js";
import { GIFT_CATALOG, sendGift } from "../money/gifts.js";
import { createWithdrawal, processGhanaWithdrawal, reconcilePaystackTransfer } from "../money/withdrawal.js";
import { initializeCoinPurchase, verifyPaystackTransaction, verifyPaystackWebhookSignature } from "../money/providers/paystack.js";
import { listGhanaPayoutBanks } from "../money/providers/paystack.js";
import { requireUser } from "../auth/middleware.js";
import { broadcastToUser } from "../realtime/ws.js";

export const walletRouter = Router();

walletRouter.get("/revenuecat/config", requireUser, async (req, res) => {
  return res.json({ appUserId: req.userId!.toHexString() });
});

walletRouter.get("/catalog", (_req, res) => res.json({
  coinPackages: COIN_PACKAGES, gifts: GIFT_CATALOG,
  creatorSharePercent: 30, platformSharePercent: 70,
  diamondsPerCoin: 0.30, diamondCashValueUsd: 0.003, minWithdrawalUsd: MIN_WITHDRAWAL_USD
}));

walletRouter.get("/me", requireUser, async (req, res) => {
  try { return res.json(await ensureWallet(await getDb(), req.userId!.toHexString())); }
  catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Wallet lookup failed" }); }
});

walletRouter.get("/me/ledger", requireUser, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const rows = await (await getDb()).collection("wallet_ledger").find({ userId: req.userId!.toHexString() }).sort({ createdAt: -1 }).limit(limit).toArray();
    return res.json({ transactions: rows });
  } catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Ledger lookup failed" }); }
});

walletRouter.get("/me/gifts", requireUser, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const rows = await (await getDb()).collection("gift_transactions").find({ receiverId: req.userId!.toHexString() }).sort({ createdAt: -1 }).limit(limit).toArray();
    return res.json({ gifts: rows });
  } catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Gift history lookup failed" }); }
});

walletRouter.get("/me/withdrawals", requireUser, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const rows = await (await getDb()).collection("withdrawals").find({ userId: req.userId!.toHexString() }).sort({ createdAt: -1 }).limit(limit).project({ destination: 0 }).toArray();
    return res.json({ withdrawals: rows });
  } catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Withdrawal history lookup failed" }); }
});

walletRouter.get("/:userId", requireUser, async (req, res) => {
  try {
    const requested = String(req.params.userId);
    if (requested !== req.userId!.toHexString()) return res.status(403).json({ error: "You can only access your own wallet" });
    return res.json(await ensureWallet(await getDb(), requested));
  }
  catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Wallet lookup failed" }); }
});

walletRouter.post("/coins/paystack/initialize", requireUser, async (req, res) => {
  try {
    const sku = String(req.body?.sku ?? "");
    const pkg = COIN_PACKAGES.find((item) => item.sku === sku);
    if (!pkg) return res.status(400).json({ error: "Invalid Coin package" });
    const db = await getDb();
    const user = await db.collection("users").findOne({ _id: req.userId! }, { projection: { email: 1, dateOfBirth: 1 } });
    if (!user?.email) return res.status(400).json({ error: "An email address is required for Coin purchases" });
    if (user.dateOfBirth) {
      const dob = new Date(user.dateOfBirth);
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - 18);
      if (dob > cutoff) return res.status(403).json({ error: "Coin purchases require an adult account" });
    }
    const rate = Number(process.env.TWITOK_USD_GHS_RATE);
    if (!Number.isFinite(rate) || rate <= 0) return res.status(503).json({ error: "GHS payment exchange rate is not configured" });
    const amountGhs = Number((pkg.priceUsd * rate).toFixed(2));
    const reference = "TWITOK-" + randomUUID().replaceAll("-", "").slice(0, 24);
    const callbackUrl = process.env.TWITOK_PAYSTACK_CALLBACK_URL;
    const result = await initializeCoinPurchase({ email: user.email, amountGhs, reference, userId: req.userId!.toHexString(), sku: pkg.sku, coins: pkg.coins, callbackUrl });
    await db.collection("coin_purchases").insertOne({ reference, userId: req.userId!.toHexString(), sku: pkg.sku, coins: pkg.coins, priceUsd: pkg.priceUsd, amountGhs, status: "INITIALIZED", provider: "PAYSTACK", createdAt: new Date() });
    return res.status(201).json({ reference, authorizationUrl: result.authorization_url, accessCode: result.access_code, amountGhs, currency: "GHS", coins: pkg.coins });
  } catch (error) { return res.status(502).json({ error: error instanceof Error ? error.message : "Coin purchase initialization failed" }); }
});

walletRouter.post("/iap/revenuecat/webhook", async (req, res) => {
  try {
    const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
    if (!expected || req.header("Authorization") !== expected) return res.status(401).json({ error: "Unauthorized" });
    const event = req.body?.event ?? req.body;
    const userId = String(event?.app_user_id ?? "");
    const transactionId = String(event?.transaction_id ?? event?.original_transaction_id ?? "");
    const productId = String(event?.product_id ?? "");
    const pkg = COIN_PACKAGES.find((p) => p.sku === productId);
    if (!userId || !transactionId || !pkg) return res.status(400).json({ error: "Invalid RevenueCat coin purchase event" });
    const result = await creditPurchasedCoins(await getDb(), { userId, coins: pkg.coins, provider: "REVENUECAT", providerTransactionId: transactionId, sku: pkg.sku });
    return res.status(200).json({ ok: true, duplicate: result.duplicate });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "IAP webhook failed" }); }
});

walletRouter.post("/coins/paystack/webhook", async (req, res) => {
  try {
    const rawBody = (req as typeof req & { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {});
    if (!verifyPaystackWebhookSignature(rawBody, req.header("x-paystack-signature"))) return res.status(401).json({ error: "Invalid signature" });
    if (String(req.body?.event ?? "") !== "charge.success") return res.json({ ok: true, ignored: true });
    const reference = String(req.body?.data?.reference ?? "");
    if (!reference) return res.status(400).json({ error: "Payment reference missing" });
    const verified = await verifyPaystackTransaction(reference);
    if (verified.status !== "success" || verified.currency !== "GHS") return res.status(400).json({ error: "Payment is not successful" });
    const db = await getDb();
    const purchase = await db.collection("coin_purchases").findOne({ reference });
    if (!purchase) return res.status(404).json({ error: "Coin purchase not found" });
    const rate = Number(process.env.TWITOK_USD_GHS_RATE);
    const expectedAmount = Math.round(Number(purchase.amountGhs) * 100);
    if (!Number.isFinite(rate) || Math.abs(Number(verified.amount) - expectedAmount) > 1) return res.status(400).json({ error: "Payment amount mismatch" });
    if (purchase.status === "CREDITED") return res.json({ ok: true, duplicate: true });
    const result = await creditPurchasedCoins(db, { userId: String(purchase.userId), coins: Number(purchase.coins), provider: "PAYSTACK", providerTransactionId: reference, sku: String(purchase.sku) });
    await db.collection("coin_purchases").updateOne({ reference }, { $set: { status: "CREDITED", creditedAt: new Date() } });
    return res.json({ ok: true, duplicate: result.duplicate, coins: purchase.coins });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Coin payment webhook failed" }); }
});

walletRouter.post("/payout/paystack/webhook", async (req, res) => {
  try {
    const rawBody = (req as typeof req & { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {});
    if (!verifyPaystackWebhookSignature(rawBody, req.header("x-paystack-signature"))) return res.status(401).json({ error: "Invalid signature" });
    const event = String(req.body?.event ?? "");
    if (!["transfer.success", "transfer.failed", "transfer.reversed"].includes(event)) return res.json({ ok: true, ignored: true });
    const reference = String(req.body?.data?.reference ?? "");
    const eventId = String(req.body?.data?.id ?? reference + ":" + event);
    if (!reference) return res.status(400).json({ error: "Transfer reference missing" });
    const result = await reconcilePaystackTransfer(await getDb(), { eventId, event: event as "transfer.success" | "transfer.failed" | "transfer.reversed", reference, rawStatus: String(req.body?.data?.status ?? "") });
    return res.json({ ok: true, ...result });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Payout webhook failed" }); }
});

walletRouter.post("/gifts", requireUser, async (req, res) => {
  try {
    const { receiverId, giftId, quantity, context = "VIDEO", videoId } = req.body ?? {};
    const senderId = req.userId!.toHexString();
    if (!receiverId || !giftId) return res.status(400).json({ error: "receiverId and giftId are required" });
    const idempotencyKey = String(req.header("Idempotency-Key") ?? "").trim();
    if (!idempotencyKey) return res.status(400).json({ error: "Idempotency-Key header is required" });
    const result = await sendGift(await getDb(), { senderId, receiverId: String(receiverId), giftId, quantity, context, videoId: videoId ? String(videoId) : undefined, idempotencyKey });
    if (!result.duplicate) {
      broadcastToUser(String(receiverId), {
        type: "gift.received",
        transactionId: result.transactionId,
        videoId: result.videoId ?? null,
        giftId,
        quantity: result.quantity,
        coinsSpent: result.coinsSpent,
        diamondsAwarded: result.diamondsAwarded,
        animation: result.gift?.animation ?? giftId
      });
      broadcastToUser(senderId, {
        type: "gift.sent",
        transactionId: result.transactionId,
        videoId: result.videoId ?? null,
        receiverId: String(receiverId),
        giftId,
        quantity: result.quantity,
        coinsSpent: result.coinsSpent,
        animation: result.gift?.animation ?? giftId
      });
    }
    return res.status(201).json(result);
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Gift failed" }); }
});

walletRouter.get("/payout/ghana/options", requireUser, async (req, res) => {
  try {
    const type = String(req.query.type ?? "bank") === "mobile_money" ? "mobile_money" : "bank";
    return res.json({ countryCode: "GH", type, providers: await listGhanaPayoutBanks(type) });
  } catch (error) { return res.status(503).json({ error: error instanceof Error ? error.message : "Payout provider unavailable" }); }
});

walletRouter.post("/withdrawals", requireUser, async (req, res) => {
  try {
    const { countryCode, type, amountUsd, destination } = req.body ?? {};
    const userId = req.userId!.toHexString();
    if (!countryCode || !type || !destination) return res.status(400).json({ error: "countryCode, type and destination are required" });
    if (String(countryCode).toUpperCase() !== "GH") return res.status(400).json({ error: "Ghana payout provider is currently enabled for this rollout" });
    if (!["BANK", "MOBILE_MONEY"].includes(String(type))) return res.status(400).json({ error: "Invalid payout type" });
    if (Number(amountUsd) < MIN_WITHDRAWAL_USD) return res.status(400).json({ error: "Minimum withdrawal is $" + MIN_WITHDRAWAL_USD });
    const exchangeRate = Number(process.env.TWITOK_USD_GHS_RATE);
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) return res.status(503).json({ error: "GHS payout exchange rate is not configured" });
    const withdrawalId = randomUUID();
    await createWithdrawal(await getDb(), { withdrawalId, userId, countryCode: "GH", type, amountUsd: Number(amountUsd), exchangeRate, destination });
    let payout;
    try { payout = await processGhanaWithdrawal(await getDb(), withdrawalId); }
    catch (error) { return res.status(502).json({ status: "FAILED", withdrawalId, error: error instanceof Error ? error.message : "Payout provider failed" }); }
    return res.status(201).json({ status: payout?.status ?? "PROCESSING", withdrawalId, provider: "PAYSTACK" });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Withdrawal failed" }); }
});
