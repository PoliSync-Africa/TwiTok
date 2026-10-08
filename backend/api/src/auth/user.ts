import type { Collection, Db, Document } from "mongodb";
import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { normalizeInternationalPhone } from "./phone.js";

const USER_SECRET = () => {
  const secret = process.env.TWITOK_USER_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("TWITOK_USER_SESSION_SECRET must be configured with at least 32 characters");
  return secret;
};

export type UserToken = { sub: string; role: "USER"; username: string; sv: number; typ: "user_session"; iat?: number; exp?: number };

export function issueUserToken(user: { _id: string; username?: string | null; sessionVersion?: number }) {
  return jwt.sign(
    { sub: user._id, role: "USER", username: user.username ?? "", sv: Number(user.sessionVersion ?? 0), typ: "user_session" },
    USER_SECRET(),
    { expiresIn: "24h", issuer: "twitok", audience: "twitok-api" }
  );
}

export function verifyUserToken(token: string): UserToken {
  const decoded = jwt.verify(token, USER_SECRET(), { issuer: "twitok", audience: "twitok-api", algorithms: ["HS256"] }) as UserToken;
  if (decoded.typ !== "user_session" || decoded.role !== "USER" || !decoded.sub || !ObjectId.isValid(decoded.sub) || !Number.isInteger(decoded.sv) || decoded.sv < 0) throw new Error("Invalid user token");
  return decoded;
}

async function dropLegacyUniqueIndex(collection: Collection<Document>, name: string) {
  try { await collection.dropIndex(name); }
  catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/index not found|does not exist|not found/i.test(message)) throw error;
  }
}

export async function ensureUserIndexes(db: Db) {
  const users = db.collection("users");
  await Promise.all([dropLegacyUniqueIndex(users, "email_1"), dropLegacyUniqueIndex(users, "phone_1"), dropLegacyUniqueIndex(users, "username_1"), dropLegacyUniqueIndex(users, "createdAt_-1")]);
  await Promise.all([
    users.createIndex({ email: 1 }, { name: "users_email_unique", unique: true, partialFilterExpression: { email: { $type: "string" } } }),
    users.createIndex({ phone: 1 }, { name: "users_phone_unique", unique: true, partialFilterExpression: { phone: { $type: "string" } } }),
    users.createIndex({ username: 1 }, { name: "users_username_unique", unique: true, partialFilterExpression: { username: { $type: "string" } } }),
    users.createIndex({ createdAt: -1 }, { name: "users_createdAt_desc" })
  ]);
}

export async function createUser(db: Db, input: { username?: string; password: string; email?: string; phone?: string; dateOfBirth: string; countryCode: string }) {
  const usernameInput = input.username?.trim().toLowerCase();
  const username = usernameInput || undefined;
  if (username && (!/^[a-z0-9._]{3,24}$/.test(username) || username.endsWith("."))) throw new Error("Username must be 3-24 characters and use letters, numbers, dots or underscores");
  if (input.password.length < 8) throw new Error("Password must contain at least 8 characters");

  const email = input.email?.trim().toLowerCase() || undefined;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address");

  const countryCode = String(input.countryCode ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error("A valid two-letter country code is required");
  const phone = normalizeInternationalPhone(input.phone, countryCode);
  if (!email && !phone) throw new Error("Email address or phone number is required");
  if (email && phone) throw new Error("Use either email or phone number for sign up");

  const dob = new Date(input.dateOfBirth);
  if (Number.isNaN(dob.getTime()) || dob >= new Date()) throw new Error("Invalid date of birth");

  const now = new Date();
  const user = {
    sessionVersion: 0,
    ...(username ? { username } : {}),
    ...(username ? { nickname: username } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    dateOfBirth: dob,
    countryCode,
    accountType: "PERSONAL",
    monetizationEnabled: false,
    isPrivate: false,
    profileSetupComplete: false,
    status: "ACTIVE",
    emailVerified: false,
    phoneVerified: false,
    createdAt: now,
    updatedAt: now
  };

  const result = await db.collection("users").insertOne({ ...user, passwordHash: await bcrypt.hash(input.password, 12) });
  return { ...user, _id: result.insertedId.toHexString(), username: username ?? null, profileSetupComplete: false };
}

export async function authenticateUser(db: Db, identifier: string, password: string, countryCode?: string) {
  const rawIdentifier = identifier.trim();
  const normalized = rawIdentifier.toLowerCase();
  const looksLikePhone = /^[+0-9][0-9\s().-]{6,20}$/.test(rawIdentifier);
  const phone = looksLikePhone ? normalizeInternationalPhone(rawIdentifier, countryCode) : undefined;

  const user = await db.collection("users").findOne({
    $or: [{ email: normalized }, { username: normalized }, ...(phone ? [{ phone }] : [])]
  });

  if (!user || user.status !== "ACTIVE") throw new Error("Invalid login credentials");
  if (!(await bcrypt.compare(password, user.passwordHash))) throw new Error("Invalid login credentials");

  return {
    _id: user._id.toHexString(),
    username: user.username ?? null,
    sessionVersion: Number(user.sessionVersion ?? 0),
    nickname: user.nickname ?? null,
    email: user.email ?? null,
    phone: user.phone ?? null,
    countryCode: user.countryCode,
    accountType: user.accountType,
    monetizationEnabled: user.monetizationEnabled === true,
    isVerified: user.isVerified === true,
    emailVerified: user.emailVerified === true,
    phoneVerified: user.phoneVerified === true,
    verificationType: user.verificationType ?? null,
    isPrivate: user.isPrivate === true,
    profileSetupComplete: user.profileSetupComplete === true
  };
}
