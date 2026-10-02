import { MongoClient, type Db } from "mongodb";
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
  if (existing) {
    if (String(existing.userId) !== String(input.userId) || Number(existing.grossUsd) !== Number(input.grossUsd) || String(existing.source) !== String(input.source)) throw new Error("Transaction idempotency key conflicts with existing transaction");
    return existing;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");
  const client = new MongoClient(uri);
  await client.connect();
  const session = client.startSession();
  const txDb = client.db(db.databaseName);

  try {
    let result;
    await session.withTransaction(async () => {
      await txDb.collection("financial_ledger").insertOne({
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

      await txDb.collection("wallets").updateOne(
        { userId: input.userId },
        { $inc: { balanceUsd: split.creatorUsd }, $setOnInsert: { userId: input.userId, currency: PLATFORM_CURRENCY, createdAt: now } },
        { upsert: true, session }
      );

      await txDb.collection("platform_money_account").updateOne(
        { currency: PLATFORM_CURRENCY },
        { $inc: { balanceUsd: split.platformUsd }, $setOnInsert: { currency: PLATFORM_CURRENCY, createdAt: now } },
        { upsert: true, session }
      );
    });
    result = await txDb.collection("financial_ledger").findOne({ transactionId: input.transactionId });
    return result;
  } finally {
    await session.endSession();
    await client.close();
  }
}
