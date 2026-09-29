import { Router } from "express";
import { ObjectId } from "mongodb";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/mongo.js";
import { allocateQualifyingRevenue } from "../money/ledger.js";
import { createWithdrawal } from "../money/withdrawal.js";
import { requireUser } from "../auth/middleware.js";
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

moneyRouter.post("/withdrawals", requireUser, rateLimit({ windowMs: 60 * 60 * 1000, max: 5, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" }), async (req, res) => {
  try {
    const { countryCode, type, amountUsd, destination } = req.body ?? {};
    if (!countryCode || !type || !destination || typeof destination !== "object" || Array.isArray(destination)) return res.status(400).json({ error: "countryCode, type and destination are required" });
    if (!["BANK", "MOBILE_MONEY"].includes(String(type))) return res.status(400).json({ error: "Invalid withdrawal method" });
    if (!Number.isFinite(Number(amountUsd)) || Number(amountUsd) <= 0 || Number(amountUsd) > 100000) return res.status(400).json({ error: "Invalid withdrawal amount" });
    const idempotencyKey = String(req.header("Idempotency-Key") ?? randomUUID()).trim();
    if (!/^[A-Za-z0-9._:-]{16,100}$/.test(idempotencyKey)) return res.status(400).json({ error: "A valid Idempotency-Key is required" });
    const withdrawalId = randomUUID();
    const db = await getDb();
    const existing = await db.collection("withdrawals").findOne({ userId: req.userId!.toHexString(), idempotencyKey }, { projection: { status: 1, payoutCurrency: 1 } });
    if (existing) return res.status(200).json({ status: existing.status, currency: existing.payoutCurrency ?? "USD", idempotent: true });
    await createWithdrawal(db, {
      withdrawalId, userId: req.userId!.toHexString(), countryCode: String(countryCode), type,
      amountUsd: Number(amountUsd), destination, idempotencyKey
    });
    return res.status(201).json({ status: "PENDING", currency: "USD" });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Withdrawal failed" }); }
});