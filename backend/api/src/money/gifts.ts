import type { Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { CREATOR_DIAMONDS_PER_COIN, DIAMOND_CASH_VALUE_USD } from "./wallet.js";

export const GIFT_CATALOG = [
  { giftId: "rose", name: "Rose", coins: 1, animation: "rose" },
  { giftId: "heart", name: "Heart", coins: 5, animation: "heart" },
  { giftId: "clap", name: "Clap", coins: 10, animation: "clap" },
  { giftId: "kente", name: "Kente", coins: 50, animation: "kente" },
  { giftId: "gold_drum", name: "Golden Drum", coins: 100, animation: "drum" },
  { giftId: "royal_crown", name: "Royal Crown", coins: 500, animation: "crown" },
  { giftId: "golden_lion", name: "Golden Lion", coins: 1000, animation: "lion" },
  { giftId: "diamond_kingdom", name: "Diamond Kingdom", coins: 5000, animation: "diamond" }
] as const;

export async function initializeGiftIndexes(db: Db) {
  await Promise.all([
    db.collection("gift_transactions").createIndex({ transactionId: 1 }, { unique: true }),
    db.collection("gift_transactions").createIndex({ senderId: 1, createdAt: -1 }),
    db.collection("gift_transactions").createIndex({ receiverId: 1, createdAt: -1 }),
    db.collection("gift_transactions").createIndex({ senderId: 1, idempotencyKey: 1 }, { unique: true })
  ]);
}

export async function sendGift(db: Db, input: {
  senderId: string; receiverId: string; giftId: string; quantity?: number; idempotencyKey: string;
  context: "LIVE"|"VIDEO"|"COMMENT";
}) {
  if (input.senderId === input.receiverId) throw new Error("You cannot gift yourself");
  const gift = GIFT_CATALOG.find((item) => item.giftId === input.giftId);
  if (!gift) throw new Error("Gift not found");
  const idempotencyKey = String(input.idempotencyKey ?? "").trim();
  if (!idempotencyKey || idempotencyKey.length > 128) throw new Error("A valid Idempotency-Key is required");
  const existing = await db.collection("gift_transactions").findOne({ senderId: input.senderId, idempotencyKey });
  if (existing) return { transactionId: existing.transactionId, duplicate: true, gift: GIFT_CATALOG.find((item) => item.giftId === existing.giftId), quantity: existing.quantity, coinsSpent: existing.coinsSpent, diamondsAwarded: existing.diamondsAwarded, creatorSharePercent: 30, platformSharePercent: 70 };
  const quantity = Math.max(1, Math.min(100, Math.floor(input.quantity ?? 1)));
  const coins = gift.coins * quantity;
  const diamonds = Number((coins * CREATOR_DIAMONDS_PER_COIN).toFixed(2));
  const transactionId = randomUUID();
  const now = new Date();
  const session = db.client?.startSession();
  if (!session) throw new Error("MongoDB session unavailable");

  try {
    await session.withTransaction(async () => {
      await db.collection("wallets").updateOne(
        { userId: input.senderId },
        { $setOnInsert: { userId: input.senderId, coinBalance: 0, diamondBalance: 0, cashBalanceUsd: 0, createdAt: now, updatedAt: now } },
        { upsert: true, session }
      );
      await db.collection("wallets").updateOne(
        { userId: input.receiverId },
        { $setOnInsert: { userId: input.receiverId, coinBalance: 0, diamondBalance: 0, cashBalanceUsd: 0, createdAt: now, updatedAt: now } },
        { upsert: true, session }
      );
      const debit = await db.collection("wallets").updateOne(
        { userId: input.senderId, coinBalance: { $gte: coins } },
        { $inc: { coinBalance: -coins }, $set: { updatedAt: now } }, { session }
      );
      if (debit.modifiedCount !== 1) throw new Error("Insufficient Coins");
      await db.collection("wallets").updateOne(
        { userId: input.receiverId },
        { $inc: { diamondBalance: diamonds, cashBalanceUsd: Number((diamonds * DIAMOND_CASH_VALUE_USD).toFixed(6)) }, $set: { updatedAt: now } }, { session }
      );
      await db.collection("gift_transactions").insertOne({
        transactionId, senderId: input.senderId, receiverId: input.receiverId, idempotencyKey,
        giftId: gift.giftId, giftName: gift.name, quantity, coinsSpent: coins,
        diamondsAwarded: diamonds, platformSharePercent: 70, creatorSharePercent: 30,
        context: input.context, createdAt: now
      }, { session });
      await db.collection("wallet_ledger").insertMany([
        { transactionId: randomUUID(), userId: input.senderId, type: "GIFT_SENT", coinsDelta: -coins, diamondsDelta: 0, cashDeltaUsd: 0, referenceId: transactionId, createdAt: now },
        { transactionId: randomUUID(), userId: input.receiverId, type: "GIFT_RECEIVED", coinsDelta: 0, diamondsDelta: diamonds, cashDeltaUsd: Number((diamonds * DIAMOND_CASH_VALUE_USD).toFixed(6)), referenceId: transactionId, createdAt: now }
      ], { session });
    });
  } finally { await session.endSession(); }
  return { transactionId, gift, quantity, coinsSpent: coins, diamondsAwarded: diamonds, creatorSharePercent: 30, platformSharePercent: 70 };
}
