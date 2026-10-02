import type { Db } from "mongodb";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { ObjectId } from "mongodb";

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

async function deliverOtp(channel: OtpChannel, destination: string, code: string) {
  const webhook = process.env.TWITOK_OTP_DELIVERY_WEBHOOK_URL?.trim();
  const allowConsole = process.env.NODE_ENV !== "production" && process.env.TWITOK_OTP_ALLOW_CONSOLE === "true";

  if (!webhook) {
    if (allowConsole) {
      console.info(`[TwiTok OTP] ${channel} ${destination}: ${code}`);
      return;
    }
    throw new Error("OTP delivery is not configured");
  }

  let url: URL;
  try {
    url = new URL(webhook);
  } catch {
    throw new Error("TWITOK_OTP_DELIVERY_WEBHOOK_URL is invalid");
  }
  if (url.protocol !== "https:") throw new Error("OTP delivery webhook must use HTTPS");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const secret = process.env.TWITOK_OTP_DELIVERY_WEBHOOK_SECRET?.trim();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { Authorization: `Bearer ${secret}` } : {})
      },
      body: JSON.stringify({
        channel,
        destination,
        code,
        expiresInSeconds: OTP_TTL_MS / 1000,
        template: "TWITOK_VERIFICATION"
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error("OTP delivery provider rejected the request");
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("OTP delivery provider timed out");
    throw error instanceof Error ? error : new Error("OTP delivery failed");
  } finally {
    clearTimeout(timeout);
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
    { projection: { email: 1, phone: 1, emailVerified: 1, phoneVerified: 1 } }
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

  await deliverOtp(channel, destination, code);

  await db.collection("auth_otps").updateMany(
    { userId, channel, purpose, consumedAt: { $exists: false }, expiresAt: { $gt: now } },
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

export async function verifyOtp(db: Db, userId: string, channel: OtpChannel, code: string, purpose: OtpPurpose = "VERIFICATION") {
  if (!ObjectId.isValid(userId)) throw new Error("Invalid user account");
  if (!/^\d{6}$/.test(String(code))) throw new Error("Enter the 6-digit verification code");

  const now = new Date();
  const otp = await db.collection("auth_otps").findOne(
    { userId, channel, purpose, consumedAt: { $exists: false }, expiresAt: { $gt: now } },
    { sort: { createdAt: -1 } }
  );

  if (!otp) throw new Error("The verification code is invalid or expired");
  const attempts = Number(otp.attempts ?? 0);
  if (attempts >= OTP_MAX_ATTEMPTS) {
    await db.collection("auth_otps").updateOne({ _id: otp._id }, { $set: { consumedAt: now, updatedAt: now } });
    throw new Error("Too many incorrect attempts. Request a new code");
  }

  const user = await db.collection("users").findOne(
    { _id: new ObjectId(userId), status: "ACTIVE" },
    { projection: { email: 1, phone: 1 } }
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
    { _id: otp._id, purpose, consumedAt: { $exists: false }, expiresAt: { $gt: now } },
    { $set: { consumedAt: now, updatedAt: now } },
    { returnDocument: "after" }
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
