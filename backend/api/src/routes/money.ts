import { Router } from "express";
import { ObjectId } from "mongodb";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/mongo.js";
import { allocateQualifyingRevenue } from "../money/ledger.js";
import { createWithdrawal } from "../money/withdrawal.js";
import { requireAdultUser } from "../auth/middleware.js";
import { currencyForCountry, exchangeRateEnvName } from "../money/providers/routing.js";
import { MIN_WITHDRAWAL_USD } from "../money/wallet.js";
import { requireInternalService } from "../security/internal.js";
import { rateLimit } from "../security/rate-limit.js";

export const moneyRouter = Router();

moneyRouter.post("/internal/revenue/allocate", rateLimit({ windowMs: 60 * 1000, max: 120 }), requireInternalService, async (req, res) => {
  try {
    const { transactionId, userId, grossUsd, source } = req.body ?? {};
    if (typeof transactionId !== "string" || transactionId.length < 8 || transactionId.length > 200 || typeof userId !== "string" || !ObjectId.isValid(userId) || typeof source !== "string" || source.length < 1 || source.length > 80 || !Number.isFinite(Number(grossUsd)) || Number(grossUsd) <= 0 || Number(grossUsd) > 1000000) {
      return res.status(400).json({ error: "Valid transactionId, userId, grossUsd and source are required" });
    }
    const ledger = await allocateQualifyingRevenue(await getDb(), { transactionId, userId, grossUsd: Number(grossUsd), source });
    return res.status(201).json(ledger);
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Revenue allocation failed" }); }
});

moneyRouter.post("/withdrawals", requireAdultUser, rateLimit({ windowMs: 60 * 60 * 1000, max: 5, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" }), async (req, res) => {
  try {
    const { countryCode, type, amountUsd, destination } = req.body ?? {};
    if (!type || !destination || typeof destination !== "object" || Array.isArray(destination)) {
      return res.status(400).json({ error: "type and destination are required" });
    }
    const payoutType = String(type).toUpperCase();
    if (!["BANK", "MOBILE_MONEY"].includes(payoutType)) {
      return res.status(400).json({ error: "Invalid withdrawal method" });
    }
    const amount = Number(amountUsd);
    if (!Number.isFinite(amount) || amount < MIN_WITHDRAWAL_USD || amount > 100000) {
      return res.status(400).json({ error: "Invalid withdrawal amount" });
    }

    const db = await getDb();
    const user = await db.collection("users").findOne(
      { _id: req.userId! },
      { projection: { countryCode: 1 } }
    );
    const accountCountry = String(user?.countryCode ?? "").toUpperCase();
    if (!accountCountry) return res.status(400).json({ error: "Account country is required for payouts" });
    if (countryCode && String(countryCode).toUpperCase() !== accountCountry) {
      return res.status(400).json({ error: "Payout country must match the account country" });
    }

    const currency = currencyForCountry(accountCountry);
    if (!currency) return res.status(400).json({ error: "Unsupported payout currency for this country" });
    const exchangeRate = Number(process.env[exchangeRateEnvName(currency)]);
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      return res.status(503).json({ error: currency + " payout exchange rate is not configured" });
    }

    const idempotencyKey = String(req.header("Idempotency-Key") ?? "").trim();
    if (!/^[A-Za-z0-9._:-]{16,100}$/.test(idempotencyKey)) {
      return res.status(400).json({ error: "A valid Idempotency-Key is required" });
    }

    const existing = await db.collection("withdrawals").findOne(
      { userId: req.userId!.toHexString(), idempotencyKey },
      { projection: { status: 1, withdrawalId: 1, payoutCurrency: 1 } }
    );
    if (existing) {
      return res.status(200).json({
        status: existing.status,
        withdrawalId: existing.withdrawalId,
        currency: existing.payoutCurrency ?? currency,
        idempotent: true
      });
    }

    const withdrawalId = randomUUID();
    await createWithdrawal(db, {
      withdrawalId,
      userId: req.userId!.toHexString(),
      countryCode: accountCountry,
      type: payoutType as "BANK" | "MOBILE_MONEY",
      amountUsd: amount,
      exchangeRate,
      destination,
      idempotencyKey
    });
    return res.status(201).json({ status: "PENDING", withdrawalId, currency });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Withdrawal failed" });
  }
});