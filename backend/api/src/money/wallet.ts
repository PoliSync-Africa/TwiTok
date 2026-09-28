import type { Db, ClientSession } from "mongodb";
import { randomUUID } from "node:crypto";

export const COIN_PACKAGES = [
  { sku: "100_twitok_coins", coins: 100, priceUsd: 0.99 },
  { sku: "500_twitok_coins", coins: 500, priceUsd: 4.99 },
  { sku: "1000_twitok_coins", coins: 1000, priceUsd: 9.99 },
  { sku: "5000_twitok_coins", coins: 5000, priceUsd: 49.99 },
  { sku: "10000_twitok_coins", coins: 10000, priceUsd: 99.99 }
] as const;

export const CREATOR_DIAMONDS_PER_COIN = 0.30;
export const MIN_WITHDRAWAL_USD = 10;
export const DIAMOND_CASH_VALUE_USD = 0.003;

export async function initializeWalletIndexes(db: Db) {
  await Promise.all([
    db.collection("wallets").createIndex({ userId: 1 }, { unique: true }),
    db.collection("wallet_ledger").createIndex({ transactionId: 1 }, { unique: true }),
    db.collection("wallet_ledger").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("iap_transactions").createIndex({ providerTransactionId: 1 }, { unique: true }),
    db.collection("iap_transactions").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("coin_purchases").createIndex({ reference: 1 }, { unique: true }),
    db.collection("coin_purchases").createIndex({ userId: 1, createdAt: -1 })
  ]);
}

export async function ensureWallet(db: Db, userId: string, session?: ClientSession) {
  const now = new Date();
  await db.collection("wallets").updateOne(
    { userId },
    { $setOnInsert: { userId, coinBalance: 0, diamondBalance: 0, cashBalanceUsd: 0, createdAt: now, updatedAt: now } },
    { upsert: true, session }
  );
  return db.collection("wallets").findOne({ userId }, { session });
}

export async function creditPurchasedCoins(db: Db, input: {
  userId: string; coins: number; provider: "APPLE"|"GOOGLE"|"REVENUECAT"|"WEB"|"PAYSTACK";
  providerTransactionId: string; sku: string; grossUsd?: number;
}) {
  if (!Number.isInteger(input.coins) || input.coins <= 0) throw new Error("Invalid coin amount");
  const existing = await db.collection("iap_transactions").findOne({ providerTransactionId: input.providerTransactionId });
  if (existing) return { duplicate: true, wallet: await ensureWallet(db, input.userId) };

  const session = db.client?.startSession();
  if (!session) throw new Error("MongoDB session unavailable");
  const now = new Date();
  try {
    await session.withTransaction(async () => {
      await ensureWallet(db, input.userId, session);
      await db.collection("wallets").updateOne(
        { userId: input.userId }, { $inc: { coinBalance: input.coins }, $set: { updatedAt: now } }, { session }
      );
      await db.collection("iap_transactions").insertOne({
        providerTransactionId: input.providerTransactionId, userId: input.userId,
        provider: input.provider, sku: input.sku, coins: input.coins,
        grossUsd: input.grossUsd ?? null, status: "CREDITED", createdAt: now
      }, { session });
      await db.collection("wallet_ledger").insertOne({
        transactionId: randomUUID(), userId: input.userId, type: "COIN_PURCHASE",
        coinsDelta: input.coins, diamondsDelta: 0, cashDeltaUsd: 0,
        referenceId: input.providerTransactionId, createdAt: now
      }, { session });
    });
  } finally { await session.endSession(); }
  return { duplicate: false, wallet: await ensureWallet(db, input.userId) };
}
