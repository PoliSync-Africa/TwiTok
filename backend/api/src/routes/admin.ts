import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo.js";
import { createOwnerToken, ensureOwnerAccount, verifyOwner } from "../auth/owner.js";
import { requireOwner } from "../auth/admin-middleware.js";
import { rateLimit, authRateLimit } from "../security/rate-limit.js";
import { verifyTotp } from "../security/totp.js";
import { createPresignedPlayback } from "../media/storage.js";
import { reviewVerificationRequest } from "../verification/service.js";

export const adminRouter = Router();
const adminReadLimit = rateLimit({ windowMs: 60 * 1000, max: 60, key: req => req.ownerId ?? req.ip ?? "unknown" });

adminRouter.post("/auth/login", rateLimit({windowMs:15*60*1000,max:6,key:authRateLimit}), async (req,res)=>{
  try {
    const {email,password,mfaCode}=req.body??{};
    if(typeof email!=="string"||typeof password!=="string") return res.status(400).json({error:"Email and password are required"});
    const db=await getDb(); await ensureOwnerAccount(db);
    const owner=await verifyOwner(db,email,password);
    if(!owner) return res.status(401).json({error:"Invalid administrator credentials"});
    let mfaVerified=!owner.mfaRequired;
    if(owner.mfaRequired){
      const secret=process.env.TWITOK_OWNER_MFA_SECRET;
      if(!secret) return res.status(503).json({error:"Administrator MFA is enabled but not configured"});
      mfaVerified=typeof mfaCode==="string" && verifyTotp(mfaCode,secret);
      if(!mfaVerified) return res.status(401).json({error:"Valid administrator MFA code required",mfaRequired:true});
    }
    const token=createOwnerToken(owner,mfaVerified);
    await db.collection("audit_logs").insertOne({actorId:String(owner._id),actorRole:"OWNER",action:"OWNER_LOGIN",resourceType:"ADMIN_SESSION",createdAt:new Date()});
    return res.json({token,administrator:{id:String(owner._id),displayName:owner.displayName,email:owner.email,role:owner.role,mfaRequired:owner.mfaRequired}});
  } catch { return res.status(500).json({error:"Administrator authentication is unavailable"}); }
});
adminRouter.get("/auth/me",requireOwner,adminReadLimit,async(req,res)=>{
  try {
    const db=await getDb();
    const owner=await db.collection("owner_accounts").findOne({_id:new ObjectId(req.ownerId!)},{projection:{displayName:1,email:1,role:1,mfaRequired:1}});
    if(!owner) return res.status(401).json({error:"Administrator session expired"});
    return res.json({administrator:{id:String(owner._id),displayName:owner.displayName,email:owner.email,role:owner.role,mfaRequired:owner.mfaRequired}});
  } catch {
    return res.status(500).json({error:"Unable to load administrator session"});
  }
});

adminRouter.get("/verification/requests", requireOwner, adminReadLimit, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const status = String(req.query.status ?? "PENDING").toUpperCase();
    const query = ["PENDING", "APPROVED", "REJECTED"].includes(status) ? { status } : {};
    const db = await getDb();
    const rows = await db.collection("verification_requests").find(query).sort({ createdAt: 1 }).limit(limit).toArray();
    const userIds = [...new Set(rows.map(row => String(row.userId)))].filter(ObjectId.isValid).map(id => new ObjectId(id));
    const users = await db.collection("users").find({ _id: { $in: userIds } }).project({ username: 1, nickname: 1, countryCode: 1, accountType: 1, isVerified: 1, profilePhotoKey: 1 }).toArray();
    const byId = new Map(users.map(user => [user._id.toHexString(), user]));
    return res.json({
      requests: rows.map(row => {
        const user = byId.get(String(row.userId));
        return {
          requestId: row.requestId,
          userId: String(row.userId),
          username: user?.username ?? null,
          nickname: user?.nickname ?? null,
          countryCode: user?.countryCode ?? null,
          accountType: user?.accountType ?? null,
          isVerified: user?.isVerified === true,
          type: row.type,
          legalName: row.legalName,
          displayName: row.displayName,
          website: row.website ?? null,
          supportingLinks: row.supportingLinks ?? [],
          reason: row.reason ?? "",
          status: row.status,
          createdAt: row.createdAt,
          reviewedAt: row.reviewedAt ?? null,
          reviewNotes: row.reviewNotes ?? null
        };
      })
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unable to load verification requests" });
  }
});

adminRouter.get("/verification/requests/:requestId/document-url", requireOwner, adminReadLimit, async (req, res) => {
  try {
    const requestId = String(req.params.requestId);
    const request = await (await getDb()).collection("verification_requests").findOne({ requestId }, { projection: { identityDocumentKey: 1 } });
    if (!request?.identityDocumentKey) return res.status(404).json({ error: "Verification document not found" });
    const signed = await createPresignedPlayback(String(request.identityDocumentKey), 300);
    return res.json({ url: signed.url, expiresInSeconds: signed.expiresInSeconds });
  } catch (error) {
    return res.status(404).json({ error: error instanceof Error ? error.message : "Unable to prepare verification document" });
  }
});

