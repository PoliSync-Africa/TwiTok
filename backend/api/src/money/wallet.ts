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
    db.collection("coin_purchases").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("coin_funding_lots").createIndex({ lotId: 1 }, { unique: true }),
    db.collection("coin_funding_lots").createIndex({ providerTransactionId: 1 }, { unique: true }),
    db.collection("coin_funding_lots").createIndex({ userId: 1, status: 1, createdAt: 1 }),
    db.collection("gift_coin_allocations").createIndex({ giftTransactionId: 1, providerTransactionId: 1 }, { unique: true }),
    db.collection("gift_coin_allocations").createIndex({ providerTransactionId: 1, createdAt: 1 }),
    db.collection("platform_refund_ledger").createIndex({ transactionId: 1 }, { unique: true }),
    db.collection("platform_refund_ledger").createIndex({ refundEventId: 1, giftTransactionId: 1 }, { unique: true }),
    db.collection("platform_refund_ledger").createIndex({ providerTransactionId: 1, createdAt: -1 })
  ]);
}

export async function ensureWallet(db: Db, userId: string, session?: ClientSession) {
  const now = new Date();
  await db.collection("wallets").updateOne(
    { userId },
    { $setOnInsert: { userId, coinBalance: 0, diamondBalance: 0, cashBalanceUsd: 0, unallocatedNetProceedsUsd: 0, refundLiabilityUsd: 0, creatorRefundLiabilityUsd: 0, createdAt: now, updatedAt: now } },
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
      await db.collection("coin_funding_lots").insertOne({
        lotId: randomUUID(),
        userId: input.userId,
        provider: input.provider,
        providerTransactionId: input.providerTransactionId,
        sku: input.sku,
        totalCoins: input.coins,
        remainingCoins: input.coins,
        netProceedsUsd,
        remainingNetProceedsUsd: netProceedsUsd,
        status: "OPEN",
        createdAt: now,
        updatedAt: now
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

      const priorRefundEvents = Array.isArray(iap.refundEventIds) ? iap.refundEventIds.map(String) : [];
      if (priorRefundEvents.includes(input.refundEventId) || iap.status === "REFUNDED") {
        return {
          duplicate: true,
          userId: String(iap.userId),
          adjustedUnallocatedUsd: 0,
          refundLiabilityUsd: Number(iap.refundLiabilityUsd ?? 0)
        };
      }

      const userId = String(iap.userId);
      const originalNetProceedsUsd = Number(iap.netProceedsUsd ?? 0);
      const alreadyRefundedUsd = Number(iap.refundedNetProceedsUsd ?? 0);
      const requestedRefundUsd = Math.min(Math.max(0, input.refundNetProceedsUsd), Math.max(0, originalNetProceedsUsd));
      const remainingRefundUsd = Number(Math.max(0, requestedRefundUsd - alreadyRefundedUsd).toFixed(8));
      if (remainingRefundUsd <= 0) {
        return { duplicate: true, userId, adjustedUnallocatedUsd: 0, refundLiabilityUsd: Number(iap.refundLiabilityUsd ?? 0) };
      }

      await ensureWallet(db, userId, session);
      const wallet = await db.collection("wallets").findOne({ userId }, { session });
      const unallocated = Number(wallet?.unallocatedNetProceedsUsd ?? 0);
      const coinBalance = Number(wallet?.coinBalance ?? 0);
      if (!Number.isFinite(unallocated) || unallocated < 0 || !Number.isFinite(coinBalance) || coinBalance < 0) {
        throw new Error("Invalid Coin funding ledger");
      }

      const lot = await db.collection("coin_funding_lots").findOne(
        { providerTransactionId: input.providerTransactionId, userId },
        { session }
      );

      const lotRemainingNet = Math.max(0, Number(lot?.remainingNetProceedsUsd ?? 0));
      const lotRemainingCoins = Math.max(0, Number(lot?.remainingCoins ?? 0));
      const adjustedUnallocatedUsd = Number(Math.min(unallocated, lotRemainingNet, remainingRefundUsd).toFixed(8));
      let unresolvedGiftRefundUsd = Number(Math.max(0, remainingRefundUsd - adjustedUnallocatedUsd).toFixed(8));
      let creatorRecoveredUsd = 0;
      let creatorLiabilityUsd = 0;
      let platformLiabilityUsd = 0;
      let giftedRefundUsd = 0;
      let unusedCoinsReversed = 0;

      if (lot && adjustedUnallocatedUsd > 0 && lotRemainingNet > 0 && lotRemainingCoins > 0) {
        unusedCoinsReversed = Math.min(
          lotRemainingCoins,
          Math.max(1, Math.floor(lotRemainingCoins * (adjustedUnallocatedUsd / lotRemainingNet)))
        );
        if (adjustedUnallocatedUsd >= lotRemainingNet) unusedCoinsReversed = lotRemainingCoins;
      }

      if (unresolvedGiftRefundUsd > 0) {
        const allocations = await db.collection("gift_coin_allocations")
          .find({ providerTransactionId: input.providerTransactionId })
          .sort({ createdAt: 1 })
          .toArray();

        for (const allocation of allocations) {
          if (unresolvedGiftRefundUsd <= 0) break;
          const allocationNet = Math.max(0, Number(allocation.netProceedsUsd ?? 0));
          const alreadyAllocationRefunded = Math.max(0, Number(allocation.refundedNetProceedsUsd ?? 0));
          const availableAllocationNet = Math.max(0, allocationNet - alreadyAllocationRefunded);
          if (availableAllocationNet <= 0) continue;

          const refundForAllocation = Number(Math.min(unresolvedGiftRefundUsd, availableAllocationNet).toFixed(8));
          const creatorRefund = Number((refundForAllocation * 0.30).toFixed(8));
          const platformRefund = Number((refundForAllocation - creatorRefund).toFixed(8));
          const gift = await db.collection("gift_transactions").findOne(
            { transactionId: String(allocation.giftTransactionId) },
            { session }
          );
          if (!gift) throw new Error("Gift transaction for Coin refund allocation not found");

          const creatorId = String(gift.receiverId);
          await ensureWallet(db, creatorId, session);
          const creatorWallet = await db.collection("wallets").findOne({ userId: creatorId }, { session });
          const creatorCash = Math.max(0, Number(creatorWallet?.cashBalanceUsd ?? 0));
          const recovered = Number(Math.min(creatorCash, creatorRefund).toFixed(8));
          const creatorLiability = Number(Math.max(0, creatorRefund - recovered).toFixed(8));

          if (recovered > 0) {
            await db.collection("wallets").updateOne(
              { userId: creatorId, cashBalanceUsd: { $gte: recovered } },
              { $inc: { cashBalanceUsd: -recovered }, $set: { updatedAt: now } },
              { session }
            );
          }
          if (creatorLiability > 0) {
            await db.collection("wallets").updateOne(
              { userId: creatorId },
              { $inc: { creatorRefundLiabilityUsd: creatorLiability }, $set: { updatedAt: now } },
              { session }
            );
          }

          await db.collection("gift_coin_allocations").updateOne(
            { _id: allocation._id },
            {
              $inc: { refundedNetProceedsUsd: refundForAllocation },
              $set: { lastRefundEventId: input.refundEventId, updatedAt: now }
            },
            { session }
          );
          await db.collection("gift_transactions").updateOne(
            { transactionId: String(allocation.giftTransactionId) },
            {
              $inc: {
                refundedNetProceedsUsd: refundForAllocation,
                refundedCreatorEarningsUsd: creatorRefund,
                refundedPlatformAllocationUsd: platformRefund
              },
              $set: { lastRefundEventId: input.refundEventId, updatedAt: now }
            },
            { session }
          );
          await db.collection("wallet_ledger").insertOne({
            transactionId: randomUUID(),
            userId: creatorId,
            type: "GIFT_REFUND_ADJUSTMENT",
            coinsDelta: 0,
            diamondsDelta: 0,
            cashDeltaUsd: -recovered,
            referenceId: String(allocation.giftTransactionId),
            refundEventId: input.refundEventId,
            createdAt: now
          }, { session });

          await db.collection("platform_refund_ledger").insertOne({
            transactionId: randomUUID(),
            refundEventId: input.refundEventId,
            providerTransactionId: input.providerTransactionId,
            giftTransactionId: String(allocation.giftTransactionId),
            amountUsd: platformRefund,
            creatorAmountUsd: creatorRefund,
            creatorRecoveredUsd: recovered,
            creatorLiabilityUsd: creatorLiability,
            createdAt: now
          }, { session });

          creatorRecoveredUsd = Number((creatorRecoveredUsd + recovered).toFixed(8));
          creatorLiabilityUsd = Number((creatorLiabilityUsd + creatorLiability).toFixed(8));
          platformLiabilityUsd = Number((platformLiabilityUsd + platformRefund).toFixed(8));
          giftedRefundUsd = Number((giftedRefundUsd + refundForAllocation).toFixed(8));
          unresolvedGiftRefundUsd = Number((unresolvedGiftRefundUsd - refundForAllocation).toFixed(8));
        }
      }

      const totalAppliedUsd = Number((adjustedUnallocatedUsd + giftedRefundUsd).toFixed(8));
      const remainingLiabilityUsd = Number(Math.max(0, remainingRefundUsd - totalAppliedUsd).toFixed(8));
      const newRefundedUsd = Number((alreadyRefundedUsd + totalAppliedUsd).toFixed(8));
      const fullyRefunded = newRefundedUsd >= originalNetProceedsUsd - 0.00000001;

      if (adjustedUnallocatedUsd > 0 || unusedCoinsReversed > 0) {
        const coinFilter = lot
          ? { userId, coinBalance: { $gte: unusedCoinsReversed } }
          : { userId };
        await db.collection("wallets").updateOne(
          coinFilter,
          {
            $inc: {
              coinBalance: -unusedCoinsReversed,
              unallocatedNetProceedsUsd: -adjustedUnallocatedUsd,
              refundLiabilityUsd: remainingLiabilityUsd
            },
            $set: { updatedAt: now }
          },
          { session }
        );
      } else if (remainingLiabilityUsd > 0) {
        await db.collection("wallets").updateOne(
          { userId },
          { $inc: { refundLiabilityUsd: remainingLiabilityUsd }, $set: { updatedAt: now } },
          { session }
        );
      }

      if (lot) {
        const refundedCoins = unusedCoinsReversed;
        const newRemainingCoins = Math.max(0, lotRemainingCoins - refundedCoins);
        const newRemainingNet = Number(Math.max(0, lotRemainingNet - adjustedUnallocatedUsd).toFixed(8));
        await db.collection("coin_funding_lots").updateOne(
          { _id: lot._id },
          {
            $set: {
              remainingCoins: newRemainingCoins,
              remainingNetProceedsUsd: newRemainingNet,
              status: fullyRefunded ? "REFUNDED" : (newRemainingCoins === 0 && newRemainingNet === 0 ? "EXHAUSTED" : "PARTIALLY_REFUNDED"),
              lastRefundEventId: input.refundEventId,
              updatedAt: now
            }
          },
          { session }
        );
      }

      await db.collection("iap_transactions").updateOne(
        { providerTransactionId: input.providerTransactionId },
        {
          $set: {
            status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
            settlementStatus: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
            refundedAt: fullyRefunded ? now : (iap.refundedAt ?? now),
            refundEventId: input.refundEventId,
            refundGrossUsd: input.refundGrossUsd ?? null,
            refundNetProceedsUsd: input.refundNetProceedsUsd,
            refundedNetProceedsUsd: newRefundedUsd,
            refundLiabilityUsd: Number((Number(iap.refundLiabilityUsd ?? 0) + remainingLiabilityUsd).toFixed(8)),
            refundEventIds: [...priorRefundEvents, input.refundEventId]
          }
        },
        { session }
      );

      await db.collection("wallet_ledger").insertOne({
        transactionId: randomUUID(),
        userId,
        type: "COIN_PURCHASE_REFUND",
        coinsDelta: -unusedCoinsReversed,
        diamondsDelta: 0,
        cashDeltaUsd: -remainingRefundUsd,
        referenceId: input.providerTransactionId,
        refundEventId: input.refundEventId,
        adjustedUnallocatedUsd,
        giftedRefundUsd,
        creatorRecoveredUsd,
        creatorLiabilityUsd,
        platformLiabilityUsd,
        refundLiabilityUsd: remainingLiabilityUsd,
        createdAt: now
      }, { session });

      return {
        duplicate: false,
        userId,
        adjustedUnallocatedUsd,
        giftedRefundUsd,
        creatorRecoveredUsd,
        creatorLiabilityUsd,
        platformLiabilityUsd,
        unusedCoinsReversed,
        refundLiabilityUsd: remainingLiabilityUsd,
        fullyRefunded
      };
    });
  } finally {
    await session.endSession();
  }
}
