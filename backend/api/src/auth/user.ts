import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const USER_SECRET = () => {
  const secret = process.env.TWITOK_USER_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("TWITOK_USER_SESSION_SECRET must be configured with at least 32 characters");
  return secret;
};

export type UserToken = { sub: string; role: "USER"; username: string; sv?: number };

export function issueUserToken(user: { _id: string; username: string; sessionVersion?: number }) {
  return jwt.sign({ sub: user._id, role: "USER", username: user.username, sv: Number(user.sessionVersion ?? 0) }, USER_SECRET(), { expiresIn: "24h", issuer: "twitok" });
}

export function verifyUserToken(token: string): UserToken {
  const decoded = jwt.verify(token, USER_SECRET(), { issuer: "twitok" }) as UserToken;
  if (decoded.role !== "USER" || !decoded.sub || !ObjectId.isValid(decoded.sub)) throw new Error("Invalid user token");
  return decoded;
}

export async function ensureUserIndexes(db: Db) {
  await Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true, sparse: true }),
    db.collection("users").createIndex({ phone: 1 }, { unique: true, sparse: true }),
    db.collection("users").createIndex({ username: 1 }, { unique: true }),
    db.collection("users").createIndex({ createdAt: -1 })
  ]);
}

export async function createUser(db: Db, input: { username?: string; password: string; email?: string; phone?: string; dateOfBirth: string; countryCode: string }) {
  const generatedUsername = `user_${new ObjectId().toHexString().slice(-12)}`;
  const username = (input.username?.trim().toLowerCase() || generatedUsername);
  if (!/^[a-z0-9._]{3,24}$/.test(username)) throw new Error("Username must be 3-24 characters and use letters, numbers, dots or underscores");
  if (input.password.length < 12) throw new Error("Password must contain at least 12 characters");
  const dob = new Date(input.dateOfBirth);
  if (Number.isNaN(dob.getTime()) || dob >= new Date()) throw new Error("Invalid date of birth");
  if (!input.email && !input.phone) throw new Error("Email or phone is required");
  const now = new Date();
  const user = { sessionVersion: 0, username, nickname: username, email: input.email?.trim().toLowerCase(), phone: input.phone?.trim(), dateOfBirth: dob, countryCode: input.countryCode.trim().toUpperCase(), accountType: "PERSONAL", monetizationEnabled: false, isPrivate: false, profileSetupComplete: Boolean(input.username?.trim()), status: "ACTIVE", emailVerified: false, phoneVerified: false, createdAt: now, updatedAt: now };
  const result = await db.collection("users").insertOne({ ...user, passwordHash: await bcrypt.hash(input.password, 12) });
  return { ...user, _id: result.insertedId.toHexString() };
}

export async function authenticateUser(db: Db, identifier: string, password: string) {
  const normalized = identifier.trim().toLowerCase();
  const user = await db.collection("users").findOne({ $or: [{ email: normalized }, { username: normalized }, { phone: identifier.trim() }] });
  if (!user || user.status !== "ACTIVE") throw new Error("Invalid login credentials");
  if (!(await bcrypt.compare(password, user.passwordHash))) throw new Error("Invalid login credentials");
  return { _id: user._id.toHexString(), username: user.username, sessionVersion: Number(user.sessionVersion ?? 0), nickname: user.nickname, email: user.email, countryCode: user.countryCode, accountType: user.accountType, monetizationEnabled: user.monetizationEnabled === true, isVerified: user.isVerified === true, verificationType: user.verificationType ?? null, isPrivate: user.isPrivate, profileSetupComplete: user.profileSetupComplete !== false };
}