adminRouter.post("/verification/requests/:requestId/review", requireOwner, rateLimit({ windowMs: 60 * 60 * 1000, max: 60, key: req => req.ownerId ?? req.ip ?? "unknown" }), async (req, res) => {
  try {
    const decision = String(req.body?.decision ?? "").toUpperCase();
    if (decision !== "APPROVE" && decision !== "REJECT") return res.status(400).json({ error: "Decision must be APPROVE or REJECT" });
    const result = await reviewVerificationRequest(await getDb(), String(req.params.requestId), String(req.ownerId), decision as "APPROVE" | "REJECT", req.body?.reviewNotes);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to review verification request" });
  }
});

adminRouter.get("/platform/control", requireOwner, adminReadLimit, async (_req, res) => {
  try {
    const db = await getDb();
    const defaults = {
      maintenanceMode: false,
      readOnlyMode: false,
      registrationEnabled: true,
      uploadsEnabled: true,
      commentsEnabled: true,
      liveEnabled: true,
      giftsEnabled: true,
      withdrawalsEnabled: true,
      globalAnnouncementEnabled: false,
      strictYouthSafety: true,
      aiModerationEnforced: true
    };
    const platformControls = db.collection<any>("platform_control");
    const row = await platformControls.findOne({ _id: "global" });
    return res.json({ controls: { ...defaults, ...((row?.controls ?? {}) as Record<string, boolean>) }, updatedAt: row?.updatedAt ?? null });
  } catch {
    return res.status(500).json({ error: "Unable to load platform controls" });
  }
});

adminRouter.patch("/platform/control", requireOwner, rateLimit({ windowMs: 60 * 60 * 1000, max: 120, key: req => req.ownerId ?? req.ip ?? "unknown" }), async (req, res) => {
  try {
    const allowed = [
      "maintenanceMode", "readOnlyMode", "registrationEnabled", "uploadsEnabled",
      "commentsEnabled", "liveEnabled", "giftsEnabled", "withdrawalsEnabled",
      "globalAnnouncementEnabled", "strictYouthSafety", "aiModerationEnforced"
    ] as const;
    const incoming = req.body?.controls;
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
      return res.status(400).json({ error: "controls must be an object" });
    }
    const controls: Record<string, boolean> = {};
    for (const key of allowed) {
      if (key in incoming && typeof incoming[key] !== "boolean") {
        return res.status(400).json({ error: `${key} must be true or false` });
      }
      if (key in incoming) controls[key] = incoming[key];
    }
    if (!Object.keys(controls).length) return res.status(400).json({ error: "No supported platform controls supplied" });
    const db = await getDb();
    const platformControls = db.collection("platform_control");
    const before = await platformControls.findOne({ _id: "global" });
    const beforeControls = (before?.controls ?? {}) as Record<string, boolean>;
    await platformControls.updateOne(
      { _id: "global" },
      { $set: { controls: { ...beforeControls, ...controls }, updatedAt: new Date(), updatedBy: req.ownerId } },
      { upsert: true }
    );
    await db.collection("audit_logs").insertOne({
      actorId: req.ownerId,
      actorRole: "OWNER",
      action: "PLATFORM_CONTROL_UPDATE",
      resourceType: "PLATFORM_CONTROL",
      metadata: { changed: controls },
      createdAt: new Date()
    });
    const saved = await platformControls.findOne({ _id: "global" });
    return res.json({ controls: (saved?.controls ?? controls) as Record<string, boolean>, updatedAt: saved?.updatedAt ?? new Date() });
  } catch {
    return res.status(500).json({ error: "Unable to update platform controls" });
  }
});

adminRouter.get("/overview",requireOwner,adminReadLimit,async(req,res)=>{
  try {
    const db=await getDb();
    const [users,videos,reports,live,creators,streams,wallets,withdrawals,ledgerTotals]=await Promise.all([
      db.collection("users").countDocuments(),db.collection("videos").countDocuments({status:"PUBLISHED"}),
      db.collection("moderation_cases").countDocuments({status:"OPEN"}),db.collection("live_streams").countDocuments({status:"LIVE"}),
      db.collection("creator_profiles").countDocuments(),db.collection("live_streams").countDocuments(),db.collection("wallets").countDocuments(),
      db.collection("withdrawals").countDocuments({status:"PENDING"}),db.collection("financial_ledger").aggregate([{$group:{_id:null,grossUsd:{$sum:"$grossUsd"},platformUsd:{$sum:"$platformUsd"},creatorUsd:{$sum:"$creatorUsd"}}}]).toArray()
    ]);
    return res.json({users,videos,reports,live,creators,streams,wallets,pendingWithdrawals:withdrawals,money:ledgerTotals[0]??{grossUsd:0,platformUsd:0,creatorUsd:0}});
  } catch { return res.status(500).json({error:"Unable to load administrator overview"}); }
});

