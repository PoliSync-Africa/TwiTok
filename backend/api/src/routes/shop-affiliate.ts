import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";

export const shopAffiliateRouter = Router();

shopAffiliateRouter.post("/affiliate/offers", requireUser, async (req, res) => {
  const db = await getDb();
  const sellerId = req.userId!.toHexString();
  const productId = String(req.body?.productId ?? "").trim();
  const commissionPercent = Number(req.body?.commissionPercent);
  if (!productId || !Number.isFinite(commissionPercent) || commissionPercent < 1 || commissionPercent > 50) {
    return res.status(400).json({ error: "productId and commissionPercent between 1 and 50 are required" });
  }
  const product = await db.collection("shop_products").findOne({ id: productId, sellerId, status: "ACTIVE" });
  if (!product) return res.status(404).json({ error: "Active seller product not found" });
  const existing = await db.collection("shop_affiliate_offers").findOne({ productId, sellerId, status: "ACTIVE" });
  if (existing) return res.json({ offer: existing });
  const offer = {
    id: randomUUID(),
    productId,
    sellerId,
    commissionPercent,
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date()
  };
  await db.collection("shop_affiliate_offers").insertOne(offer);
  return res.status(201).json({ offer });
});

shopAffiliateRouter.get("/affiliate/offers", requireUser, async (req, res) => {
  const db = await getDb();
  const offers = await db.collection("shop_affiliate_offers").find({ status: "ACTIVE" }).sort({ createdAt: -1 }).limit(200).toArray();
  return res.json({ offers });
});

shopAffiliateRouter.post("/affiliate/offers/:offerId/join", requireUser, async (req, res) => {
  const db = await getDb();
  const creatorId = req.userId!.toHexString();
  const offer = await db.collection("shop_affiliate_offers").findOne({ id: String(req.params.offerId), status: "ACTIVE" });
  if (!offer) return res.status(404).json({ error: "Affiliate offer not found" });
  if (offer.sellerId === creatorId) return res.status(400).json({ error: "Seller cannot join their own offer" });
  const existing = await db.collection("shop_affiliate_memberships").findOne({ offerId: offer.id, creatorId });
  if (existing) return res.json({ membership: existing });
  const membership = {
    id: randomUUID(),
    offerId: offer.id,
    productId: offer.productId,
    sellerId: offer.sellerId,
    creatorId,
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date()
  };
  await db.collection("shop_affiliate_memberships").insertOne(membership);
  const link = { id: randomUUID(), code: randomUUID().replaceAll("-", "").slice(0, 16), offerId: offer.id, productId: offer.productId, sellerId: offer.sellerId, creatorId, clicks: 0, createdAt: new Date() };
  await db.collection("shop_affiliate_links").insertOne(link);
  return res.status(201).json({ membership, link });
});

shopAffiliateRouter.get("/affiliate/creator", requireUser, async (req, res) => {
  const db = await getDb();
  const creatorId = req.userId!.toHexString();
  const memberships = await db.collection("shop_affiliate_memberships").find({ creatorId }).sort({ createdAt: -1 }).limit(200).toArray();
  const links = await db.collection("shop_affiliate_links").find({ creatorId }).sort({ createdAt: -1 }).limit(200).toArray();
  const commissions = await db.collection("shop_affiliate_commissions").find({ creatorId }).sort({ createdAt: -1 }).limit(500).toArray();
  const earnedMinor = commissions.filter((c: any) => c.status === "EARNED" || c.status === "PAID").reduce((sum: number, c: any) => sum + Number(c.amountMinor || 0), 0);
  return res.json({ memberships, links, commissions, earnedMinor });
});

shopAffiliateRouter.post("/affiliate/links/:code/click", async (req, res) => {
  const db = await getDb();
  const code = String(req.params.code);
  const result = await db.collection("shop_affiliate_links").updateOne({ code }, { $inc: { clicks: 1 } });
  if (!result.matchedCount) return res.status(404).json({ error: "Affiliate link not found" });
  const link = await db.collection("shop_affiliate_links").findOne({ code });
  return res.json({ productId: link?.productId, offerId: link?.offerId });
});
