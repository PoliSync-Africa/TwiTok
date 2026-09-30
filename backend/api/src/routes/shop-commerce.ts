import { Router } from "express";
import { getDb } from "../db/mongo.js";
import { requireUser } from "../auth/middleware.js";
import { TWITOK_SHOP_PLATFORM_FEE_PERCENT } from "../config/shop-fees.js";

export const shopCommerceRouter = Router();

shopCommerceRouter.get("/products", async (req, res) => {
  const db = await getDb();
  const query = String(req.query.q ?? "").trim();
  const filter = query ? { status: "ACTIVE", $text: { $search: query } } : { status: "ACTIVE" };
  const products = await db.collection("shop_products").find(filter).sort({ createdAt: -1 }).limit(50).toArray();
  res.json({ products });
});

shopCommerceRouter.get("/products/:productId", async (req, res) => {
  const db = await getDb();
  const product = await db.collection("shop_products").findOne({ id: req.params.productId, status: "ACTIVE" });
  if (!product) return res.status(404).json({ error: "Product not found" });
  return res.json({ product });
});

shopCommerceRouter.post("/products", requireUser, async (req, res) => {
  const db = await getDb();
  const body = req.body ?? {};
  if (!body.name || body.priceMinor == null || !body.currency) {
    return res.status(400).json({ error: "name, priceMinor and currency are required" });
  }
  const id = crypto.randomUUID();
  const product = {
    id,
    sellerId: req.userId,
    name: String(body.name).trim(),
    description: String(body.description ?? ""),
    priceMinor: Math.max(0, Math.round(Number(body.priceMinor))),
    currency: String(body.currency).toUpperCase(),
    images: Array.isArray(body.images) ? body.images : [],
    variants: Array.isArray(body.variants) ? body.variants : [],
    stock: Math.max(0, Math.floor(Number(body.stock ?? 0))),
    status: "DRAFT",
    createdAt: new Date(),
    updatedAt: new Date()
  };
  await db.collection("shop_products").insertOne(product);
  return res.status(201).json({ product, platformFeePercent: TWITOK_SHOP_PLATFORM_FEE_PERCENT });
});

shopCommerceRouter.get("/config", (_req, res) => {
  res.json({ platformFeePercent: TWITOK_SHOP_PLATFORM_FEE_PERCENT, currencyModel: "LOCAL_SELLER_CURRENCY" });
});
