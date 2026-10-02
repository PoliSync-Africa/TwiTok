import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const USER_SECRET = () => {
  const secret = process.env.TWITOK_USER_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("TWITOK_USER_SESSION_SECRET must be configured with at least 32 characters");
  return secret;
};

export type UserToken = { sub: string; role: "USER"; username: string; sv?: number; purpose?: "AUTH" | "VERIFICATION" };

export function issueUserToken(user: { _id: string; username: string; sessionVersion?: number }) {
  return jwt.sign(
    { sub: user._id, role: "USER", username: user.username, sv: Number(user.sessionVersion ?? 0), purpose: "AUTH" },
    USER_SECRET(),
    { expiresIn: "24h", issuer: "twitok" }
  );
}

export function issueVerificationToken(user: { _id: string; username: string; sessionVersion?: number }) {
  return jwt.sign(
    { sub: user._id, role: "USER", username: user.username, sv: Number(user.sessionVersion ?? 0), purpose: "VERIFICATION" },
    USER_SECRET(),
    { expiresIn: "15m", issuer: "twitok" }
  );
}

export function verifyUserToken(token: string): UserToken {
  const decoded = jwt.verify(token, USER_SECRET(), { issuer: "twitok" }) as UserToken;
  if (decoded.role !== "USER" || !decoded.sub || !ObjectId.isValid(decoded.sub)) throw new Error("Invalid user token");
  return decoded;
}

export function normalizePhoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function hashPhone(value: string) {
  const digits = normalizePhoneDigits(value);
  return digits ? createHash("sha256").update(digits).digest("hex") : null;
}

export function hashPhoneSuffix(value: string) {
  const digits = normalizePhoneDigits(value);
  return digits.length >= 8 ? createHash("sha256").update(digits.slice(-10)).digest("hex") : null;
}

export async function ensureUserIndexes(db: Db) {
  await Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true, sparse: true }),
    db.collection("users").createIndex({ phone: 1 }, { unique: true, sparse: true }),
    db.collection("users").createIndex({ phoneHash: 1 }, { sparse: true }),
    db.collection("users").createIndex({ phoneSuffixHash: 1 }, { sparse: true }),
    db.collection("users").createIndex({ username: 1 }, { unique: true }),
    db.collection("users").createIndex({ createdAt: -1 })
  ]);
}



function isAsciiAlphaNumeric(code: number) {
  return (code >= 48 && code <= 57) || (code >= 97 && code <= 122);
}

function isValidEmailAddress(value: string) {
  if (value.length === 0 || value.length > 254) return false;
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@") || at > 64) return false;

  const localPart = value.slice(0, at);
  const domainPart = value.slice(at + 1);
  if (!domainPart || domainPart.length > 253 || !domainPart.includes(".")) return false;

  const localAllowed = "!#$%&'*+-/=?^_\`{|}~.";
  for (const char of localPart) {
    const code = char.charCodeAt(0);
    const allowed = isAsciiAlphaNumeric(code) || localAllowed.includes(char);
    if (!allowed) return false;
  }
  if (localPart.startsWith(".") || localPart.endsWith(".") || localPart.includes("..")) return false;

  const labels = domainPart.split(".");
  for (const label of labels) {
    if (!label || label.length > 63) return false;
    const first = label.charCodeAt(0);
    const last = label.charCodeAt(label.length - 1);
    if (!isAsciiAlphaNumeric(first) || !isAsciiAlphaNumeric(last)) return false;
    for (let index = 1; index < label.length - 1; index += 1) {
      const code = label.charCodeAt(index);
      if (!isAsciiAlphaNumeric(code) && code !== 45) return false;
    }
  }
  return true;
}

export async function createUser(db: Db, input: { firstName: string; username?: string; password: string; email?: string; phone?: string; dateOfBirth: string; countryCode: string }) {
  const firstName = input.firstName.trim().replace(/\s+/g, " ");
  if (!firstName || firstName.length > 50) throw new Error("First name is required and must be 1-50 characters");
  const generatedUsername = `user_${new ObjectId().toHexString().slice(-12)}`;
  const username = (input.username?.trim().toLowerCase() || generatedUsername);
  if (!/^[a-z0-9._]{3,24}$/.test(username)) throw new Error("Username must be 3-24 characters and use letters, numbers, dots or underscores");
  if (input.password.length < 8) throw new Error("Password must contain at least 8 characters");
  const dob = new Date(input.dateOfBirth);
  if (Number.isNaN(dob.getTime()) || dob >= new Date()) throw new Error("Invalid date of birth");
  const countryCode = input.countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error("A valid two-letter country code is required");
  const ageCutoff = new Date();
  ageCutoff.setUTCFullYear(ageCutoff.getUTCFullYear() - 13);
  if (dob > ageCutoff) throw new Error("You must be at least 13 years old to create a TwiTok account");
  if (!input.email && !input.phone) throw new Error("Email or phone is required");
  const normalizedEmail = input.email?.trim().toLowerCase();
  if (normalizedEmail) {
    if (!isValidEmailAddress(normalizedEmail)) throw new Error("Invalid email address");
  }
  const normalizedPhone = input.phone?.trim();
  if (normalizedPhone && normalizedPhone.replace(/\D/g, "").length < 7) throw new Error("Invalid phone number");
  const now = new Date();
  const user = {
    sessionVersion: 0, firstName, username, nickname: username, email: normalizedEmail, phone: normalizedPhone,
    phoneHash: normalizedPhone ? hashPhone(normalizedPhone) : null,
    phoneSuffixHash: normalizedPhone ? hashPhoneSuffix(normalizedPhone) : null,
    dateOfBirth: dob, countryCode, accountType: "PERSONAL", monetizationEnabled: false, isPrivate: false,
    profileSetupComplete: Boolean(input.username?.trim()), status: "ACTIVE", emailVerified: false, phoneVerified: false,
    contactSyncEnabled: false, createdAt: now, updatedAt: now
  };
  const result = await db.collection("users").insertOne({ ...user, passwordHash: await bcrypt.hash(input.password, 12) });
  return { ...user, _id: result.insertedId.toHexString() };
}

export async function authenticateUser(db: Db, identifier: string, password: string) {
  const normalized = identifier.trim().toLowerCase();
  const user = await db.collection("users").findOne({ $or: [{ email: normalized }, { username: normalized }, { phone: identifier.trim() }] });
  if (!user || user.status !== "ACTIVE") throw new Error("Invalid login credentials");
  if (!(await bcrypt.compare(password, user.passwordHash))) throw new Error("Invalid login credentials");
  if (user.phone && (!user.phoneHash || !user.phoneSuffixHash)) {
    await db.collection("users").updateOne(
      { _id: user._id },
      { $set: { phoneHash: hashPhone(user.phone), phoneSuffixHash: hashPhoneSuffix(user.phone), updatedAt: new Date() } }
    );
  }
  return { _id: user._id.toHexString(), firstName: user.firstName, username: user.username, sessionVersion: Number(user.sessionVersion ?? 0), nickname: user.nickname, email: user.email, countryCode: user.countryCode, accountType: user.accountType, monetizationEnabled: user.monetizationEnabled === true, isVerified: user.isVerified === true, verificationType: user.verificationType ?? null, isPrivate: user.isPrivate, profileSetupComplete: user.profileSetupComplete !== false };
}
