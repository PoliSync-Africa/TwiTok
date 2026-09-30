import { Router } from "express";
import { ObjectId } from "mongodb";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { rateLimit } from "../security/rate-limit.js";
import { TWITOK_PROMOTION_DISCOUNT, TWITOK_VIEW_PACKS, TWITOK_OBJECTIVES, TWITOK_OBJECTIVE_BUDGET_PACKS, TWITOK_PARTNERSHIP_PACKS, TWITOK_SUBSCRIBER_REACH_PACKS, TWITOK_DURATION_OPTIONS, TWITOK_DEFAULT_DURATION_DAYS, discountedPromotionPrice, durationAdjustedPrice, durationAdjustedAudience, durationPriceIncreasePercent, getViewPack } from "../config/promotion-pricing.js";

export const promotionsRouter = Router();

const createLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });
const paymentLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });
const campaignReadLimit = rateLimit({ windowMs: 60 * 1000, max: 60, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });
const campaignActionLimit = rateLimit({ windowMs: 60 * 1000, max: 20, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });

const OBJECTIVES = TWITOK_OBJECTIVES;
const CURRENCIES = ["GHS", "USD"] as const;

function moneyToMinor(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) throw new Error("Invalid budget");
  return Math.round(amount * 100);
}

function publicCampaign(c: any) {
  return {
    id: c._id.toHexString(),
    videoId: c.videoId?.toHexString?.() ?? null,
    objective: c.objective,
    currency: c.currency,
    budgetMinor: c.budgetMinor,
    spentMinor: c.spentMinor ?? 0,
    status: c.status,
    target: c.target,
    startAt: c.startAt,
    endAt: c.endAt,
    metrics: c.metrics ?? { impressions: 0, views: 0, follows: 0, clicks: 0 },
    packageId: c.packageId ?? null,
    benchmarkBudgetMinor: c.benchmarkBudgetMinor ?? null,
    discountPercent: c.discountPercent ?? 0,
    discountLabel: c.discountLabel ?? null,
    targetViews: c.targetViews ?? null,
    baseTargetViews: c.baseTargetViews ?? null,
    durationDays: c.durationDays ?? null,
    priceIncreasePercent: c.priceIncreasePercent ?? 0,
    audienceIncreasePercent: c.audienceIncreasePercent ?? 0
  };
}

promotionsRouter.get("/packages", requireUser, campaignReadLimit, async (_req, res) => {
  return res.json({
    discountPercent: TWITOK_PROMOTION_DISCOUNT * 100,
    discountLabel: "8% DISCOUNT APPLIED",
    currency: "USD",
    objectives: TWITOK_OBJECTIVES,
    audienceDefaults: { scope: "GLOBAL", countryCodes: [], usesDeviceLocationWhenGranted: true },
    durationOptions: TWITOK_DURATION_OPTIONS,
    packages: TWITOK_VIEW_PACKS.map(pack => ({
      id: pack.id,
      views: pack.views,
      durationDays: TWITOK_DEFAULT_DURATION_DAYS,
      benchmarkPrice: pack.benchmarkUsd,
      price: discountedPromotionPrice(pack.benchmarkUsd),
      durationOptions: TWITOK_DURATION_OPTIONS.map(option => ({ days: option.days, price: discountedPromotionPrice(durationAdjustedPrice(pack.benchmarkUsd, option.days)), priceIncreasePercent: option.priceIncreasePercent, cumulativePriceIncreasePercent: durationPriceIncreasePercent(option.days), audienceIncreasePercent: option.audienceIncreasePercent })),
      recommended: Boolean("recommended" in pack && pack.recommended)
    })),
    partnershipPackages: TWITOK_PARTNERSHIP_PACKS.map(pack => ({
      id: pack.id,
      benchmarkPrice: pack.benchmarkUsd,
      price: discountedPromotionPrice(durationAdjustedPrice(pack.benchmarkUsd, TWITOK_DEFAULT_DURATION_DAYS)),
      durationOptions: TWITOK_DURATION_OPTIONS.map(option => ({ days: option.days, price: discountedPromotionPrice(durationAdjustedPrice(pack.benchmarkUsd, option.days)), priceIncreasePercent: option.priceIncreasePercent, cumulativePriceIncreasePercent: durationPriceIncreasePercent(option.days), audienceIncreasePercent: option.audienceIncreasePercent })),
      durationDays: pack.durationDays,
      deliverables: pack.deliverables,
      recommended: Boolean("recommended" in pack && pack.recommended)
    })),
    subscriberReachPackages: TWITOK_SUBSCRIBER_REACH_PACKS.map(pack => ({
      id: pack.id,
      audience: durationAdjustedAudience(pack.audience, TWITOK_DEFAULT_DURATION_DAYS),
      baseAudience: pack.audience,
      benchmarkPrice: pack.benchmarkUsd,
      price: discountedPromotionPrice(durationAdjustedPrice(pack.benchmarkUsd, TWITOK_DEFAULT_DURATION_DAYS)),
      durationOptions: TWITOK_DURATION_OPTIONS.map(option => ({ days: option.days, price: discountedPromotionPrice(durationAdjustedPrice(pack.benchmarkUsd, option.days)), audience: durationAdjustedAudience(pack.audience, option.days), priceIncreasePercent: option.priceIncreasePercent, cumulativePriceIncreasePercent: durationPriceIncreasePercent(option.days), audienceIncreasePercent: option.audienceIncreasePercent })),
      durationDays: TWITOK_DEFAULT_DURATION_DAYS,
      recommended: Boolean("recommended" in pack && pack.recommended)
    })),
    objectivePackages: TWITOK_OBJECTIVE_BUDGET_PACKS.map(pack => ({
      id: pack.id,
      benchmarkPrice: pack.benchmarkUsd,
      price: discountedPromotionPrice(pack.benchmarkUsd),
      durationOptions: TWITOK_DURATION_OPTIONS.map(option => ({ days: option.days, price: discountedPromotionPrice(durationAdjustedPrice(pack.benchmarkUsd, option.days)), priceIncreasePercent: option.priceIncreasePercent, cumulativePriceIncreasePercent: durationPriceIncreasePercent(option.days), audienceIncreasePercent: option.audienceIncreasePercent })),
      durationDays: TWITOK_DEFAULT_DURATION_DAYS,
      recommended: Boolean("recommended" in pack && pack.recommended),
      note: "Budget-based promotion. Follower/profile results are estimates, not guaranteed."
    }))
  });
});

