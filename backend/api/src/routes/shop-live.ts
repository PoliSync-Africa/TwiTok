import { Router } from "express";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { rateLimit } from "../security/rate-limit.js";

export const shopLiveRouter = Router();
const writeLimit = rateLimit({ windowMs: 60 * 1000, max: 30, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });

async function ownedLive(db: any, streamId: string, userId: string) {
  return db.collection("live_streams").findOne({ streamId, hostUserId: userId }, { projection: { streamId: 1, status: 1, hostUserId: 1 } });
}

shopLiveRouter.get("/live/:streamId/products", requireUser, async (req, res) => {
  const streamId = String(req.params.streamId);
  const db = await getDb();
  const stream = await db.collection("live_streams").findOne({ streamId }, { projection: { streamId: 1 } });
  if (!stream) return res.status(404).json({ error: "LIVE stream not found" });
  const tags = await db.collection("live_shop_products").find({ streamId }).sort({ sortOrder: 1, createdAt: 1 }).toArray();
  const ids = tags.map((x: any) => String(x.productId));
  const products = ids.length ? await db.collection("shop_products").find({ id: { $in: ids }, status: "ACTIVE" }).toArray() : [];
  const byId = new Map(products.map((p: any) => [String(p.id), p]));
  return res.json({
    products: tags.map((tag: any) => ({ ...byId.get(String(tag.productId)), tagId: String(tag._id), pinned: Boolean(tag.pinned), sortOrder: tag.sortOrder ?? 0 })).filter((p: any) => p.id),
    featuredProductId: tags.find((x: any) => x.pinned)?.productId ?? null
  });
});

shopLiveRouter.post("/live/:streamId/products", requireUser, writeLimit, async (req, res) => {
  const streamId = String(req.params.streamId);
  const productId = String(req.body?.productId ?? "").trim();
  if (!streamId || !productId) return res.status(400).json({ error: "streamId and productId are required" });
  const db = await getDb();
  const userId = req.userId!.toHexString();
  const stream = await ownedLive(db, streamId, userId);
  if (!stream) return res.status(404).json({ error: "LIVE stream not found or not owned by you" });
  if (stream.status === "ENDED") return res.status(400).json({ error: "Ended LIVE sessions cannot be updated" });
  const product = await db.collection("shop_products").findOne({ id: productId, status: "ACTIVE" });
  if (!product) return res.status(404).json({ error: "Active product not found" });

  const sellerId = String(product.sellerId);
  let allowed = sellerId === userId;
  if (!allowed) {
    const offers = await db.collection("shop_affiliate_offers").find({ productId, status: "ACTIVE" }).project({ id: 1 }).toArray();
    allowed = Boolean(await db.collection("shop_affiliate_memberships").findOne({
      offerId: { $in: offers.map((x: any) => x.id) }, creatorId: userId, status: "ACTIVE"
    }));
  }
  if (!allowed) return res.status(403).json({ error: "Join the product's active affiliate offer before adding it to LIVE shopping" });

  const existing = await db.collection("live_shop_products").findOne({ streamId, productId, hostUserId: userId });
  if (existing) return res.json({ tag: existing, alreadyAdded: true });
  const count = await db.collection("live_shop_products").countDocuments({ streamId, hostUserId: userId });
  if (count >= 20) return res.status(400).json({ error: "A LIVE session can feature up to 20 Shop products" });

  const tag = { streamId, productId, hostUserId: userId, sellerId, pinned: count === 0, sortOrder: count, createdAt: new Date(), updatedAt: new Date() };
  const result = await db.collection("live_shop_products").insertOne(tag);
  return res.status(201).json({ tag: { ...tag, id: result.insertedId.toHexString() } });
});

shopLiveRouter.post("/live/:streamId/products/:productId/pin", requireUser, writeLimit, async (req, res) => {
  const streamId = String(req.params.streamId);
  const productId = String(req.params.productId);
  const db = await getDb();
  const userId = req.userId!.toHexString();
  const stream = await ownedLive(db, streamId, userId);
  if (!stream) return res.status(404).json({ error: "LIVE stream not found or not owned by you" });
  if (stream.status === "ENDED") return res.status(400).json({ error: "Ended LIVE sessions cannot be updated" });
  const tag = await db.collection("live_shop_products").findOne({ streamId, productId, hostUserId: userId });
  if (!tag) return res.status(404).json({ error: "Product is not attached to this LIVE" });
  await db.collection("live_shop_products").updateMany({ streamId, hostUserId: userId }, { $set: { pinned: false, updatedAt: new Date() } });
  await db.collection("live_shop_products").updateOne({ _id: tag._id }, { $set: { pinned: true, updatedAt: new Date() } });
  return res.json({ ok: true, featuredProductId: productId });
});

shopLiveRouter.delete("/live/:streamId/products/:productId", requireUser, writeLimit, async (req, res) => {
  const streamId = String(req.params.streamId);
  const productId = String(req.params.productId);
  const db = await getDb();
  const userId = req.userId!.toHexString();
  const stream = await ownedLive(db, streamId, userId);
  if (!stream) return res.status(404).json({ error: "LIVE stream not found or not owned by you" });
  const result = await db.collection("live_shop_products").deleteOne({ streamId, productId, hostUserId: userId });
  if (!result.deletedCount) return res.status(404).json({ error: "LIVE Shop product not found" });
  const remaining = await db.collection("live_shop_products").find({ streamId, hostUserId: userId }).sort({ sortOrder: 1 }).toArray();
  if (remaining.length && !remaining.some((x: any) => x.pinned)) {
    await db.collection("live_shop_products").updateOne({ _id: remaining[0]._id }, { $set: { pinned: true, updatedAt: new Date() } });
  }
  return res.json({ ok: true });
});
