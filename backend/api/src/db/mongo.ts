import { MongoClient, type Db } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (db) return db;

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME ?? "twitok";

  if (!uri) throw new Error("MONGODB_URI is not configured");

  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);

  await db.collection("owner_accounts").createIndex({ email: 1 }, { unique: true });
  await db.collection("admin_sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection("audit_logs").createIndex({ createdAt: -1 });
  await db.collection("promotion_campaigns").createIndex({ ownerId: 1, createdAt: -1 });
  await db.collection("promotion_campaigns").createIndex({ status: 1, startAt: 1, endAt: 1 });
  await db.collection("promotion_payments").createIndex({ reference: 1 }, { unique: true });
  await db.collection("promotion_payments").createIndex({ userId: 1, createdAt: -1 });
  await db.collection("video_shop_products").createIndex({ videoId: 1, sortOrder: 1 }),
    db.collection("video_shop_products").createIndex({ productId: 1, createdAt: -1 }),
    db.collection("video_shop_products").createIndex({ creatorId: 1, createdAt: -1 }),
    db.collection("shop_products").createIndex({ status: 1, createdAt: -1 });
  await db.collection("shop_products").createIndex({ name: "text", description: "text" });
  await db.collection("shop_products").createIndex({ sellerId: 1, createdAt: -1 });
  await db.collection("shop_carts").createIndex({ userId: 1 }, { unique: true });
  await db.collection("shop_orders").createIndex({ buyerId: 1, createdAt: -1 });
  await db.collection("shop_orders").createIndex({ idempotencyKey: 1, buyerId: 1 }, { unique: true });
  await db.collection("shop_payments").createIndex({ reference: 1 }, { unique: true });
  await db.collection("shop_payments").createIndex({ orderId: 1, createdAt: -1 });
  await db.collection("shop_payments").createIndex({ userId: 1, createdAt: -1 });
  await db.collection("shop_orders").createIndex({ "items.sellerId": 1, status: 1, createdAt: -1 });
  await db.collection("shop_products").createIndex({ sellerId: 1, status: 1, updatedAt: -1 });
  // High-volume feed/video access paths for large published-video corpora.
  await db.collection("videos").createIndex({ status: 1, visibility: 1, publishedAt: -1, _id: -1 });
  await db.collection("videos").createIndex({ ownerId: 1, status: 1, visibility: 1, publishedAt: -1 });
  await db.collection("videos").createIndex({ countryCode: 1, status: 1, visibility: 1, publishedAt: -1 });
  await db.collection("shop_returns").createIndex({ orderId: 1, createdAt: -1 });
  await db.collection("shop_returns").createIndex({ buyerId: 1, createdAt: -1 });
  await db.collection("shop_refunds").createIndex({ orderId: 1, returnId: 1 }, { unique: true });
  await db.collection("shop_refunds").createIndex({ sellerId: 1, status: 1, createdAt: -1 });
  await db.collection("shop_payouts").createIndex({ sellerId: 1, status: 1, createdAt: -1 });
  await db.collection("shop_payout_accounts").createIndex({ sellerId: 1 }, { unique: true });
  await db.collection("shop_seller_shipments").createIndex({ orderId: 1, sellerId: 1 }, { unique: true });
  await db.collection("shop_seller_shipments").createIndex({ sellerId: 1, status: 1, updatedAt: -1 });
  await db.collection("shop_affiliate_offers").createIndex({ productId: 1, sellerId: 1, status: 1 }, { unique: true });
  await db.collection("shop_affiliate_offers").createIndex({ status: 1, createdAt: -1 });
  await db.collection("shop_affiliate_memberships").createIndex({ offerId: 1, creatorId: 1 }, { unique: true });
  await db.collection("shop_affiliate_links").createIndex({ code: 1 }, { unique: true });
  await db.collection("shop_affiliate_links").createIndex({ creatorId: 1, createdAt: -1 });
  await db.collection("shop_affiliate_commissions").createIndex({ orderId: 1, creatorId: 1 }, { unique: true });
  await db.collection("shop_affiliate_commissions").createIndex({ creatorId: 1, status: 1, createdAt: -1 });
  await db.collection("live_shop_products").createIndex({ streamId: 1, sortOrder: 1 });
  await db.collection("live_shop_products").createIndex({ streamId: 1, productId: 1 }, { unique: true });
  await db.collection("live_shop_products").createIndex({ hostUserId: 1, createdAt: -1 });
  await db.collection("live_shop_events").createIndex({ streamId: 1, createdAt: -1 });
  await db.collection("live_shop_events").createIndex({ streamId: 1, productId: 1, event: 1, createdAt: -1 });
  // Feed engagement indexes: keep per-video counters and viewer-state lookups bounded.
  await db.collection("feed_events").createIndex({ videoId: 1, userId: 1, createdAt: -1 });
  await db.collection("video_likes").createIndex({ videoId: 1, userId: 1 });
  await db.collection("video_comments").createIndex({ videoId: 1, status: 1 });
  await db.collection("video_shares").createIndex({ videoId: 1 });
  await db.collection("video_saves").createIndex({ videoId: 1, userId: 1 });
  await db.collection("video_reposts").createIndex({ videoId: 1, userId: 1 });

  return db;
}
