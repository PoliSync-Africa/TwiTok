import { Db } from "mongodb";
import { PLATFORM_CURRENCY, splitRevenue } from "./policy.js";

export async function initializeMoneyIndexes(db: Db) {
  await Promise.all([
    db.collection("financial_ledger").createIndex({ transactionId: 1 }, { unique: true }),
    db.collection("financial_ledger").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("wallets").createIndex({ userId: 1 }, { unique: true }),
    db.collection("withdrawals").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("withdrawals").createIndex({ status: 1, createdAt: -1 })
  ]);
}

export async function allocateQualifyingRevenue(
  db: Db,
  input: { transactionId: string; userId: string; grossUsd: number; source: string }
) {
  const split = splitRevenue(input.grossUsd);
  const now = new Date();

  const existing = await db.collection("financial_ledger").findOne({ transactionId: input.transactionId });
  if (existing) return existing;

  const session = db.client?.startSession();
  if (!session) throw new Error("MongoDB session unavailable");

  try {
    let result;
    await session.withTransaction(async () => {
      await db.collection("financial_ledger").insertOne({
        transactionId: input.transactionId,
        userId: input.userId,
        source: input.source,
        currency: PLATFORM_CURRENCY,
        grossUsd: input.grossUsd,
        platformUsd: split.platformUsd,
        creatorUsd: split.creatorUsd,
        type: "REVENUE_ALLOCATION",
        createdAt: now
      }, { session });

      await db.collection("wallets").updateOne(
        { userId: input.userId },
        { $inc: { balanceUsd: split.creatorUsd }, $setOnInsert: { userId: input.userId, currency: PLATFORM_CURRENCY, createdAt: now } },
        { upsert: true, session }
      );

      await db.collection("platform_money_account").updateOne(
        { currency: PLATFORM_CURRENCY },
        { $inc: { balanceUsd: split.platformUsd }, $setOnInsert: { currency: PLATFORM_CURRENCY, createdAt: now } },
        { upsert: true, session }
      );
    });
    result = await db.collection("financial_ledger").findOne({ transactionId: input.transactionId });
    return result;
  } finally {
    await session.endSession();
  }
}
