import type { Db } from "mongodb";
import { withdrawalMethods, PLATFORM_CURRENCY } from "./policy.js";

export async function initializeWithdrawalIndexes(db: Db) {
  await db.collection("withdrawal_methods").createIndex({ userId: 1, type: 1 }, { unique: true });
  await db.collection("withdrawals").createIndex({ providerReference: 1 }, { unique: true, sparse: true });
  await db.collection("withdrawals").createIndex({ withdrawalId: 1 }, { unique: true });
}

export function validateWithdrawalMethod(countryCode: string, type: string) {
  const allowed = withdrawalMethods(countryCode);
  if (!allowed.includes(type as never)) throw new Error("Withdrawal method is not available in this country");
}

function serverExchangeRate(currency: string) {
  let rates: Record<string, unknown>;
  try { rates = JSON.parse(process.env.TWITOK_FX_RATES_JSON ?? "{}"); }
  catch { throw new Error("Server FX configuration is invalid"); }
  const rate = Number(rates[`${PLATFORM_CURRENCY}_${currency}`]);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Server FX rate is unavailable");
  return rate;
}

export async function createWithdrawal(
  db: Db,
  input: { withdrawalId: string; userId: string; countryCode: string; type: "BANK" | "MOBILE_MONEY"; amountUsd: number; destination: Record<string, unknown> }
) {
  validateWithdrawalMethod(input.countryCode, input.type);
  if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) throw new Error("Withdrawal amount must be positive");
  if (input.amountUsd > 100000) throw new Error("Withdrawal amount exceeds the allowed limit");

  const countryCode = input.countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error("Invalid country code");
  if (!input.destination || Object.keys(input.destination).length === 0 || JSON.stringify(input.destination).length > 4096) {
    throw new Error("Invalid payout destination");
  }

  const localCurrency: Record<string,string> = { GH:"GHS", ZA:"ZAR", KE:"KES", UG:"UGX", NG:"NGN" };
  const payoutCurrency = localCurrency[countryCode] ?? String(input.destination.currency ?? "").trim().toUpperCase();
  if (!payoutCurrency) throw new Error("Payout currency is required");
  const exchangeRate = serverExchangeRate(payoutCurrency);
  const localAmount = Number((input.amountUsd * exchangeRate).toFixed(2));
  const now = new Date();
  const session = db.client?.startSession();
  if (!session) throw new Error("MongoDB session unavailable");

  try {
    await session.withTransaction(async () => {
      const wallet = await db.collection("wallets").findOne({ userId: input.userId }, { session });
      const balance = Number(wallet?.balanceUsd ?? 0);
      if (!wallet || !Number.isFinite(balance) || balance < input.amountUsd) throw new Error("Insufficient USD wallet balance");

      await db.collection("wallets").updateOne(
        { userId: input.userId, balanceUsd: { $gte: input.amountUsd } },
        { $inc: { balanceUsd: -input.amountUsd }, $set: { updatedAt: now } },
        { session }
      );

      await db.collection("withdrawals").insertOne({
        withdrawalId: input.withdrawalId,
        userId: input.userId,
        countryCode,
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
