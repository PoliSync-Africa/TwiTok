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
  await db.collection("shop_products").createIndex({ status: 1, createdAt: -1 });
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
  await db.collection("shop_returns").createIndex({ orderId: 1, createdAt: -1 });
  await db.collection("shop_returns").createIndex({ buyerId: 1, createdAt: -1 });

  return db;
}
