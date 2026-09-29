import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/mongo.js";
import { allocateQualifyingRevenue } from "../money/ledger.js";
import { createWithdrawal } from "../money/withdrawal.js";
import { requireUser } from "../auth/middleware.js";
import { requireInternalService } from "../security/internal.js";

export const moneyRouter = Router();

moneyRouter.post("/internal/revenue/allocate", requireInternalService, async (req, res) => {
  try {
    const { transactionId, userId, grossUsd, source } = req.body ?? {};
    if (typeof transactionId !== "string" || typeof userId !== "string" || typeof source !== "string" || !Number.isFinite(Number(grossUsd)) || Number(grossUsd) <= 0) {
      return res.status(400).json({ error: "Valid transactionId, userId, grossUsd and source are required" });
    }
    const ledger = await allocateQualifyingRevenue(await getDb(), { transactionId, userId, grossUsd: Number(grossUsd), source });
    return res.status(201).json(ledger);
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Revenue allocation failed" }); }
});

moneyRouter.post("/withdrawals", requireUser, async (req, res) => {
  try {
    const { countryCode, type, amountUsd, destination } = req.body ?? {};
    if (!countryCode || !type || !destination || typeof destination !== "object" || Array.isArray(destination)) return res.status(400).json({ error: "countryCode, type and destination are required" });
    const idempotencyKey = String(req.header("Idempotency-Key") ?? randomUUID()).trim();
    if (!/^[A-Za-z0-9._:-]{16,100}$/.test(idempotencyKey)) return res.status(400).json({ error: "A valid Idempotency-Key is required" });
    const db = await getDb();
    const existing = await db.collection("withdrawals").findOne({ withdrawalId: idempotencyKey, userId: req.userId!.toHexString() }, { projection: { status: 1, payoutCurrency: 1 } });
    if (existing) return res.status(200).json({ status: existing.status, currency: existing.payoutCurrency ?? "USD", idempotent: true });
    await createWithdrawal(db, {
      withdrawalId: idempotencyKey, userId: req.userId!.toHexString(), countryCode: String(countryCode), type,
      amountUsd: Number(amountUsd), destination
    });
    return res.status(201).json({ status: "PENDING", currency: "USD" });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Withdrawal failed" }); }
});