promotionsRouter.post("/", requireUser, createLimit, async (req, res) => {
  try {
    const videoId = String(req.body?.videoId ?? "");
    if (!ObjectId.isValid(videoId)) return res.status(400).json({ error: "A valid videoId is required" });
    const db = await getDb();
    const video = await db.collection("videos").findOne({ _id: new ObjectId(videoId), ownerId: req.userId!, status: "PUBLISHED", visibility: "PUBLIC" }, { projection: { _id: 1 } });
    if (!video) return res.status(404).json({ error: "Only your published public videos can be promoted" });

    const objective = String(req.body?.objective ?? "MORE_VIEWS");
    if (!OBJECTIVES.includes(objective as any)) return res.status(400).json({ error: "Invalid promotion objective" });
    const currency = String(req.body?.currency ?? "GHS").toUpperCase();
    if (!CURRENCIES.includes(currency as any)) return res.status(400).json({ error: "Unsupported currency" });
    const packageId = req.body?.packageId ? String(req.body.packageId) : "";
    const requestedDurationDays = Number(req.body?.durationDays ?? TWITOK_DEFAULT_DURATION_DAYS);
    const durationOption = TWITOK_DURATION_OPTIONS.find(option => option.days === requestedDurationDays);
    if (!durationOption) return res.status(400).json({ error: "Promotion duration must be 1, 7, 14, 30, or 60 days" });
    const selectedPack = packageId ? getViewPack(packageId) : null;
    if (packageId && !selectedPack) return res.status(400).json({ error: "Invalid promotion package" });
    if (selectedPack && currency !== "USD") return res.status(400).json({ error: "TikTok-benchmark promotion packs are priced in USD" });
    const baseBenchmarkUsd = selectedPack?.benchmarkUsd ?? Number(req.body?.benchmarkBudgetUsd ?? req.body?.budget);
    const durationBenchmarkUsd = Number.isFinite(baseBenchmarkUsd) ? durationAdjustedPrice(baseBenchmarkUsd, durationOption.days) : Number(req.body?.budget);
    const discountedBudget = selectedPack ? discountedPromotionPrice(durationBenchmarkUsd) : Number((durationAdjustedPrice(Number(req.body?.budget), durationOption.days) * (1 - TWITOK_PROMOTION_DISCOUNT)).toFixed(2));
    const budgetMinor = moneyToMinor(discountedBudget);
    if (currency === "GHS" && budgetMinor < 500) return res.status(400).json({ error: "Minimum promotion budget is GHS 5" });
    if (currency === "USD" && budgetMinor < 100) return res.status(400).json({ error: "Minimum promotion budget is USD 1" });

    const target = {
      countryCodes: Array.isArray(req.body?.target?.countryCodes) ? req.body.target.countryCodes.map((x: unknown) => String(x).toUpperCase()).filter((x: string) => /^[A-Z]{2}$/.test(x)).slice(0, 50) : [],
      interests: Array.isArray(req.body?.target?.interests) ? req.body.target.interests.map((x: unknown) => String(x).trim().toLowerCase()).filter(Boolean).slice(0, 20) : [],
      ageMin: Number.isFinite(Number(req.body?.target?.ageMin)) ? Math.max(13, Math.min(65, Number(req.body.target.ageMin))) : 13,
      ageMax: Number.isFinite(Number(req.body?.target?.ageMax)) ? Math.max(13, Math.min(65, Number(req.body.target.ageMax))) : 65
    };
    if (target.ageMin > target.ageMax) return res.status(400).json({ error: "Invalid age range" });

    const campaign = {
      _id: new ObjectId(), ownerId: req.userId!, videoId: new ObjectId(videoId), objective, currency,
      budgetMinor, spentMinor: 0, status: "DRAFT", target,
      packageId: selectedPack?.id ?? null,
      benchmarkBudgetMinor: selectedPack ? Math.round(selectedPack.benchmarkUsd * 100) : null,
      discountPercent: selectedPack ? TWITOK_PROMOTION_DISCOUNT * 100 : 0,
      discountLabel: selectedPack ? "8% DISCOUNT APPLIED" : null,
      targetViews: selectedPack ? durationAdjustedAudience(selectedPack.views, durationOption.days) : null,
      baseTargetViews: selectedPack?.views ?? null,
      durationDays: durationOption.days,
      priceIncreasePercent: durationPriceIncreasePercent(durationOption.days),
      audienceIncreasePercent: durationOption.audienceIncreasePercent,
      metrics: { impressions: 0, views: 0, follows: 0, clicks: 0 },
      createdAt: new Date(), updatedAt: new Date()
    };
    await db.collection("promotion_campaigns").insertOne(campaign);
    return res.status(201).json(publicCampaign(campaign));
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to create promotion" });
  }
});

