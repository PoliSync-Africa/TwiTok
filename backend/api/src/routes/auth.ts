import { Router } from "express";
import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import { getDb, withMongoTransaction } from "../db/mongo.js";
import { authenticateUser, createUser, issueUserToken, issueVerificationToken } from "../auth/user.js";
import { requireUser, requireIncompleteProfileUser, requireVerificationUser } from "../auth/middleware.js";
import { rateLimit, authRateLimit } from "../security/rate-limit.js";
import { sendOtp, verifyOtp, type OtpChannel } from "../verification/otp.js";

const WEB_SESSION_COOKIE = "twitok_user_session";
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 24 * 60 * 60 * 1000 };

export const authRouter = Router();

authRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  next();
});

const userReadLimit = rateLimit({ windowMs: 60 * 1000, max: 120, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });
const userWriteLimit = rateLimit({ windowMs: 60 * 1000, max: 30, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });
const otpSendLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, key: req => `otp-send:${req.userId?.toHexString() ?? "anonymous"}:${req.ip ?? "unknown"}` });
const otpVerifyLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, key: req => `otp-verify:${req.userId?.toHexString() ?? "anonymous"}:${req.ip ?? "unknown"}` });


authRouter.post("/register", rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
  try {
    const { firstName, username, password, email, phone, dateOfBirth, countryCode } = req.body ?? {};
    if (!firstName || !password || !dateOfBirth || !countryCode) return res.status(400).json({ error: "firstName, password, dateOfBirth and countryCode are required" });
    const db = await getDb(), user = await createUser(db, { firstName, username, password, email, phone, dateOfBirth, countryCode });
    const token = issueVerificationToken(user);
    res.status(201).json({
      token,
      verificationRequired: true,
      verificationChannels: ["email", "phone"],
      verificationDelivery: "choose",
      user
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create account";
    res.status(/duplicate|E11000|already exists/i.test(message) ? 409 : 400).json({ error: message });
  }
});

authRouter.post("/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 8, key: authRateLimit }), async (req, res) => {
  try {
    const { identifier, password } = req.body ?? {};
    const loginIdentifier = String(identifier ?? "").trim();
    const loginPassword = String(password ?? "");
    if (!loginIdentifier || !loginPassword) return res.status(400).json({ error: "Email or phone number and password are required" });
    const isEmailLogin = loginIdentifier.includes("@");
    const phoneDigits = loginIdentifier.replace(/\D/g, "");
    if (!isEmailLogin && phoneDigits.length < 7) return res.status(400).json({ error: "Log in with your email address or phone number" });
    if (isEmailLogin && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginIdentifier)) return res.status(400).json({ error: "Enter a valid email address" });
    const db = await getDb();
    const user = await authenticateUser(db, loginIdentifier, loginPassword);
    const stored = await db.collection("users").findOne(
      { _id: new ObjectId(user._id) },
      { projection: { firstName: 1, emailVerified: 1, phoneVerified: 1, email: 1, phone: 1, profileSetupComplete: 1 } }
    );
    const verificationRequired = stored?.emailVerified !== true || stored?.phoneVerified !== true;
    if (verificationRequired) {
      const token = issueVerificationToken(user);
      return res.json({
        token,
        verificationRequired: true,
        verificationChannels: ["email", "phone"],
        verificationDelivery: "choose",
        user
      });
    }
    const token = issueUserToken(user);
    res.cookie(WEB_SESSION_COOKIE, token, cookieOptions);
    res.json({ token, verificationRequired: false, profileSetupRequired: user.profileSetupComplete === false, user });
  } catch { res.status(401).json({ error: "Invalid login credentials" }); }
});;