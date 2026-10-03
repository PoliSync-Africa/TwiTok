import { createHash, randomInt } from "node:crypto";
import type { Db } from "mongodb";

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

export type VerificationChannel = "email" | "phone";

export class VerificationDeliveryError extends Error {
  constructor(message = "Verification delivery is temporarily unavailable") {
    super(message);
    this.name = "VerificationDeliveryError";
  }
}

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

function cleanEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

async function sendEmailOtp(email: string, code: string) {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
  const senderName = process.env.BREVO_SENDER_NAME?.trim() || "TwiTok";
  if (!apiKey || !senderEmail) throw new VerificationDeliveryError("Email verification is not configured");
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { accept: "application/json", "api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email }],
      subject: "Your TwiTok verification code",
      textContent: `Your TwiTok verification code is ${code}. It expires in 10 minutes. If you did not request this code, you can ignore this email.`,
      htmlContent: `<div style="font-family:Arial,sans-serif"><h2>Verify your TwiTok account</h2><p>Your verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>This code expires in 10 minutes.</p><p>If you did not request this code, you can ignore this email.</p></div>`
    })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new VerificationDeliveryError(`Email provider rejected the verification message: ${body.slice(0, 180)}`);
  }
}

async function sendPhoneOtp(phone: string) {
  const apiKey = process.env.ARKESEL_API_KEY?.trim();
  const senderId = process.env.ARKESEL_SENDER_ID?.trim() || "TwiTok";
  if (!apiKey) throw new VerificationDeliveryError("Phone verification is not configured");
  const response = await fetch("https://sms.arkesel.com/api/otp/generate", {
    method: "POST",
    headers: { accept: "application/json", "api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      expiry: 10,
      length: 6,
      medium: "sms",
      message: "Your TwiTok verification code is %otp_code%. It expires in %expiry% minutes.",
      number: phone.replace(/^\+/, ""),
      sender_id: senderId,
      type: "numeric"
    })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new VerificationDeliveryError(`SMS provider rejected the verification message: ${body.slice(0, 180)}`);
  }
  const data = await response.json().catch(() => ({}));
  if (String(data?.code ?? "") && String(data.code) !== "1000") {
    throw new VerificationDeliveryError("SMS provider could not start verification delivery");
  }
}

export async function sendAccountVerification(db: Db, userId: string, channel: VerificationChannel) {
  const users = db.collection("users");
  const user = await users.findOne({ _id: new (await import("mongodb")).ObjectId(userId) });
  if (!user) throw new Error("Account not found");

  const now = Date.now();
  if (user.verificationOtpSentAt && now - new Date(user.verificationOtpSentAt).getTime() < RESEND_COOLDOWN_MS) {
    throw new VerificationDeliveryError("Please wait before requesting another verification code");
  }

  const destination = channel === "email" ? cleanEmail(user.email) : String(user.phone ?? "").trim();
  if (!destination) throw new VerificationDeliveryError(`No ${channel} contact is available for this account`);

  const code = String(randomInt(100000, 1000000));
  if (channel === "email") await sendEmailOtp(destination, code);
  else await sendPhoneOtp(destination);

  await users.updateOne({ _id: user._id }, {
    $set: {
      verificationOtpHash: hashCode(code),
      verificationOtpChannel: channel,
      verificationOtpExpiresAt: new Date(now + CODE_TTL_MS),
      verificationOtpSentAt: new Date(now),
      verificationOtpAttempts: 0,
      updatedAt: new Date()
    }
  });
  return { channel, maskedDestination: channel === "email" ? destination.replace(/^(.{2}).*(@.*)$/, "$1***$2") : destination.replace(/\d(?=\d{4})/g, "*") };
}

export async function verifyAccountCode(db: Db, userId: string, code: string) {
  const users = db.collection("users");
  const user = await users.findOne({ _id: new (await import("mongodb")).ObjectId(userId) });
  if (!user) throw new Error("Account not found");
  const attempts = Number(user.verificationOtpAttempts ?? 0);
  if (attempts >= MAX_ATTEMPTS) throw new Error("Too many incorrect verification attempts. Request a new code.");
  if (!user.verificationOtpHash || !user.verificationOtpExpiresAt || new Date(user.verificationOtpExpiresAt).getTime() <= Date.now()) {
    throw new Error("Verification code has expired. Request a new code.");
  }
  if (hashCode(code.trim()) !== user.verificationOtpHash) {
    await users.updateOne({ _id: user._id }, { $inc: { verificationOtpAttempts: 1 }, $set: { updatedAt: new Date() } });
    throw new Error("Invalid verification code");
  }
  const channel = user.verificationOtpChannel as VerificationChannel;
  await users.updateOne({ _id: user._id }, {
    $set: {
      ...(channel === "email" ? { emailVerified: true } : { phoneVerified: true }),
      verificationStatus: "VERIFIED",
      updatedAt: new Date()
    },
    $unset: { verificationOtpHash: "", verificationOtpChannel: "", verificationOtpExpiresAt: "", verificationOtpSentAt: "", verificationOtpAttempts: "" }
  });
  return { verified: true, channel };
}