promotionsRouter.get("/me", requireUser, campaignReadLimit, async (req, res) => {
  try {
    const rows = await (await getDb()).collection("promotion_campaigns").find({ ownerId: req.userId! }).sort({ createdAt: -1 }).limit(50).toArray();
    return res.json({ campaigns: rows.map(publicCampaign) });
  } catch { return res.status(500).json({ error: "Unable to load promotions" }); }
});

promotionsRouter.get("/:campaignId", requireUser, campaignReadLimit, async (req, res) => {
  try {
    const campaignId = String(req.params.campaignId);
    if (!ObjectId.isValid(campaignId)) return res.status(400).json({ error: "Invalid campaign id" });
    const campaign = await (await getDb()).collection("promotion_campaigns").findOne({ _id: new ObjectId(campaignId), ownerId: req.userId! });
    if (!campaign) return res.status(404).json({ error: "Promotion campaign not found" });
    return res.json({ campaign: publicCampaign(campaign) });
  } catch {
    return res.status(500).json({ error: "Unable to load promotion" });
  }
});

promotionsRouter.get("/:campaignId/analytics", requireUser, campaignReadLimit, async (req, res) => {
  try {
    const campaignId = String(req.params.campaignId);
    if (!ObjectId.isValid(campaignId)) return res.status(400).json({ error: "Invalid campaign id" });
    const db = await getDb();
    const campaign = await db.collection("promotion_campaigns").findOne({ _id: new ObjectId(campaignId), ownerId: req.userId! });
    if (!campaign) return res.status(404).json({ error: "Promotion campaign not found" });
    const videoId = campaign.videoId as ObjectId;
    const [events, payment] = await Promise.all([
      db.collection("feed_events").aggregate([
        { $match: { videoId, source: "PROMOTED", createdAt: { $gte: campaign.startAt ?? campaign.createdAt } } },
        { $group: { _id: "$type", count: { $sum: 1 }, watchMs: { $sum: { $ifNull: ["$watchMs", 0] } } } }
      ]).toArray(),
      db.collection("promotion_payments").findOne({ campaignId: campaign._id, userId: req.userId! }, { projection: { status: 1, amountMinor: 1, currency: 1, verifiedAt: 1 } })
    ]);
    const byType: Record<string, number> = {};
    let totalWatchMs = 0;
    for (const row of events) { byType[String(row._id)] = Number(row.count ?? 0); totalWatchMs += Number(row.watchMs ?? 0); }
    return res.json({
      campaign: publicCampaign(campaign),
      payment: payment ? { status: payment.status, amountMinor: payment.amountMinor, currency: payment.currency, verifiedAt: payment.verifiedAt ?? null } : null,
      analytics: {
        impressions: byType.IMPRESSION ?? 0,
        views: byType.VIEW_2S ?? 0,
        completedViews: byType.VIEW_COMPLETE ?? 0,
        likes: byType.LIKE ?? 0,
        comments: byType.COMMENT ?? 0,
        shares: byType.SHARE ?? 0,
        saves: byType.SAVE ?? 0,
        follows: byType.FOLLOW ?? 0,
        totalWatchMs,
        targetViews: campaign.targetViews ?? null
      }
    });
  } catch {
    return res.status(500).json({ error: "Unable to load promotion analytics" });
  }
});

