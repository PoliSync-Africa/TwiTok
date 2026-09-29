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

export async function initializeWalletIndexes(db: Db) {
  await Promise.all([
    db.collection("wallets").createIndex({ userId: 1 }, { unique: true }),
    db.collection("wallet_ledger").createIndex({ transactionId: 1 }, { unique: true }),
    db.collection("wallet_ledger").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("iap_transactions").createIndex({ providerTransactionId: 1 }, { unique: true }),
    db.collection("iap_transactions").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("revenuecat_webhook_events").createIndex({ eventId: 1 }, { unique: true }),
    db.collection("revenuecat_webhook_events").createIndex({ transactionId: 1, createdAt: -1 }),
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
  userId: string; coins: number; provider: "APPLE"|"GOOGLE"|"REVENUECAT"|"WEB"|"PAYSTACK"|"FLUTTERWAVE";
  providerTransactionId: string; sku: string; grossUsd?: number; netProceedsUsd?: number;
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
      const netProceedsUsd = Number(input.netProceedsUsd ?? 0);
      if (!Number.isFinite(netProceedsUsd) || netProceedsUsd < 0) throw new Error("Invalid net proceeds");
      await db.collection("wallets").updateOne(
        { userId: input.userId },
        { $inc: { coinBalance: input.coins, unallocatedNetProceedsUsd: netProceedsUsd }, $set: { updatedAt: now } },
        { session }
      );
      await db.collection("iap_transactions").insertOne({
        providerTransactionId: input.providerTransactionId, userId: input.userId,
        provider: input.provider, sku: input.sku, coins: input.coins,
grossUsd: input.grossUsd ?? null, netProceedsUsd, status: "CREDITED", settlementStatus: "SETTLED", createdAt: now
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


export async function recordPurchasedCoinRefund(db: Db, input: {
  providerTransactionId: string;
  refundEventId: string;
  refundNetProceedsUsd: number;
  refundGrossUsd?: number;
}) {
  if (!input.providerTransactionId || !input.refundEventId) throw new Error("Refund identifiers are required");
  if (!Number.isFinite(input.refundNetProceedsUsd) || input.refundNetProceedsUsd < 0) throw new Error("Invalid refund net proceeds");

  const session = db.client?.startSession();
  if (!session) throw new Error("MongoDB session unavailable");
  const now = new Date();

  try {
    return await session.withTransaction(async () => {
      const iap = await db.collection("iap_transactions").findOne(
        { providerTransactionId: input.providerTransactionId },
        { session }
      );
      if (!iap) throw new Error("Original Coin purchase not found");
      if (iap.status === "REFUNDED") {
        return { duplicate: true, userId: String(iap.userId), adjustedUnallocatedUsd: 0, refundLiabilityUsd: Number(iap.refundLiabilityUsd ?? 0) };
      }

      const userId = String(iap.userId);
      await ensureWallet(db, userId, session);
      const wallet = await db.collection("wallets").findOne({ userId }, { session });
      const unallocated = Number(wallet?.unallocatedNetProceedsUsd ?? 0);
      if (!Number.isFinite(unallocated) || unallocated < 0) throw new Error("Invalid Coin funding ledger");

      const adjustedUnallocatedUsd = Number(Math.min(unallocated, input.refundNetProceedsUsd).toFixed(8));
      const refundLiabilityUsd = Number(Math.max(0, input.refundNetProceedsUsd - adjustedUnallocatedUsd).toFixed(8));

      if (adjustedUnallocatedUsd > 0) {
        await db.collection("wallets").updateOne(
          { userId },
          { $inc: { unallocatedNetProceedsUsd: -adjustedUnallocatedUsd }, $set: { updatedAt: now } },
          { session }
        );
      }
      if (refundLiabilityUsd > 0) {
        await db.collection("wallets").updateOne(
          { userId },
          { $inc: { refundLiabilityUsd: refundLiabilityUsd }, $set: { updatedAt: now } },
          { session }
        );
      }

      await db.collection("iap_transactions").updateOne(
        { providerTransactionId: input.providerTransactionId },
        {
          $set: {
            status: "REFUNDED",
            settlementStatus: "REFUNDED",
            refundedAt: now,
            refundEventId: input.refundEventId,
            refundGrossUsd: input.refundGrossUsd ?? null,
            refundNetProceedsUsd: input.refundNetProceedsUsd,
            refundLiabilityUsd
          }
        },
        { session }
      );

      await db.collection("wallet_ledger").insertOne({
        transactionId: randomUUID(),
        userId,
        type: "COIN_PURCHASE_REFUND",
        coinsDelta: 0,
        diamondsDelta: 0,
        cashDeltaUsd: -input.refundNetProceedsUsd,
        referenceId: input.providerTransactionId,
        refundEventId: input.refundEventId,
        adjustedUnallocatedUsd,
        refundLiabilityUsd,
        createdAt: now
      }, { session });

      return { duplicate: false, userId, adjustedUnallocatedUsd, refundLiabilityUsd };
    });
  } finally {
    await session.endSession();
  }
}
