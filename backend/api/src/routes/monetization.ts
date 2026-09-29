import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo.js";
import { evaluateEligibility, getEligibility } from "../monetization/programs.js";
import { requireUser } from "../auth/middleware.js";
import { requireInternalService } from "../security/internal.js";
import { rateLimit } from "../security/rate-limit.js";

export const monetizationRouter = Router();
const eligibilityEvaluateLimit = rateLimit({ windowMs: 60 * 1000, max: 30 });
const eligibilityReadLimit = rateLimit({ windowMs: 60 * 1000, max: 60, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });

function ageFromDob(dob: Date) {
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const month = now.getUTCMonth() - dob.getUTCMonth();
  if (month < 0 || (month === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

monetizationRouter.post("/eligibility/evaluate", requireInternalService, eligibilityEvaluateLimit, async (req, res) => {
  try {
    const userId = typeof req.body?.userId === "string" ? req.body.userId : "";
    if (!ObjectId.isValid(userId)) return res.status(400).json({ error: "Valid userId is required" });
    const db = await getDb();
    const _id = new ObjectId(userId);
    const user = await db.collection("users").findOne(
      { _id },
      { projection: { dateOfBirth: 1, countryCode: 1, status: 1, emailVerified: 1, phoneVerified: 1 } }
    );
    if (!user || user.status !== "ACTIVE" || !(user.dateOfBirth instanceof Date)) {
      return res.status(404).json({ error: "Active user account not found" });
    }

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [followers, publicPosts30d, views30d] = await Promise.all([
      db.collection("follows").countDocuments({ followingId: _id }),
      db.collection("videos").countDocuments({ ownerId: _id, status: "PUBLISHED", visibility: "PUBLIC", publishedAt: { $gte: since } }),
      db.collection("feed_events").aggregate([
        { $match: { type: { $in: ["VIEW_2S", "VIEW_COMPLETE"] }, createdAt: { $gte: since } } },
        { $lookup: { from: "videos", localField: "videoId", foreignField: "_id", as: "video" } },
        { $unwind: "$video" },
        { $match: { "video.ownerId": _id, "video.status": "PUBLISHED", "video.visibility": "PUBLIC" } },
        { $group: { _id: { viewerId: "$userId", videoId: "$videoId" } } },
        { $count: "count" }
      ]).toArray()
    ]);
    const profile = {
      age: ageFromDob(user.dateOfBirth),
      countryCode: String(user.countryCode ?? "").toUpperCase(),
      accountInGoodStanding: user.status === "ACTIVE",
      verifiedIdentity: Boolean(user.emailVerified || user.phoneVerified),
      followers,
      publicPosts30d,
      views30d: views30d[0]?.count ?? 0
    };
    const eligibility = evaluateEligibility(profile);
    const now = new Date();
    const criteria = { age: profile.age, countryCode: profile.countryCode, accountInGoodStanding: profile.accountInGoodStanding, verifiedIdentity: profile.verifiedIdentity, followers, publicPosts30d, views30d: profile.views30d };
    await Promise.all(Object.entries(eligibility).map(([program, eligible]) =>
      db.collection("monetization_eligibility").updateOne(
        { userId, program },
        { $set: { userId, program, eligible, evaluatedAt: now, criteria } },
        { upsert: true }
      )
    ));
    return res.json({ userId, eligibility, evaluatedAt: now });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Eligibility evaluation failed" }); }
});

monetizationRouter.get("/eligibility/me", requireUser, eligibilityReadLimit, async (req, res) => {
  try { return res.json(await getEligibility(await getDb(), req.userId!.toHexString())); }
  catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Eligibility lookup failed" }); }
});