promotionsRouter.post("/:campaignId/pay", requireUser, paymentLimit, async (req, res) => {
  try {
    if (!ObjectId.isValid(String(req.params.campaignId))) return res.status(400).json({ error: "Invalid campaign id" });
    const db = await getDb();
    const campaign = await db.collection("promotion_campaigns").findOne({ _id: new ObjectId(String(req.params.campaignId)), ownerId: req.userId!, status: "DRAFT" });
    if (!campaign) return res.status(404).json({ error: "Promotion campaign not found" });
    const requestedEmail = String(req.body?.email ?? "").trim();
    const user = await db.collection("users").findOne({ _id: req.userId! }, { projection: { email: 1 } });
    const email = requestedEmail || String(user?.email ?? "").trim();
    if (!email.includes("@") || email.length > 200) return res.status(400).json({ error: "A valid account email is required" });

    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return res.status(503).json({ error: "TwiTok payments are not configured yet" });
    const reference = "twitok_promo_" + randomUUID().replace(/-/g, "");
    const amount = campaign.budgetMinor;
    const callback = process.env.PAYSTACK_CALLBACK_URL ?? "";
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
      body: JSON.stringify({ email, amount, currency: campaign.currency, reference, callback_url: callback || undefined, metadata: { type: "PROMOTION", campaignId: campaign._id.toHexString(), userId: req.userId!.toHexString() } })
    });
    const data: any = await response.json();
    if (!response.ok || !data?.status || !data?.data?.authorization_url) return res.status(502).json({ error: "Payment provider could not initialize the transaction" });
    await db.collection("promotion_payments").insertOne({ reference, campaignId: campaign._id, userId: req.userId!, amountMinor: amount, currency: campaign.currency, status: "INITIALIZED", provider: "PAYSTACK", createdAt: new Date() });
    return res.json({ reference, authorizationUrl: data.data.authorization_url, accessCode: data.data.access_code });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to initialize payment" }); }
});

promotionsRouter.post("/payments/webhook", async (req, res) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const rawBody = (req as any).rawBody as Buffer | undefined;
    const signature = String(req.get("x-paystack-signature") ?? "");
    if (!secret || !rawBody || !signature) return res.status(400).json({ error: "Invalid webhook request" });

    const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
    const expectedBuf = Buffer.from(expected, "utf8");
    const receivedBuf = Buffer.from(signature, "utf8");
    if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }

    const payload = JSON.parse(rawBody.toString("utf8"));
    if (payload?.event !== "charge.success") return res.json({ received: true });

    const transaction = payload?.data;
    const reference = String(transaction?.reference ?? "");
    if (!/^twitok_promo_[A-Za-z0-9]+$/.test(reference)) return res.json({ received: true });

    const db = await getDb();
    const payment = await db.collection("promotion_payments").findOne({ reference });
    if (!payment) return res.json({ received: true });

    if (Number(transaction.amount) !== Number(payment.amountMinor) ||
        String(transaction.currency).toUpperCase() !== String(payment.currency).toUpperCase()) {
      return res.status(400).json({ error: "Payment amount or currency mismatch" });
    }

    const campaign = await db.collection("promotion_campaigns").findOne({ _id: payment.campaignId, ownerId: payment.userId });
    if (!campaign) return res.status(404).json({ error: "Promotion campaign not found" });

    await db.collection("promotion_payments").updateOne(
      { _id: payment._id, status: { $ne: "PAID" } },
      { $set: { status: "PAID", verifiedAt: new Date(), providerTransactionId: transaction.id } }
    );
    await db.collection("promotion_campaigns").updateOne(
      { _id: campaign._id, status: { $in: ["DRAFT", "PAID"] } },
      { $set: { status: "PAID", paidAt: new Date(), updatedAt: new Date() } }
    );

    return res.json({ received: true });
  } catch {
    return res.status(400).json({ error: "Invalid payment webhook" });
  }
});

