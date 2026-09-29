import crypto from "node:crypto";

type FlutterwaveResponse<T> = { status: string; message: string; data: T };

const baseUrl = "https://api.flutterwave.com/v3";

function key() {
  const value = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!value) throw new Error("FLUTTERWAVE_SECRET_KEY is not configured");
  return value;
}

async function flutterwave<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(baseUrl + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + key(),
      "Content-Type": "application/json",
      accept: "application/json",
      ...(init.headers ?? {})
    }
  });
  const body = await response.json() as FlutterwaveResponse<T>;
  if (!response.ok || body.status !== "success") throw new Error(body.message || "Flutterwave request failed");
  return body.data;
}

export async function initializeFlutterwaveCheckout(input: {
  email: string;
  phoneNumber?: string;
  name?: string;
  amount: number;
  currency: string;
  reference: string;
  redirectUrl?: string;
  paymentOptions?: string;
  userId: string;
  sku: string;
  coins: number;
}) {
  return flutterwave<{ link: string }>("/payments", {
    method: "POST",
    body: JSON.stringify({
      amount: Math.round(input.amount * 100) / 100,
      currency: input.currency,
      tx_ref: input.reference,
      redirect_url: input.redirectUrl,
      customer: {
        email: input.email,
        phone_number: input.phoneNumber,
        name: input.name
      },
      payment_options: input.paymentOptions,
      customizations: { title: "TwiTok Coins", description: "Purchase TwiTok Coins" },
      meta: { userId: input.userId, sku: input.sku, coins: input.coins, purpose: "TWITOK_COIN_PURCHASE" }
    })
  });
}

export async function verifyFlutterwaveTransaction(transactionId: string) {
  return flutterwave<{
    id: number;
    tx_ref: string;
    status: string;
    amount: number;
    charged_amount?: number;
    amount_settled?: number;
    currency: string;
    customer?: { email?: string };
  }>("/transactions/" + encodeURIComponent(transactionId) + "/verify");
}

export function verifyFlutterwaveWebhookSignature(rawBody: string, signature: string | undefined) {
  const secret = process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH;
  if (!secret || !signature) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}


export async function initiateFlutterwaveTransfer(input: {
  amount: number;
  currency: string;
  countryCode: string;
  type: "BANK" | "MOBILE_MONEY";
  accountNumber: string;
  bankCode: string;
  branchCode?: string;
  beneficiaryName: string;
  reference: string;
  callbackUrl?: string;
}) {
  const amount = Math.floor(input.amount);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Flutterwave transfer amount must be a positive integer");
  if (!input.accountNumber || !input.bankCode || !input.beneficiaryName) throw new Error("Flutterwave payout destination is incomplete");
  if (input.type === "BANK" && input.countryCode === "GH" && !input.branchCode) {
    throw new Error("Ghana Flutterwave bank payouts require a destination branch code");
  }

  const meta = input.type === "MOBILE_MONEY"
    ? {
        sender: process.env.TWITOK_FLUTTERWAVE_SENDER_NAME ?? "TwiTok",
        sender_country: process.env.TWITOK_FLUTTERWAVE_SENDER_COUNTRY ?? "GH",
        mobile_number: process.env.TWITOK_FLUTTERWAVE_SENDER_MOBILE ?? ""
      }
    : undefined;

  return flutterwave<{
    id: number;
    account_number: string;
    bank_code: string;
    full_name: string;
    currency: string;
    amount: number;
    fee?: number;
    status: string;
    reference: string;
    complete_message?: string;
    bank_name?: string;
  }>("/transfers", {
    method: "POST",
    body: JSON.stringify({
      account_bank: input.bankCode,
      account_number: input.accountNumber,
      ...(input.type === "BANK" && input.countryCode === "GH" && input.branchCode ? { destination_branch_code: input.branchCode } : {}),
      amount,
      currency: input.currency,
      beneficiary_name: input.beneficiaryName,
      reference: input.reference,
      callback_url: input.callbackUrl,
      narration: "TwiTok creator payout",
      meta
    })
  });
}

export async function getFlutterwaveTransfer(transferId: string | number) {
  return flutterwave<{
    id: number;
    account_number: string;
    bank_code: string;
    full_name: string;
    currency: string;
    amount: number;
    fee?: number;
    status: string;
    reference: string;
    complete_message?: string;
  }>("/transfers/" + encodeURIComponent(String(transferId)));
}

export async function listFlutterwaveBanks(countryCode: string) {
  return flutterwave<Array<{ id: number; code: string; name: string; provider_type?: string }>>(
    "/banks/" + encodeURIComponent(countryCode.toUpperCase()) + "?include_provider_type=1"
  );
}
