import { Db } from "mongodb";
import { withdrawalMethods, PLATFORM_CURRENCY } from "./policy.js";

export async function initializeWithdrawalIndexes(db: Db) {
  await db.collection("withdrawal_methods").createIndex({ userId: 1, type: 1 }, { unique: true });
  await db.collection("withdrawals").createIndex({ providerReference: 1 }, { unique: true, sparse: true });
}

export function validateWithdrawalMethod(countryCode: string, type: string) {
  const allowed = withdrawalMethods(countryCode);
  if (!allowed.includes(type as never)) throw new Error("Withdrawal method is not available in this country");
}

export async function createWithdrawal(
  db: Db,
  input: { withdrawalId: string; userId: string; countryCode: string; type: "BANK" | "MOBILE_MONEY"; amountUsd: number; exchangeRate: number; destination: Record<string, unknown> }
) {
  validateWithdrawalMethod(input.countryCode, input.type);
  if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) throw new Error("Withdrawal amount must be positive");
  if (!Number.isFinite(input.exchangeRate) || input.exchangeRate <= 0) throw new Error("Exchange rate must be positive");

  const localCurrency: Record<string,string> = { GH:"GHS", ZA:"ZAR", KE:"KES", UG:"UGX", NG:"NGN" };
  const payoutCurrency = localCurrency[input.countryCode.toUpperCase()] ?? input.destination.currency;
  if (!payoutCurrency) throw new Error("Payout currency is required");

  const localAmount = Number((input.amountUsd * input.exchangeRate).toFixed(2));
  const now = new Date();
  const session = db.client?.startSession();
  if (!session) throw new Error("MongoDB session unavailable");

  try {
    await session.withTransaction(async () => {
      const wallet = await db.collection("wallets").findOne({ userId: input.userId }, { session });
      if (!wallet || (wallet.balanceUsd ?? 0) < input.amountUsd) throw new Error("Insufficient USD wallet balance");

      await db.collection("wallets").updateOne(
        { userId: input.userId },
        { $inc: { balanceUsd: -input.amountUsd }, $set: { updatedAt: now } },
        { session }
      );

      await db.collection("withdrawals").insertOne({
        withdrawalId: input.withdrawalId,
        userId: input.userId,
        countryCode: input.countryCode.toUpperCase(),
        type: input.type,
        amountUsd: input.amountUsd,
        sourceCurrency: PLATFORM_CURRENCY,
        exchangeRate,
        payoutCurrency,
        payoutAmount: localAmount,
        destination: input.destination,
        status: "PENDING",
        createdAt: now
      }, { session });
    });
  } finally {
    await session.endSession();
  }
}
