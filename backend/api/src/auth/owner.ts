import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Db } from "mongodb";

export interface OwnerAccount {
  _id?: string;
  email: string;
  displayName: string;
  role: "OWNER";
  passwordHash: string;
  isActive: boolean;
  mfaRequired: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const JWT_SECRET = () => {
  const secret = process.env.OWNER_SESSION_SECRET;
  if (!secret) throw new Error("OWNER_SESSION_SECRET is not configured");
  return secret;
};

export async function ensureOwnerAccount(db: Db) {
  const email = process.env.TWITOK_OWNER_EMAIL?.trim().toLowerCase();
  const displayName = process.env.TWITOK_OWNER_NAME?.trim() || "TwiTok Owner";
  const passwordHash = process.env.TWITOK_OWNER_PASSWORD_HASH;

  if (!email || !passwordHash) return;

  const existing = await db.collection<OwnerAccount>("owner_accounts").findOne({ email });

  if (!existing) {
    await db.collection<OwnerAccount>("owner_accounts").insertOne({
      email,
      displayName,
      role: "OWNER",
      passwordHash,
      isActive: true,
      mfaRequired: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }
}

export async function verifyOwner(
  db: Db,
  email: string,
  password: string
): Promise<OwnerAccount | null> {
  const owner = await db.collection<OwnerAccount>("owner_accounts").findOne({
    email: email.trim().toLowerCase(),
    role: "OWNER",
    isActive: true
  });

  if (!owner) return null;

  const valid = await bcrypt.compare(password, owner.passwordHash);
  return valid ? owner : null;
}

export function createOwnerToken(owner: OwnerAccount) {
  return jwt.sign(
    {
      sub: String(owner._id),
      role: "OWNER",
      email: owner.email
    },
    JWT_SECRET(),
    { expiresIn: "30m", issuer: "twitok-admin" }
  );
}

export function verifyOwnerToken(token: string) {
  return jwt.verify(token, JWT_SECRET(), {
    issuer: "twitok-admin"
  }) as { sub: string; role: "OWNER"; email: string };
}
