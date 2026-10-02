import type { Db } from "mongodb";
import { withdrawalMethods, PLATFORM_CURRENCY } from "./policy.js";
import { createGhanaRecipient, initiateGhanaTransfer } from "./providers/paystack.js";
import { initiateFlutterwaveTransfer, getFlutterwaveTransfer } from "./providers/flutterwave.js";
import { resolvePayoutProvider } from "./providers/routing.js";

export async function initializeWithdrawalIndexes(db: Db) {
  await db.collection("withdrawal_methods").createIndex({ userId: 1, type: 1 }, { unique: true });
  await db.collection("payout_webhook_events").createIndex({ eventId: 1 }, { unique: true });
  await db.collection("withdrawals").createIndex({ providerReference: 1 }, { unique: true, sparse: true });
  await db.collection("withdrawals").createIndex({ userId: 1, idempotencyKey: 1 }, { unique: true, sparse: true });
}

export function validateWithdrawalMethod(countryCode: string, type: string) {
  const allowed = withdrawalMethods(countryCode);
  if (!allowed.includes(type as never)) throw new Error("Withdrawal method is not available in this country");
}

export async function createWithdrawal(
  db: Db,
  input: { withdrawalId: string; userId: string; countryCode: string; type: "BANK" | "MOBILE_MONEY"; amountUsd: number; exchangeRate: number; destination: Record<string, unknown>; idempotencyKey: string }
) {
  validateWithdrawalMethod(input.countryCode, input.type);
  if (!input.idempotencyKey || input.idempotencyKey.length > 128) throw new Error("A valid Idempotency-Key is required");
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
      const cashBalanceUsd = Number(wallet?.cashBalanceUsd ?? 0);
      const creatorRefundLiabilityUsd = Number(wallet?.creatorRefundLiabilityUsd ?? 0);
      if (!wallet || !Number.isFinite(cashBalanceUsd) || cashBalanceUsd < input.amountUsd) throw new Error("Insufficient USD wallet balance");
      if (Number.isFinite(creatorRefundLiabilityUsd) && creatorRefundLiabilityUsd > 0.00000001) {
        throw new Error("Creator refund liability must be cleared before withdrawal");
      }

      await db.collection("wallets").updateOne(
        { userId: input.userId },
        { $inc: { cashBalanceUsd: -input.amountUsd }, $set: { updatedAt: now } },
        { session }
      );

      await db.collection("withdrawals").insertOne({
        withdrawalId: input.withdrawalId,
        idempotencyKey: input.idempotencyKey,
        userId: input.userId,
        countryCode: input.countryCode.toUpperCase(),
        type: input.type,
        amountUsd: input.amountUsd,
        sourceCurrency: PLATFORM_CURRENCY,
        exchangeRate: input.exchangeRate,
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


export async function processGhanaWithdrawal(db: Db, withdrawalId: string) {
  const withdrawal = await db.collection("withdrawals").findOne({ withdrawalId });
  if (!withdrawal) throw new Error("Withdrawal not found");
  if (withdrawal.status !== "PENDING") return withdrawal;
  if (withdrawal.countryCode !== "GH") throw new Error("Only Ghana payouts are currently connected to the Paystack provider");

  const destination = withdrawal.destination as Record<string, unknown>;
  const reference = "TWITOK-" + withdrawalId.replace(/-/g, "").slice(0, 24);

  const claim = await db.collection("withdrawals").updateOne(
    { withdrawalId, status: "PENDING" },
    { $set: { provider: "PAYSTACK", providerReference: reference, status: "PROCESSING", updatedAt: new Date() } }
  );
  if (claim.matchedCount === 0) return db.collection("withdrawals").findOne({ withdrawalId });

  let transferAttempted = false;
  try {
    const recipient = await createGhanaRecipient({
      name: String(destination.name ?? ""),
      accountNumber: String(destination.accountNumber ?? ""),
      bankCode: String(destination.bankCode ?? ""),
      type: withdrawal.type === "BANK" ? "ghipss" : "mobile_money"
    });

    await db.collection("withdrawals").updateOne(
      { withdrawalId, status: "PROCESSING" },
      { $set: { providerRecipientCode: recipient.recipient_code, updatedAt: new Date() } }
    );

    transferAttempted = true;
    const transfer = await initiateGhanaTransfer({
      amountGhs: Number(withdrawal.payoutAmount),
      recipientCode: recipient.recipient_code,
      reference,
      reason: "TwiTok creator payout"
    });
    await db.collection("withdrawals").updateOne(
      { withdrawalId, status: "PROCESSING" },
      { $set: { providerReference: transfer.reference, providerStatus: transfer.status, updatedAt: new Date() } }
    );
  } catch (error) {
    // Once the provider transfer request has been sent, an error can be
    // ambiguous: Paystack may have accepted the transfer while the response
    // was lost. Never refund the creator in that window; the webhook must
    // reconcile the final provider state.
    if (transferAttempted) {
      await db.collection("withdrawals").updateOne(
        { withdrawalId, status: "PROCESSING" },
        { $set: { providerStatus: "UNKNOWN", failureReason: "Provider response was ambiguous; awaiting reconciliation", updatedAt: new Date() } }
      );
      throw error;
    }

    const session = db.client?.startSession();
    if (!session) throw error;
    try {
      await session.withTransaction(async () => {
        const current = await db.collection("withdrawals").findOne({ withdrawalId, status: "PROCESSING" }, { session });
        if (!current) return;
        await db.collection("wallets").updateOne(
          { userId: String(current.userId) },
          { $inc: { cashBalanceUsd: Number(current.amountUsd) }, $set: { updatedAt: new Date() } },
          { session }
        );
        await db.collection("withdrawals").updateOne(
          { withdrawalId },
          { $set: { status: "FAILED", failureReason: error instanceof Error ? error.message : "Provider transfer setup failed", updatedAt: new Date() } },
          { session }
        );
      });
    } finally { await session.endSession(); }
    throw error;
  }
  return db.collection("withdrawals").findOne({ withdrawalId });
}


export async function processFlutterwaveWithdrawal(db: Db, withdrawalId: string) {
  const withdrawal = await db.collection("withdrawals").findOne({ withdrawalId });
  if (!withdrawal) throw new Error("Withdrawal not found");
  if (withdrawal.status !== "PENDING") return withdrawal;

  const countryCode = String(withdrawal.countryCode ?? "").toUpperCase();
  const provider = resolvePayoutProvider(countryCode, "FLUTTERWAVE");
  if (provider !== "FLUTTERWAVE") throw new Error("Flutterwave payout provider is not enabled for this country");

  const destination = withdrawal.destination as Record<string, unknown>;
  const accountNumber = String(destination.accountNumber ?? destination.phoneNumber ?? "");
  const bankCode = String(destination.bankCode ?? destination.providerCode ?? "");
  const beneficiaryName = String(destination.name ?? destination.accountName ?? "");
  const branchCode = String(destination.branchCode ?? destination.destinationBranchCode ?? "");
  const type = withdrawal.type as "BANK" | "MOBILE_MONEY";
  if (!accountNumber || !bankCode || !beneficiaryName) throw new Error("Payout destination requires name, account/phone number and provider bank code");
  if (type === "BANK" && countryCode === "GH" && !branchCode) throw new Error("Ghana Flutterwave bank payouts require a branch code");

  const reference = "TWITOK-FLW-PAYOUT-" + withdrawalId.replace(/-/g, "").slice(0, 24);
  const callbackUrl = process.env.TWITOK_FLUTTERWAVE_PAYOUT_CALLBACK_URL;

  const claim = await db.collection("withdrawals").updateOne(
    { withdrawalId, status: "PENDING" },
    { $set: { provider: "FLUTTERWAVE", providerReference: reference, status: "PROCESSING", updatedAt: new Date() } }
  );
  if (claim.matchedCount === 0) return db.collection("withdrawals").findOne({ withdrawalId });

  let transferAttempted = false;
  try {
    transferAttempted = true;
    const transfer = await initiateFlutterwaveTransfer({
      amount: Number(withdrawal.payoutAmount),
      currency: String(withdrawal.payoutCurrency),
      countryCode,
      type,
      accountNumber,
      bankCode,
      branchCode: branchCode || undefined,
      beneficiaryName,
      reference,
      callbackUrl
    });

    await db.collection("withdrawals").updateOne(
      { withdrawalId },
      { $set: {
          providerTransferId: String(transfer.id),
          providerStatus: transfer.status,
          providerFeeLocal: Number(transfer.fee ?? 0),
          status: String(transfer.status).toUpperCase() === "SUCCESSFUL" ? "PAID" : "PROCESSING",
          paidAt: String(transfer.status).toUpperCase() === "SUCCESSFUL" ? new Date() : undefined,
          updatedAt: new Date()
        } }
    );
  } catch (error) {
    // The transfer call is an external side effect. If it was attempted,
    // the response may have been lost after provider acceptance. Keep the
    // debit locked in PROCESSING and let the webhook reconcile it.
    if (transferAttempted) {
      await db.collection("withdrawals").updateOne(
        { withdrawalId, status: "PROCESSING" },
        { $set: { providerStatus: "UNKNOWN", failureReason: "Provider response was ambiguous; awaiting reconciliation", updatedAt: new Date() } }
      );
      throw error;
    }

    const session = db.client?.startSession();
    if (!session) throw error;
    try {
      await session.withTransaction(async () => {
        const current = await db.collection("withdrawals").findOne({ withdrawalId, status: "PROCESSING" }, { session });
        if (!current) return;
        await db.collection("wallets").updateOne(
          { userId: String(current.userId) },
          { $inc: { cashBalanceUsd: Number(current.amountUsd) }, $set: { updatedAt: new Date() } },
          { session }
        );
        await db.collection("withdrawals").updateOne(
          { withdrawalId },
          { $set: { status: "FAILED", failureReason: error instanceof Error ? error.message : "Flutterwave transfer setup failed", updatedAt: new Date() } },
          { session }
        );
      });
    } finally { await session.endSession(); }
    throw error;
  }

  return db.collection("withdrawals").findOne({ withdrawalId });
}

export async function reconcileFlutterwaveTransfer(db: Db, input: {
  eventId: string;
  transferId: string;
  reference: string;
  status: string;
  amount: number;
  currency: string;
  rawMessage?: string;
}) {
  const byTransferId = input.transferId
    ? await db.collection("withdrawals").findOne({ provider: "FLUTTERWAVE", providerTransferId: input.transferId })
    : null;
  const byReference = input.reference
    ? await db.collection("withdrawals").findOne({ provider: "FLUTTERWAVE", providerReference: input.reference })
    : null;

  if (byTransferId && byReference && String(byTransferId.withdrawalId) !== String(byReference.withdrawalId)) {
    throw new Error("Flutterwave transfer identity does not match the payout reference");
  }

  const withdrawal = byTransferId ?? byReference;

  if (!withdrawal) {
    await db.collection("payout_webhook_events").updateOne(
      { eventId: input.eventId },
      { $setOnInsert: {
          eventId: input.eventId,
          provider: "FLUTTERWAVE",
          transferId: input.transferId,
          reference: input.reference,
          status: input.status,
          createdAt: new Date()
        } },
      { upsert: true }
    );
    return { ignored: true };
  }

  if (withdrawal.providerReference && String(withdrawal.providerReference) !== input.reference) {
    throw new Error("Flutterwave transfer reference does not match the withdrawal");
  }
  if (withdrawal.providerTransferId && String(withdrawal.providerTransferId) !== input.transferId) {
    throw new Error("Flutterwave transfer id does not match the withdrawal");
  }

  const expectedAmount = Math.floor(Number(withdrawal.payoutAmount));
  const actualAmount = Number(input.amount);
  const expectedCurrency = String(withdrawal.payoutCurrency ?? "").toUpperCase();
  const actualCurrency = String(input.currency ?? "").toUpperCase();
  if (!Number.isSafeInteger(expectedAmount) || expectedAmount <= 0 || !Number.isSafeInteger(actualAmount) || actualAmount <= 0 || actualAmount !== expectedAmount) {
    throw new Error("Flutterwave payout amount mismatch");
  }
  if (!expectedCurrency || actualCurrency !== expectedCurrency) {
    throw new Error("Flutterwave payout currency mismatch");
  }

  const normalized = input.status.toUpperCase();

  if (normalized === "SUCCESSFUL") {
    await db.collection("withdrawals").updateOne(
      { withdrawalId: withdrawal.withdrawalId, status: { $in: ["PROCESSING", "PENDING"] } },
      { $set: { status: "PAID", providerStatus: normalized, paidAt: new Date(), updatedAt: new Date() } }
    );
    const inserted = await db.collection("payout_webhook_events").updateOne(
      { eventId: input.eventId },
      { $setOnInsert: {
          eventId: input.eventId, provider: "FLUTTERWAVE",
          transferId: input.transferId, reference: input.reference,
          status: normalized, createdAt: new Date()
        } },
      { upsert: true }
    );
    return { status: "PAID", duplicate: inserted.upsertedCount === 0 };
  }

  const isReversal = ["REVERSED", "CANCELLED", "CANCELED"].includes(normalized);
  const isFailure = normalized === "FAILED";

  if (isFailure || isReversal) {
    const session = db.client?.startSession();
    if (!session) throw new Error("MongoDB session unavailable");
    let resultStatus = isReversal ? "REVERSED" : "FAILED";
    let duplicateEvent = false;

    try {
      await session.withTransaction(async () => {
        const eventGate = await db.collection("payout_webhook_events").updateOne(
          { eventId: input.eventId },
          { $setOnInsert: {
              eventId: input.eventId, provider: "FLUTTERWAVE",
              transferId: input.transferId, reference: input.reference,
              status: normalized, createdAt: new Date()
            } },
          { upsert: true, session }
        );
        if (eventGate.upsertedCount === 0) {
          duplicateEvent = true;
          return;
        }

        const allowedStatuses = isReversal
          ? { $in: ["PROCESSING", "PENDING", "PAID"] }
          : { $in: ["PROCESSING", "PENDING"] };

        const current = await db.collection("withdrawals").findOne(
          { withdrawalId: withdrawal.withdrawalId, status: allowedStatuses },
          { session }
        );
        if (!current) return;

        await db.collection("wallets").updateOne(
          { userId: String(current.userId) },
          { $inc: { cashBalanceUsd: Number(current.amountUsd) }, $set: { updatedAt: new Date() } },
          { session }
        );

        await db.collection("wallet_ledger").insertOne({
          transactionId: "PAYOUT_REFUND:" + String(current.withdrawalId),
          userId: String(current.userId),
          type: "PAYOUT_REFUND",
          coinsDelta: 0,
          diamondsDelta: 0,
          cashDeltaUsd: Number(current.amountUsd),
          referenceId: String(current.withdrawalId),
          provider: "FLUTTERWAVE",
          reason: isReversal ? "provider_reversal" : "provider_failure",
          createdAt: new Date()
        }, { session });

        await db.collection("withdrawals").updateOne(
          { withdrawalId: current.withdrawalId },
          { $set: {
              status: resultStatus,
              providerStatus: normalized,
              failureReason: input.rawMessage ?? (isReversal ? "Flutterwave transfer reversed" : "Flutterwave transfer failed"),
              walletRefundedAt: new Date(),
              updatedAt: new Date()
            } },
          { session }
        );
      });
    } finally {
      await session.endSession();
    }

    return { status: resultStatus, duplicate: duplicateEvent };
  }

  const inserted = await db.collection("payout_webhook_events").updateOne(
    { eventId: input.eventId },
    { $setOnInsert: {
        eventId: input.eventId, provider: "FLUTTERWAVE",
        transferId: input.transferId, reference: input.reference,
        status: normalized, createdAt: new Date()
      } },
    { upsert: true }
  );
  return { status: "PROCESSING", duplicate: inserted.upsertedCount === 0 };
}

export async function refreshFlutterwaveWithdrawal(db: Db, withdrawalId: string) {
  const withdrawal = await db.collection("withdrawals").findOne({ withdrawalId, provider: "FLUTTERWAVE" });
  if (!withdrawal?.providerTransferId) throw new Error("Flutterwave transfer is not available for this withdrawal");
  const transfer = await getFlutterwaveTransfer(String(withdrawal.providerTransferId));
  return reconcileFlutterwaveTransfer(db, {
    eventId: "poll:" + String(transfer.id) + ":" + String(transfer.status),
    transferId: String(transfer.id),
    reference: String(transfer.reference),
    status: String(transfer.status),
    amount: Number(transfer.amount),
    currency: String(transfer.currency),
    rawMessage: transfer.complete_message
  });
}

export async function reconcilePaystackTransfer(db: Db, input: {
  eventId: string;
  event: "transfer.success" | "transfer.failed" | "transfer.reversed";
  reference: string;
  amount: number;
  currency: string;
  rawStatus?: string;
}) {
  const withdrawal = await db.collection("withdrawals").findOne({ providerReference: input.reference });
  if (!withdrawal) {
    await db.collection("payout_webhook_events").updateOne(
      { eventId: input.eventId },
      { $setOnInsert: {
          eventId: input.eventId, provider: "PAYSTACK",
          event: input.event, reference: input.reference,
          status: input.rawStatus ?? input.event, createdAt: new Date()
        } },
      { upsert: true }
    );
    return { ignored: true };
  }

  const expectedAmount = Math.round(Number(withdrawal.payoutAmount) * 100);
  const actualAmount = Number(input.amount);
  if (!Number.isSafeInteger(expectedAmount) || expectedAmount <= 0 || !Number.isSafeInteger(actualAmount) || actualAmount <= 0 || actualAmount !== expectedAmount) {
    throw new Error("Paystack payout amount mismatch");
  }
  const expectedCurrency = String(withdrawal.payoutCurrency ?? "").toUpperCase();
  if (String(input.currency ?? "").toUpperCase() !== expectedCurrency || expectedCurrency !== "GHS") {
    throw new Error("Paystack payout currency mismatch");
  }

  if (input.event === "transfer.success") {
    await db.collection("withdrawals").updateOne(
      { withdrawalId: withdrawal.withdrawalId, status: { $in: ["PROCESSING", "PENDING"] } },
      { $set: { status: "PAID", providerStatus: input.rawStatus ?? "success", paidAt: new Date(), updatedAt: new Date() } }
    );
    const inserted = await db.collection("payout_webhook_events").updateOne(
      { eventId: input.eventId },
      { $setOnInsert: {
          eventId: input.eventId, provider: "PAYSTACK",
          event: input.event, reference: input.reference,
          status: input.rawStatus ?? input.event, createdAt: new Date()
        } },
      { upsert: true }
    );
    return { status: "PAID", duplicate: inserted.upsertedCount === 0 };
  }

  const isReversal = input.event === "transfer.reversed";
  const session = db.client?.startSession();
  if (!session) throw new Error("MongoDB session unavailable");
  const resultStatus = isReversal ? "REVERSED" : "FAILED";
  let duplicateEvent = false;

  try {
    await session.withTransaction(async () => {
      const eventGate = await db.collection("payout_webhook_events").updateOne(
        { eventId: input.eventId },
        { $setOnInsert: {
            eventId: input.eventId, provider: "PAYSTACK",
            event: input.event, reference: input.reference,
            status: input.rawStatus ?? input.event, createdAt: new Date()
          } },
        { upsert: true, session }
      );
      if (eventGate.upsertedCount === 0) {
        duplicateEvent = true;
        return;
      }

      const allowedStatuses = isReversal
        ? { $in: ["PROCESSING", "PENDING", "PAID"] }
        : { $in: ["PROCESSING", "PENDING"] };

      const current = await db.collection("withdrawals").findOne(
        { withdrawalId: withdrawal.withdrawalId, status: allowedStatuses }, { session }
      );
      if (!current) return;

      await db.collection("wallets").updateOne(
        { userId: String(current.userId) },
        { $inc: { cashBalanceUsd: Number(current.amountUsd) }, $set: { updatedAt: new Date() } },
        { session }
      );

      await db.collection("wallet_ledger").insertOne({
        transactionId: "PAYOUT_REFUND:" + String(current.withdrawalId),
        userId: String(current.userId),
        type: "PAYOUT_REFUND",
        coinsDelta: 0,
        diamondsDelta: 0,
        cashDeltaUsd: Number(current.amountUsd),
        referenceId: String(current.withdrawalId),
        provider: "PAYSTACK",
        reason: isReversal ? "provider_reversal" : "provider_failure",
        createdAt: new Date()
      }, { session });

      await db.collection("withdrawals").updateOne(
        { withdrawalId: current.withdrawalId },
        { $set: {
            status: resultStatus,
            providerStatus: input.rawStatus ?? input.event,
            failureReason: isReversal ? "Paystack transfer reversed" : "Paystack transfer failed",
            walletRefundedAt: new Date(),
            updatedAt: new Date()
          } },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  return { status: resultStatus, duplicate: duplicateEvent };
}
