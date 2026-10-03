import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const USER_SECRET = () => {
  const secret =
    process.env.TWITOK_USER_SESSION_SECRET?.trim() ||
    process.env.USER_SESSION_SECRET?.trim() ||
    process.env.OWNER_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("TwiTok user session secret must be configured with at least 32 characters");
  }
  return secret;
};

export type UserToken = { sub: string; role: "USER"; username?: string; sv?: number; purpose?: "AUTH" | "VERIFICATION" };

export function issueUserToken(user: { _id: string; username?: string; sessionVersion?: number }) {
  return jwt.sign(
    { sub: user._id, role: "USER", ...(user.username ? { username: user.username } : {}), sv: Number(user.sessionVersion ?? 0), purpose: "AUTH" },
    USER_SECRET(),
    { expiresIn: "24h", issuer: "twitok" }
  );
}

export function issueVerificationToken(user: { _id: string; username?: string; sessionVersion?: number }) {
  return jwt.sign(
    { sub: user._id, role: "USER", ...(user.username ? { username: user.username } : {}), sv: Number(user.sessionVersion ?? 0), purpose: "VERIFICATION" },
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
  const users = db.collection("users");
  const indexes = await users.listIndexes().toArray();

  // Older deployments created these as non-sparse unique indexes. A null/undefined
  // contact value would then collide with the next signup. Remove the bad index
  // before recreating the intended sparse unique index.
  for (const field of ["email", "phone", "username"]) {
    const name = `${field}_1`;
    const index = indexes.find(item => item.name === name);
    if (index && (index.unique !== true || index.sparse !== true)) {
      await users.dropIndex(name);
    }
  }

  // Do not store null/undefined optional contact fields. Sparse indexes only omit
  // documents when the field is absent, not when it is explicitly null.
  await users.updateMany({ email: null }, { $unset: { email: "" } });
  await users.updateMany({ phone: null }, { $unset: { phone: "" } });

  await Promise.all([
    users.createIndex({ email: 1 }, { unique: true, sparse: true }),
    users.createIndex({ phone: 1 }, { unique: true, sparse: true }),
    users.createIndex({ phoneHash: 1 }, { sparse: true }),
    users.createIndex({ phoneSuffixHash: 1 }, { sparse: true }),
    users.createIndex({ username: 1 }, { unique: true, sparse: true }),
    users.createIndex({ createdAt: -1 })
  ]);
}

const AFRICAN_CALLING_CODES: Record<string, string> = {
  DZ: "213", AO: "244", BJ: "229", BW: "267", BF: "226", BI: "257", CV: "238", CM: "237",
  CF: "236", TD: "235", KM: "269", CD: "243", CG: "242", CI: "225", DJ: "253", EG: "20",
  GQ: "240", ER: "291", SZ: "268", ET: "251", GA: "241", GM: "220", GH: "233", GN: "224",
  GW: "245", KE: "254", LS: "266", LR: "231", LY: "218", MG: "261", MW: "265", ML: "223",
  MR: "222", MU: "230", MA: "212", MZ: "258", NA: "264", NE: "227", NG: "234", RW: "250",
  ST: "239", SN: "221", SC: "248", SL: "232", SO: "252", ZA: "27", SS: "211", SD: "249",
  TZ: "255", TG: "228", TN: "216", UG: "256", ZM: "260", ZW: "263"
};

function normalizePhoneForCountry(value: string, countryCode: string) {
  const digits = normalizePhoneDigits(value);
  if (!digits) return "";
  const callingCode = AFRICAN_CALLING_CODES[countryCode];
  if (!callingCode) return digits;
  if (digits.startsWith(callingCode)) return digits;
  if (digits.startsWith("0")) return callingCode + digits.slice(1);
  return callingCode + digits;
}



const AFRICAN_COUNTRY_CODES = new Set([
  "DZ","AO","BJ","BW","BF","BI","CV","CM","CF","TD","KM","CD","CG","CI","DJ","EG","GQ","ER",
  "SZ","ET","GA","GM","GH","GN","GW","KE","LS","LR","LY","MG","MW","ML","MR","MU","MA","MZ",
  "NA","NE","NG","RW","ST","SN","SC","SL","SO","ZA","SS","SD","TZ","TG","TN","UG","ZM","ZW"
]);

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
  const username = input.username?.trim().toLowerCase();
  if (username && (!/^[a-z0-9._]{3,24}$/.test(username) || username.endsWith("."))) throw new Error("Username must be 3-24 characters and use letters, numbers, dots or underscores");
  if (input.password.length < 8) throw new Error("Password must contain at least 8 characters");
  const dob = new Date(input.dateOfBirth);
  if (Number.isNaN(dob.getTime()) || dob >= new Date()) throw new Error("Invalid date of birth");
  const countryCode = input.countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error("A valid two-letter country code is required");
  if (!AFRICAN_COUNTRY_CODES.has(countryCode)) throw new Error("TwiTok registration is currently available only in African countries");
  const ageCutoff = new Date();
  ageCutoff.setUTCFullYear(ageCutoff.getUTCFullYear() - 13);
  if (dob > ageCutoff) throw new Error("You must be at least 13 years old to create a TwiTok account");
  if (!input.email && !input.phone) throw new Error("Email or phone is required");
  const normalizedEmail = input.email?.trim().toLowerCase();
  if (normalizedEmail) {
    if (!isValidEmailAddress(normalizedEmail)) throw new Error("Invalid email address");
  }
  const normalizedPhone = input.phone ? normalizePhoneForCountry(input.phone, countryCode) : "";
  if (normalizedPhone && normalizedPhone.length < 7) throw new Error("Invalid phone number");
  const now = new Date();
  const user = {
    sessionVersion: 0, firstName, ...(username ? { username, nickname: username } : {}),
    ...(normalizedEmail ? { email: normalizedEmail } : {}),
    ...(normalizedPhone ? {
      phone: normalizedPhone,
      phoneHash: hashPhone(normalizedPhone),
      phoneSuffixHash: hashPhoneSuffix(normalizedPhone)
    } : {}),
    dateOfBirth: dob, countryCode, accountType: "PERSONAL", monetizationEnabled: false, isPrivate: false,
    profileSetupComplete: Boolean(username), status: "ACTIVE", emailVerified: false, phoneVerified: false,
    contactSyncEnabled: false, createdAt: now, updatedAt: now
  };
  const result = await db.collection("users").insertOne({ ...user, passwordHash: await bcrypt.hash(input.password, 12) });
  return { ...user, _id: result.insertedId.toHexString() };
}

export async function authenticateUser(db: Db, identifier: string, password: string) {
  const rawIdentifier = identifier.trim();
  const normalized = rawIdentifier.toLowerCase();
  const phone = hashPhone(rawIdentifier);
  const user = await db.collection("users").findOne({
    $or: [
      ...(normalized.includes("@") ? [{ email: normalized }] : []),
      ...(phone ? [{ phoneHash: phone }, { phone: rawIdentifier }] : [])
    ]
  });
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
