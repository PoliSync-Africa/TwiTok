import crypto from "node:crypto";

type PaystackRecipient = { recipient_code: string };
type PaystackResponse<T> = { status: boolean; message: string; data: T };

const baseUrl = "https://api.paystack.co";

function key() {
  const value = process.env.PAYSTACK_SECRET_KEY;
  if (!value) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  return value;
}

async function paystack<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(baseUrl + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + key(),
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const body = await response.json() as PaystackResponse<T>;
  if (!response.ok || !body.status) throw new Error(body.message || "Paystack request failed");
  return body.data;
}

export async function listGhanaPayoutBanks(type: "bank" | "mobile_money" = "bank") {
  return paystack<Array<{ name: string; code: string; active: boolean; type: string }>>(
    "/bank?currency=GHS&type=" + encodeURIComponent(type)
  );
}

export async function createGhanaRecipient(input: {
  name: string;
  accountNumber: string;
  bankCode: string;
  type: "ghipss" | "mobile_money";
}) {
  return paystack<PaystackRecipient>("/transferrecipient", {
    method: "POST",
    body: JSON.stringify({
      type: input.type,
      name: input.name,
      account_number: input.accountNumber,
      bank_code: input.bankCode,
      currency: "GHS"
    })
  });
}

export async function initiateGhanaTransfer(input: {
  amountGhs: number;
  recipientCode: string;
  reference: string;
  reason: string;
}) {
  return paystack<{ reference: string; status: string }>("/transfer", {
    method: "POST",
    body: JSON.stringify({
      source: "balance",
      amount: Math.round(input.amountGhs * 100),
      recipient: input.recipientCode,
      reason: input.reason,
      reference: input.reference
    })
  });
}

export function verifyPaystackWebhookSignature(rawBody: string | Buffer, signature: string | undefined) {
  if (!signature) return false;
  const normalized = signature.trim();
  // Paystack signs the exact raw request body with HMAC-SHA512 and sends the
  // digest as 128 hexadecimal characters. Reject malformed encodings before
  // converting them to bytes so malformed input can never reach timingSafeEqual.
  if (!/^[0-9a-fA-F]{128}$/.test(normalized)) return false;
  const expected = crypto.createHmac("sha512", key()).update(rawBody).digest();
  const provided = Buffer.from(normalized, "hex");
  return crypto.timingSafeEqual(expected, provided);
}


export async function initializeCoinPurchase(input: {
  email: string;
  amountGhs: number;
  reference: string;
  userId: string;
  sku: string;
  coins: number;
  callbackUrl?: string;
}) {
  return paystack<{ authorization_url: string; access_code: string; reference: string }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: Math.round(input.amountGhs * 100),
      currency: "GHS",
      reference: input.reference,
      channels: ["card", "bank", "mobile_money", "bank_transfer", "ussd"],
      callback_url: input.callbackUrl,
      metadata: { userId: input.userId, sku: input.sku, coins: input.coins, amountGhs: input.amountGhs, purpose: "TWITOK_COIN_PURCHASE" }
    })
  });
}

export async function verifyPaystackTransaction(reference: string) {
  return paystack<{ reference: string; status: string; amount: number; currency: string; metadata?: Record<string, unknown> }>(
    "/transaction/verify/" + encodeURIComponent(reference)
  );
}