promotionsRouter.post("/payments/verify", requireUser, paymentLimit, async (req, res) => {
  try {
    const reference = String(req.body?.reference ?? "");
    if (!/^twitok_promo_[A-Za-z0-9]+$/.test(reference)) return res.status(400).json({ error: "Invalid payment reference" });
    const db = await getDb();
    const payment = await db.collection("promotion_payments").findOne({ reference, userId: req.userId! });
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return res.status(503).json({ error: "TwiTok payments are not configured yet" });
    const response = await fetch("https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference), { headers: { Authorization: "Bearer " + secret } });
    const data: any = await response.json();
    const transaction = data?.data;
    if (!response.ok || !data?.status || transaction?.status !== "success") return res.status(402).json({ status: "PENDING", providerStatus: transaction?.status ?? "unknown" });
    if (Number(transaction.amount) !== Number(payment.amountMinor) || String(transaction.currency).toUpperCase() !== String(payment.currency).toUpperCase()) return res.status(400).json({ error: "Payment amount or currency mismatch" });

    const campaign = await db.collection("promotion_campaigns").findOne({ _id: payment.campaignId, ownerId: req.userId! });
    if (!campaign) return res.status(404).json({ error: "Promotion campaign not found" });
    await db.collection("promotion_payments").updateOne({ _id: payment._id, status: { $ne: "PAID" } }, { $set: { status: "PAID", verifiedAt: new Date(), providerTransactionId: transaction.id } });
    await db.collection("promotion_campaigns").updateOne({ _id: campaign._id, status: { $in: ["DRAFT", "PAID"] } }, { $set: { status: "PAID", paidAt: new Date(), updatedAt: new Date() } });
    const updated = await db.collection("promotion_campaigns").findOne({ _id: campaign._id });
    return res.json({ status: "PAID", campaign: publicCampaign(updated) });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Payment verification failed" }); }
});

promotionsRouter.post("/:campaignId/start", requireUser, campaignActionLimit, async (req, res) => {
  try {
    if (!ObjectId.isValid(String(req.params.campaignId))) return res.status(400).json({ error: "Invalid campaign id" });
    const db = await getDb();
    const campaign = await db.collection("promotion_campaigns").findOne({ _id: new ObjectId(String(req.params.campaignId)), ownerId: req.userId!, status: "PAID" });
    if (!campaign) return res.status(400).json({ error: "Campaign must have a verified payment before it can start" });
    const startAt = new Date();
    const endAt = campaign.durationDays ? new Date(startAt.getTime() + Number(campaign.durationDays) * 24 * 60 * 60 * 1000) : null;
    const result = await db.collection("promotion_campaigns").updateOne({ _id: campaign._id, ownerId: req.userId!, status: "PAID" }, { $set: { status: "ACTIVE", startAt, endAt, updatedAt: new Date() } });
    if (!result.matchedCount) return res.status(400).json({ error: "Campaign must have a verified payment before it can start" });
    return res.json({ status: "ACTIVE" });
  } catch { return res.status(400).json({ error: "Unable to start promotion" }); }
});

promotionsRouter.post("/:campaignId/pause", requireUser, campaignActionLimit, async (req, res) => {
  try {
    if (!ObjectId.isValid(String(req.params.campaignId))) return res.status(400).json({ error: "Invalid campaign id" });
    const result = await (await getDb()).collection("promotion_campaigns").updateOne({ _id: new ObjectId(String(req.params.campaignId)), ownerId: req.userId!, status: "ACTIVE" }, { $set: { status: "PAUSED", updatedAt: new Date() } });
    if (!result.matchedCount) return res.status(404).json({ error: "Active promotion not found" });
    return res.json({ status: "PAUSED" });
  } catch { return res.status(400).json({ error: "Unable to pause promotion" }); }
});
