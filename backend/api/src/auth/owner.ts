import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";

export interface OwnerAccount {
  _id?: ObjectId | string;
  email: string; displayName: string; role: "OWNER"; passwordHash: string;
  isActive: boolean; mfaRequired: boolean; createdAt: Date; updatedAt: Date;
}
const JWT_SECRET = () => {
  const secret = process.env.OWNER_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("OWNER_SESSION_SECRET must be configured with at least 32 characters");
  return secret;
};
export async function ensureOwnerAccount(db: Db) {
  const email=process.env.TWITOK_OWNER_EMAIL?.trim().toLowerCase(), displayName=process.env.TWITOK_OWNER_NAME?.trim()||"TwiTok Owner", passwordHash=process.env.TWITOK_OWNER_PASSWORD_HASH;
  if (!email || !passwordHash) return;
  const existing=await db.collection<OwnerAccount>("owner_accounts").findOne({email});
  if (!existing) await db.collection<OwnerAccount>("owner_accounts").insertOne({email,displayName,role:"OWNER",passwordHash,isActive:true,mfaRequired:process.env.TWITOK_OWNER_MFA_ENABLED==="true",createdAt:new Date(),updatedAt:new Date()});
  else if (process.env.TWITOK_OWNER_MFA_ENABLED === "true" && !existing.mfaRequired) await db.collection<OwnerAccount>("owner_accounts").updateOne({ _id: existing._id }, { $set: { mfaRequired: true, updatedAt: new Date() } });
}
export async function verifyOwner(db: Db,email:string,password:string) {
  const owner=await db.collection<OwnerAccount>("owner_accounts").findOne({email:email.trim().toLowerCase(),role:"OWNER",isActive:true});
  if (!owner || !(await bcrypt.compare(password,owner.passwordHash))) return null;
  return owner;
}
export function createOwnerToken(owner: OwnerAccount, mfaVerified=false) {
  return jwt.sign({sub:String(owner._id),role:"OWNER",email:owner.email,mfaVerified},JWT_SECRET(),{expiresIn:"30m",issuer:"twitok-admin"});
}
export function verifyOwnerToken(token:string) {
  return jwt.verify(token,JWT_SECRET(),{issuer:"twitok-admin"}) as {sub:string;role:"OWNER";email:string;mfaVerified?:boolean};
}