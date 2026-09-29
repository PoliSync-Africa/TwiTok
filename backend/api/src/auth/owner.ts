import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";

export interface OwnerAccount {
  email: string;
  displayName: string;
  role: "OWNER";
  passwordHash: string;
  isActive: boolean;
  mfaRequired: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type StoredOwnerAccount = OwnerAccount & { _id: ObjectId };

const JWT_SECRET = () => {
  const secret = process.env.OWNER_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("OWNER_SESSION_SECRET must be configured with at least 32 characters");
  return secret;
};

export async function ensureOwnerAccount(db: Db) {
  const email = process.env.TWITOK_OWNER_EMAIL?.trim().toLowerCase();
  const displayName = process.env.TWITOK_OWNER_NAME?.trim() || "TwiTok Owner";
  const passwordHash = process.env.TWITOK_OWNER_PASSWORD_HASH;
  if (!email || !passwordHash) return;

  const collection = db.collection<OwnerAccount>("owner_accounts");
  const existing = await collection.findOne({ email });

  if (!existing) {
    await collection.insertOne({
      email,
      displayName,
      role: "OWNER",
      passwordHash,
      isActive: true,
      mfaRequired: process.env.TWITOK_OWNER_MFA_ENABLED === "true",
      createdAt: new Date(),
      updatedAt: new Date()
    });
  } else if (process.env.TWITOK_OWNER_MFA_ENABLED === "true" && !existing.mfaRequired) {
    await collection.updateOne(
      { _id: existing._id },
      { $set: { mfaRequired: true, updatedAt: new Date() } }
    );
  }
}

export async function verifyOwner(db: Db, email: string, password: string) {
  const collection = db.collection<OwnerAccount>("owner_accounts");
  const owner = await collection.findOne({
    email: email.trim().toLowerCase(),
    role: "OWNER",
    isActive: true
  });

  if (!owner || !(await bcrypt.compare(password, owner.passwordHash))) return null;
  return owner as StoredOwnerAccount;
}

export function createOwnerToken(owner: StoredOwnerAccount, mfaVerified = false) {
  return jwt.sign(
    {
      sub: String(owner._id),
      role: "OWNER",
      email: owner.email,
      mfaVerified
    },
    JWT_SECRET(),
    { expiresIn: "30m", issuer: "twitok-admin" }
  );
}

export function verifyOwnerToken(token: string) {
  return jwt.verify(token, JWT_SECRET(), { issuer: "twitok-admin" }) as {
    sub: string;
    role: "OWNER";
    email: string;
    mfaVerified?: boolean;
  };
}
