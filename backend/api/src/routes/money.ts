import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/mongo.js";
import { allocateQualifyingRevenue } from "../money/ledger.js";
import { createWithdrawal } from "../money/withdrawal.js";

export const moneyRouter = Router();

moneyRouter.post("/internal/revenue/allocate", async (req, res) => {
  try {
    const { transactionId, userId, grossUsd, source } = req.body ?? {};
    if (!transactionId || !userId || !source) return res.status(400).json({ error: "transactionId, userId and source are required" });
    const ledger = await allocateQualifyingRevenue(await getDb(), { transactionId, userId, grossUsd: Number(grossUsd), source });
    return res.status(201).json(ledger);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Revenue allocation failed" });
  }
});

moneyRouter.post("/withdrawals", async (req, res) => {
  try {
    const { userId, countryCode, type, amountUsd, exchangeRate, destination } = req.body ?? {};
    if (!userId || !countryCode || !type || !destination) return res.status(400).json({ error: "userId, countryCode, type and destination are required" });
    await createWithdrawal(await getDb(), {
      withdrawalId: randomUUID(), userId, countryCode, type, amountUsd: Number(amountUsd), exchangeRate: Number(exchangeRate), destination
    });
    return res.status(201).json({ status: "PENDING", currency: "USD" });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Withdrawal failed" });
  }
});
