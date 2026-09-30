import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { rateLimit } from "../security/rate-limit.js";

export const shopContentRouter = Router();
const writeLimit = rateLimit({ windowMs: 60 * 1000, max: 30, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });

function validId(value: string) {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

shopContentRouter.get("/content/:videoId/products", requireUser, async (req, res) => {
  const videoId = validId(String(req.params.videoId));
  if (!videoId) return res.status(400).json({ error: "Invalid video id" });
  const db = await getDb();
  const tags = await db.collection("video_shop_products").find({ videoId }).sort({ sortOrder: 1, createdAt: 1 }).toArray();
  const productIds = tags.map((tag: any) => String(tag.productId)).filter(Boolean);
  const products = productIds.length
    ? await db.collection("shop_products").find({ id: { $in: productIds }, status: "ACTIVE" }).toArray()
    : [];
  const byId = new Map(products.map((p: any) => [String(p.id), p]));
  return res.json({ products: tags.map((tag: any) => ({ ...byId.get(String(tag.productId)), tagId: String(tag._id), sortOrder: tag.sortOrder ?? 0 })).filter((p: any) => p.id) });
});

shopContentRouter.post("/content/:videoId/products", requireUser, writeLimit, async (req, res) => {
  const videoId = validId(String(req.params.videoId));
  const productId = String(req.body?.productId ?? "").trim();
  if (!videoId || !productId) return res.status(400).json({ error: "Valid videoId and productId are required" });
  const db = await getDb();
  const video = await db.collection("videos").findOne({ _id: videoId, ownerId: req.userId }, { projection: { _id: 1, status: 1 } });
  if (!video) return res.status(404).json({ error: "Video not found or not owned by you" });
  if (video.status !== "PUBLISHED" && video.status !== "READY") return res.status(400).json({ error: "Only ready or published content can be shoppable" });
  const product = await db.collection("shop_products").findOne({ id: productId, status: "ACTIVE" });
  if (!product) return res.status(404).json({ error: "Active product not found" });

  const userId = req.userId!.toHexString();
  const sellerId = String(product.sellerId);
  const canTagOwnProduct = sellerId === userId;
  const membership = await db.collection("shop_affiliate_memberships").findOne({
    offerId: { $in: await db.collection("shop_affiliate_offers").find({ productId, status: "ACTIVE" }).project({ id: 1 }).map((x: any) => x.id).toArray() },
    creatorId: userId,
    status: "ACTIVE"
  });
  if (!canTagOwnProduct && !membership) return res.status(403).json({ error: "Join the product's active affiliate offer before tagging it" });

  const existing = await db.collection("video_shop_products").findOne({ videoId, productId, creatorId: userId });
  if (existing) return res.json({ tag: existing, alreadyTagged: true });
  const count = await db.collection("video_shop_products").countDocuments({ videoId, creatorId: userId });
  if (count >= 10) return res.status(400).json({ error: "A post can tag up to 10 Shop products" });
  const tag = { videoId, productId, creatorId: userId, sellerId, sortOrder: count, createdAt: new Date() };
  const result = await db.collection("video_shop_products").insertOne(tag);
  return res.status(201).json({ tag: { ...tag, id: result.insertedId.toHexString() } });
});

shopContentRouter.delete("/content/:videoId/products/:productId", requireUser, writeLimit, async (req, res) => {
  const videoId = validId(String(req.params.videoId));
  const productId = String(req.params.productId);
  if (!videoId || !productId) return res.status(400).json({ error: "Invalid video or product id" });
  const db = await getDb();
  const result = await db.collection("video_shop_products").deleteOne({ videoId, productId, creatorId: req.userId!.toHexString() });
  if (!result.deletedCount) return res.status(404).json({ error: "Shop product tag not found" });
  return res.json({ ok: true });
});
