import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/mongo.js";
import { COIN_PACKAGES, MIN_WITHDRAWAL_USD, creditPurchasedCoins, ensureWallet } from "../money/wallet.js";
import { GIFT_CATALOG, sendGift } from "../money/gifts.js";
import { createWithdrawal } from "../money/withdrawal.js";

export const walletRouter = Router();

walletRouter.get("/catalog", (_req, res) => res.json({
  coinPackages: COIN_PACKAGES, gifts: GIFT_CATALOG,
  creatorSharePercent: 30, platformSharePercent: 70,
  diamondsPerCoin: 0.30, diamondCashValueUsd: 0.003, minWithdrawalUsd: MIN_WITHDRAWAL_USD
}));

walletRouter.get("/:userId", async (req, res) => {
  try { return res.json(await ensureWallet(await getDb(), String(req.params.userId))); }
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

walletRouter.post("/gifts", async (req, res) => {
  try {
    const { senderId, receiverId, giftId, quantity, context = "VIDEO" } = req.body ?? {};
    if (!senderId || !receiverId || !giftId) return res.status(400).json({ error: "senderId, receiverId and giftId are required" });
    return res.status(201).json(await sendGift(await getDb(), { senderId, receiverId, giftId, quantity, context }));
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Gift failed" }); }
});

walletRouter.post("/withdrawals", async (req, res) => {
  try {
    const { userId, countryCode, type, amountUsd, exchangeRate, destination } = req.body ?? {};
    if (!userId || !countryCode || !type || !destination) return res.status(400).json({ error: "userId, countryCode, type and destination are required" });
    if (Number(amountUsd) < MIN_WITHDRAWAL_USD) return res.status(400).json({ error: "Minimum withdrawal is $" + MIN_WITHDRAWAL_USD });
    await createWithdrawal(await getDb(), { withdrawalId: randomUUID(), userId, countryCode, type, amountUsd: Number(amountUsd), exchangeRate: Number(exchangeRate), destination });
    return res.status(201).json({ status: "PENDING" });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Withdrawal failed" }); }
});
