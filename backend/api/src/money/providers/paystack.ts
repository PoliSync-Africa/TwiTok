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

export function verifyPaystackWebhookSignature(rawBody: string, signature: string | undefined) {
  if (!signature) return false;
  const digest = crypto.createHmac("sha512", key()).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}
