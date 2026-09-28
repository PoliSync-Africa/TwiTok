import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/mongo.js";
import { COIN_PACKAGES, MIN_WITHDRAWAL_USD, creditPurchasedCoins, ensureWallet } from "../money/wallet.js";
import { GIFT_CATALOG, sendGift } from "../money/gifts.js";
import { createWithdrawal, processGhanaWithdrawal, reconcilePaystackTransfer } from "../money/withdrawal.js";
import { verifyPaystackWebhookSignature } from "../money/providers/paystack.js";
import { listGhanaPayoutBanks } from "../money/providers/paystack.js";
import { requireUser } from "../auth/middleware.js";
import { broadcastToUser } from "../realtime/ws.js";

export const walletRouter = Router();

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
