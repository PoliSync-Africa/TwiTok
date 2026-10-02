import type { ClientSession, Db } from "mongodb";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { ObjectId } from "mongodb";
import { sendEmailOtp } from "./email.js";

export type OtpChannel = "email" | "phone";
export type OtpPurpose = "VERIFICATION" | "PASSWORD_RESET";

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_SENDS_PER_HOUR = 5;

function getPepper() {
  const pepper = process.env.TWITOK_OTP_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error("TWITOK_OTP_PEPPER must be configured with at least 32 characters");
  return pepper;
}

function hashCode(userId: string, channel: OtpChannel, destination: string, code: string, purpose: OtpPurpose = "VERIFICATION") {
  return createHmac("sha256", getPepper())
    .update(`${userId}:${purpose}:${channel}:${destination}:${code}`)
    .digest("hex");
}

function normalizeDestination(channel: OtpChannel, value: string) {
  const normalized = String(value ?? "").trim();
  if (channel === "email") return normalized.toLowerCase();
  const digits = normalized.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 20) throw new Error("Invalid phone number");
  return digits;
}

function isValidEmail(value: string) {
  const parts = value.split("@");
  if (value.length > 254 || parts.length !== 2) return false;
  const [local, domain] = parts;
  return Boolean(
    local &&
    local.length <= 64 &&
    domain &&
    domain.length <= 253 &&
    domain.includes(".") &&
    !value.includes(" ") &&
    !value.includes("\t") &&
    !value.includes("\n") &&
    !value.includes("\r")
  );
}

async function deliverOtp(channel: OtpChannel, destination: string, code: string, purpose: OtpPurpose, expiresInSeconds: number, firstName?: string) {
  if (channel === "email") {
    await sendEmailOtp({
      to: destination,
      code,
      purpose: purpose === "PASSWORD_RESET" ? "PASSWORD_RESET" : "VERIFICATION",
      expiresInSeconds,
      firstName
    });
    return;
  }

  const apiKey = process.env.ARKESEL_API_KEY?.trim();
  const senderId = process.env.ARKESEL_SENDER_ID?.trim() || "TwiTok";
  if (!apiKey) throw new Error("ARKESEL_API_KEY must be configured");

  const response = await fetch("https://sms.arkesel.com/api/otp/generate", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      expiry: Math.min(10, Math.max(1, Math.ceil(expiresInSeconds / 60))),
      length: 6,
      medium: "sms",
      message: purpose === "PASSWORD_RESET"
        ? `Hi ${firstName || "there"}, your TwiTok password reset code is %otp_code%. It expires soon.`
        : `Hi ${firstName || "there"}, your TwiTok verification code is %otp_code%. It expires soon.`,
      number: destination,
      sender_id: senderId,
      type: "numeric"
    }),
    signal: AbortSignal.timeout(8000)
  });

  let payload: { code?: string; message?: string };
  try {
    payload = await response.json() as { code?: string; message?: string };
  } catch {
    throw new Error("Arkesel returned an invalid response");
  }

  if (!response.ok || payload.code !== "1000") {
    throw new Error("SMS OTP delivery failed");
  }
}

export async function initializeOtpIndexes(db: Db) {
  await Promise.all([
    db.collection("auth_otps").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("auth_otps").createIndex({ userId: 1, channel: 1, createdAt: -1 }),
    db.collection("auth_otps").createIndex({ userId: 1, channel: 1, consumedAt: 1, expiresAt: 1 }),
    db.collection("auth_otps").createIndex({ destination: 1, createdAt: -1 })
  ]);
}