function parseFinanceDate(value: unknown, fallback: Date) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

adminRouter.get("/finance/summary", requireOwner, adminReadLimit, async (req, res) => {
  try {
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const from = parseFinanceDate(req.query.from, defaultFrom);
    const requestedTo = parseFinanceDate(req.query.to, now);
    const to = requestedTo > from ? requestedTo : now;
    const maxRangeMs = 366 * 24 * 60 * 60 * 1000;
    const boundedFrom = to.getTime() - from.getTime() > maxRangeMs
      ? new Date(to.getTime() - maxRangeMs)
      : from;

    const db = await getDb();
    const [ledger, withdrawals, liabilities] = await Promise.all([
      db.collection("platform_financial_ledger").aggregate([
        { $match: { createdAt: { $gte: boundedFrom, $lt: to } } },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  coinSalesGrossUsd: { $sum: { $cond: [{ $eq: ["$eventType", "COIN_PURCHASE"] }, "$grossUsd", 0] } },
                  providerFeesUsd: { $sum: { $cond: [{ $eq: ["$eventType", "COIN_PURCHASE"] }, "$providerFeeUsd", 0] } },
                  providerTaxesUsd: { $sum: { $cond: [{ $eq: ["$eventType", "COIN_PURCHASE"] }, "$providerTaxUsd", 0] } },
                  coinNetProceedsUsd: { $sum: { $cond: [{ $eq: ["$eventType", "COIN_PURCHASE"] }, "$netProceedsUsd", 0] } },
                  deferredPlatformUsd: { $sum: { $cond: [{ $eq: ["$eventType", "COIN_PURCHASE"] }, "$deferredPlatformUsd", 0] } },
                  giftNetProceedsUsd: { $sum: { $cond: [{ $eq: ["$eventType", "GIFT_SETTLEMENT"] }, "$netProceedsUsd", 0] } },
                  creatorAllocationUsd: { $sum: { $cond: [{ $eq: ["$eventType", "GIFT_SETTLEMENT"] }, "$creatorAllocationUsd", 0] } },
                  creatorCashCreditUsd: { $sum: { $cond: [{ $eq: ["$eventType", "GIFT_SETTLEMENT"] }, "$creatorCashCreditUsd", 0] } },
                  creatorLiabilityOffsetUsd: { $sum: { $cond: [{ $eq: ["$eventType", "GIFT_SETTLEMENT"] }, "$creatorLiabilityOffsetUsd", 0] } },
                  platformAllocationUsd: { $sum: { $cond: [{ $eq: ["$eventType", "GIFT_SETTLEMENT"] }, "$platformAllocationUsd", 0] } },
                  refundsUsd: { $sum: { $cond: [{ $eq: ["$eventType", "REFUND"] }, "$netRefundUsd", 0] } },
                  creatorRefundUsd: { $sum: { $cond: [{ $eq: ["$eventType", "REFUND"] }, "$creatorRefundUsd", 0] } },
                  creatorRecoveredUsd: { $sum: { $cond: [{ $eq: ["$eventType", "REFUND"] }, "$creatorRecoveredUsd", 0] } },
                  creatorRefundLiabilityUsd: { $sum: { $cond: [{ $eq: ["$eventType", "REFUND"] }, "$creatorLiabilityUsd", 0] } },
                  platformRefundUsd: { $sum: { $cond: [{ $eq: ["$eventType", "REFUND"] }, "$platformRefundUsd", 0] } },
                  platformRefundLiabilityUsd: { $sum: { $cond: [{ $eq: ["$eventType", "REFUND"] }, "$platformLiabilityUsd", 0] } }
                }
              }
            ],
            daily: [
              {
                $group: {
                  _id: {
                    $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" }
                  },
                  coinSalesGrossUsd: { $sum: { $cond: [{ $eq: ["$eventType", "COIN_PURCHASE"] }, "$grossUsd", 0] } },
                  giftNetProceedsUsd: { $sum: { $cond: [{ $eq: ["$eventType", "GIFT_SETTLEMENT"] }, "$netProceedsUsd", 0] } },
                  platformAllocationUsd: { $sum: { $cond: [{ $eq: ["$eventType", "GIFT_SETTLEMENT"] }, "$platformAllocationUsd", 0] } },
                  refundsUsd: { $sum: { $cond: [{ $eq: ["$eventType", "REFUND"] }, "$netRefundUsd", 0] } }
                }
              },
              { $sort: { _id: 1 } }
            ]
          }
        }
      ]).toArray(),
      db.collection("withdrawals").aggregate([
        { $match: { createdAt: { $gte: boundedFrom, $lt: to } } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            amountUsd: { $sum: "$amountUsd" }
          }
        }
      ]).toArray(),
      db.collection("wallets").aggregate([
        {
          $group: {
            _id: null,
            creatorRefundLiabilityUsd: { $sum: { $ifNull: ["$creatorRefundLiabilityUsd", 0] } },
            buyerRefundLiabilityUsd: { $sum: { $ifNull: ["$refundLiabilityUsd", 0] } },
            cashBalanceUsd: { $sum: { $ifNull: ["$cashBalanceUsd", 0] } },
            diamondBalance: { $sum: { $ifNull: ["$diamondBalance", 0] } }
          }
        }
      ]).toArray()
    ]);

    const totals = ledger[0]?.totals?.[0] ?? {};
    const withdrawalByStatus = Object.fromEntries(
      (withdrawals as Array<{ _id?: string; count?: number; amountUsd?: number }>).map(row => [
        String(row._id ?? "UNKNOWN"),
        { count: Number(row.count ?? 0), amountUsd: Number(row.amountUsd ?? 0) }
      ])
    );
    const estimatedPlatformContributionUsd = Number((
      Number(totals.platformAllocationUsd ?? 0)
      - Number(totals.platformRefundUsd ?? 0)
      - Number(totals.providerFeesUsd ?? 0)
      - Number(totals.providerTaxesUsd ?? 0)
    ).toFixed(8));

    return res.json({
      period: { from: boundedFrom.toISOString(), to: to.toISOString() },
      revenue: {
        coinSalesGrossUsd: Number(totals.coinSalesGrossUsd ?? 0),
        providerFeesUsd: Number(totals.providerFeesUsd ?? 0),
        providerTaxesUsd: Number(totals.providerTaxesUsd ?? 0),
        coinNetProceedsUsd: Number(totals.coinNetProceedsUsd ?? 0),
        deferredPlatformUsd: Number(totals.deferredPlatformUsd ?? 0),
        giftNetProceedsUsd: Number(totals.giftNetProceedsUsd ?? 0),
        creatorAllocationUsd: Number(totals.creatorAllocationUsd ?? 0),
        creatorCashCreditUsd: Number(totals.creatorCashCreditUsd ?? 0),
        creatorLiabilityOffsetUsd: Number(totals.creatorLiabilityOffsetUsd ?? 0),
        platformAllocationUsd: Number(totals.platformAllocationUsd ?? 0),
        refundsUsd: Number(totals.refundsUsd ?? 0),
        creatorRefundUsd: Number(totals.creatorRefundUsd ?? 0),
        creatorRecoveredUsd: Number(totals.creatorRecoveredUsd ?? 0),
        creatorRefundLiabilityUsd: Number(totals.creatorRefundLiabilityUsd ?? 0),
        platformRefundUsd: Number(totals.platformRefundUsd ?? 0),
        platformRefundLiabilityUsd: Number(totals.platformRefundLiabilityUsd ?? 0),
        estimatedPlatformContributionUsd
      },
      withdrawals: withdrawalByStatus,
      liabilities: liabilities[0] ?? {
        creatorRefundLiabilityUsd: 0,
        buyerRefundLiabilityUsd: 0,
        cashBalanceUsd: 0,
        diamondBalance: 0
      },
      daily: ledger[0]?.daily ?? []
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unable to load finance summary" });
  }
});

adminRouter.get("/finance/ledger", requireOwner, adminReadLimit, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const skip = Math.max(0, Number(req.query.skip ?? 0));
    const db = await getDb();
    const rows = await db.collection("platform_financial_ledger")
      .find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .project({
        _id: 0,
        transactionId: 1,
        eventType: 1,
        provider: 1,
        providerTransactionId: 1,
        userId: 1,
        giftTransactionId: 1,
        sku: 1,
        grossUsd: 1,
        providerFeeUsd: 1,
        providerTaxUsd: 1,
        netProceedsUsd: 1,
        creatorAllocationUsd: 1,
        creatorCashCreditUsd: 1,
        creatorLiabilityOffsetUsd: 1,
        platformAllocationUsd: 1,
        deferredPlatformUsd: 1,
        netRefundUsd: 1,
        creatorRefundUsd: 1,
        creatorRecoveredUsd: 1,
        creatorLiabilityUsd: 1,
        platformRefundUsd: 1,
        platformLiabilityUsd: 1,
        status: 1,
        createdAt: 1
      })
      .toArray();
    const total = await db.collection("platform_financial_ledger").countDocuments();
    return res.json({ rows, total, limit, skip });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unable to load finance ledger" });
  }
});