export async function sendOtp(db: Db, userId: string, channel: OtpChannel, requestedDestination?: string, purpose: OtpPurpose = "VERIFICATION") {
  if (!ObjectId.isValid(userId)) throw new Error("Invalid user account");
  const user = await db.collection("users").findOne(
    { _id: new ObjectId(userId), status: "ACTIVE" },
    { projection: { firstName: 1, email: 1, phone: 1, emailVerified: 1, phoneVerified: 1 } }
  );
  if (!user) throw new Error("Account not found");

  const destination = normalizeDestination(channel, requestedDestination ?? (channel === "email" ? user.email ?? "" : user.phone ?? ""));
  if (channel === "email" && !isValidEmail(destination)) throw new Error("A valid email address is required");
  if (channel === "phone" && destination !== normalizeDestination(channel, user.phone ?? "")) throw new Error("Phone number does not match the account");
  if (channel === "email" && destination !== normalizeDestination(channel, user.email ?? "")) throw new Error("Email address does not match the account");

  const verifiedField = channel === "email" ? "emailVerified" : "phoneVerified";
  if (purpose === "VERIFICATION" && user[verifiedField] === true) throw new Error(`${channel === "email" ? "Email" : "Phone"} is already verified`);

  const now = new Date();
  const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
  const recent = await db.collection("auth_otps").find(
    { userId, channel, purpose, createdAt: { $gte: lastHour } },
    { projection: { createdAt: 1, expiresAt: 1, attempts: 1 }, sort: { createdAt: -1 }, limit: OTP_MAX_SENDS_PER_HOUR }
  ).toArray();

  if (recent.length >= OTP_MAX_SENDS_PER_HOUR) throw new Error("Too many OTP requests. Please try again later");
  const latest = recent[0];
  if (latest) {
    const elapsed = now.getTime() - new Date(latest.createdAt).getTime();
    if (elapsed < OTP_RESEND_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
      throw new Error(`Please wait ${retryAfterSeconds} seconds before requesting another code`);
    }
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
  const codeHash = hashCode(userId, channel, destination, code, purpose);

  await deliverOtp(channel, destination, code, purpose, OTP_TTL_MS / 1000, user.firstName);

  await db.collection("auth_otps").updateMany(
    { userId, channel, purpose, destination, consumedAt: { $exists: false }, expiresAt: { $gt: now } },
    { $set: { consumedAt: now, updatedAt: now } }
  );

  await db.collection("auth_otps").insertOne({
    userId,
    channel,
    purpose,
    destination,
    codeHash,
    attempts: 0,
    createdAt: now,
    expiresAt,
    updatedAt: now
  });

  return { channel, expiresAt, retryAfterSeconds: Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000) };
}

export async function verifyOtp(db: Db, userId: string, channel: OtpChannel, code: string, purpose: OtpPurpose = "VERIFICATION", session?: ClientSession) {
  if (!ObjectId.isValid(userId)) throw new Error("Invalid user account");
  if (!/^\d{6}$/.test(String(code))) throw new Error("Enter the 6-digit verification code");

  const now = new Date();
  const otp = await db.collection("auth_otps").findOne(
    { userId, channel, purpose, consumedAt: { $exists: false }, expiresAt: { $gt: now } },
    { sort: { createdAt: -1 }, ...(session ? { session } : {}) }
  );

  if (!otp) throw new Error("The verification code is invalid or expired");
  const attempts = Number(otp.attempts ?? 0);
  if (attempts >= OTP_MAX_ATTEMPTS) {
    await db.collection("auth_otps").updateOne({ _id: otp._id }, { $set: { consumedAt: now, updatedAt: now } });
    throw new Error("Too many incorrect attempts. Request a new code");
  }

  const user = await db.collection("users").findOne(
    { _id: new ObjectId(userId), status: "ACTIVE" },
    { projection: { email: 1, phone: 1 }, ...(session ? { session } : {}) }
  );
  if (!user) throw new Error("Account not found");

  const destination = channel === "email"
    ? normalizeDestination(channel, user.email ?? "")
    : normalizeDestination(channel, user.phone ?? "");
  const expectedHash = hashCode(userId, channel, destination, String(code), purpose);

  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const storedBuffer = Buffer.from(String(otp.codeHash), "hex");
  const matches = expectedBuffer.length === storedBuffer.length && timingSafeEqual(expectedBuffer, storedBuffer);

  if (!matches) {
    const nextAttempts = attempts + 1;
    await db.collection("auth_otps").updateOne(
      { _id: otp._id, purpose, consumedAt: { $exists: false } },
      { $inc: { attempts: 1 }, $set: { updatedAt: now } }
    );
    if (nextAttempts >= OTP_MAX_ATTEMPTS) {
      await db.collection("auth_otps").updateOne({ _id: otp._id, consumedAt: { $exists: false } }, { $set: { consumedAt: now, updatedAt: now } });
      throw new Error("Too many incorrect attempts. Request a new code");
    }
    throw new Error("The verification code is incorrect");
  }

  const consumed = await db.collection("auth_otps").findOneAndUpdate(
    { _id: otp._id, userId, channel, purpose, destination, consumedAt: { $exists: false }, expiresAt: { $gt: now } },
    { $set: { consumedAt: now, updatedAt: now } },
    { returnDocument: "after", ...(session ? { session } : {}) }
  );
  if (!consumed) throw new Error("The verification code has already been used");

  if (purpose === "VERIFICATION") {
    const verifiedField = channel === "email" ? "emailVerified" : "phoneVerified";
    await db.collection("users").updateOne(
      { _id: new ObjectId(userId) },
      { $set: { [verifiedField]: true, updatedAt: now } }
    );
  }

  return { verified: true, channel };
}
