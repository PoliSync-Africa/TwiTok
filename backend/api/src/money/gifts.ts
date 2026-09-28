import type { Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { CREATOR_DIAMONDS_PER_COIN, DIAMOND_CASH_VALUE_USD } from "./wallet.js";

export const GIFT_CATALOG = [
  { giftId: "rose", name: "Rose", coins: 1, animation: "rose" },
  { giftId: "heart", name: "Heart", coins: 5, animation: "heart" },
  { giftId: "clap", name: "Clap", coins: 10, animation: "clap" },
  { giftId: "kente", name: "Kente", coins: 50, animation: "kente" },
  { giftId: "gold_drum", name: "Golden Drum", coins: 100, animation: "drum" },
  { giftId: "royal_crown", name: "Royal Crown", coins: 300, animation: "crown" },
  { giftId: "golden_lion", name: "Golden Lion", coins: 500, animation: "lion" },
  { giftId: "diamond_kingdom", name: "Diamond Kingdom", coins: 1500, animation: "diamond" },
  { giftId: "usa_flag", name: "USA Flag", coins: 300, animation: "usa_flag" },
  { giftId: "germany_flag", name: "Germany Flag", coins: 300, animation: "germany_flag" },
  { giftId: "canada_flag", name: "Canada Flag", coins: 300, animation: "canada_flag" },
  { giftId: "uk_flag", name: "UK Flag", coins: 300, animation: "uk_flag" },
  { giftId: "algeria_flag", name: "Algeria Flag", coins: 500, animation: "algeria_flag" },
  { giftId: "angola_flag", name: "Angola Flag", coins: 500, animation: "angola_flag" },
  { giftId: "benin_flag", name: "Benin Flag", coins: 500, animation: "benin_flag" },
  { giftId: "botswana_flag", name: "Botswana Flag", coins: 500, animation: "botswana_flag" },
  { giftId: "burkina_faso_flag", name: "Burkina Faso Flag", coins: 500, animation: "burkina_faso_flag" },
  { giftId: "burundi_flag", name: "Burundi Flag", coins: 500, animation: "burundi_flag" },
  { giftId: "cabo_verde_flag", name: "Cabo Verde Flag", coins: 500, animation: "cabo_verde_flag" },
  { giftId: "cameroon_flag", name: "Cameroon Flag", coins: 500, animation: "cameroon_flag" },
  { giftId: "central_african_republic_flag", name: "Central African Republic Flag", coins: 500, animation: "central_african_republic_flag" },
  { giftId: "chad_flag", name: "Chad Flag", coins: 500, animation: "chad_flag" },
  { giftId: "comoros_flag", name: "Comoros Flag", coins: 500, animation: "comoros_flag" },
  { giftId: "congo_flag", name: "Congo Flag", coins: 500, animation: "congo_flag" },
  { giftId: "dr_congo_flag", name: "DR Congo Flag", coins: 500, animation: "dr_congo_flag" },
  { giftId: "cote_divoire_flag", name: "Côte d’Ivoire Flag", coins: 500, animation: "cote_divoire_flag" },
  { giftId: "djibouti_flag", name: "Djibouti Flag", coins: 500, animation: "djibouti_flag" },
  { giftId: "egypt_flag", name: "Egypt Flag", coins: 500, animation: "egypt_flag" },
  { giftId: "equatorial_guinea_flag", name: "Equatorial Guinea Flag", coins: 500, animation: "equatorial_guinea_flag" },
  { giftId: "eritrea_flag", name: "Eritrea Flag", coins: 500, animation: "eritrea_flag" },
  { giftId: "eswatini_flag", name: "Eswatini Flag", coins: 500, animation: "eswatini_flag" },
  { giftId: "ethiopia_flag", name: "Ethiopia Flag", coins: 500, animation: "ethiopia_flag" },
  { giftId: "gabon_flag", name: "Gabon Flag", coins: 500, animation: "gabon_flag" },
  { giftId: "gambia_flag", name: "Gambia Flag", coins: 500, animation: "gambia_flag" },
  { giftId: "ghana_flag", name: "Ghana Flag", coins: 500, animation: "ghana_flag" },
  { giftId: "guinea_flag", name: "Guinea Flag", coins: 500, animation: "guinea_flag" },
  { giftId: "guinea_bissau_flag", name: "Guinea-Bissau Flag", coins: 500, animation: "guinea_bissau_flag" },
  { giftId: "kenya_flag", name: "Kenya Flag", coins: 500, animation: "kenya_flag" },
  { giftId: "lesotho_flag", name: "Lesotho Flag", coins: 500, animation: "lesotho_flag" },
  { giftId: "liberia_flag", name: "Liberia Flag", coins: 500, animation: "liberia_flag" },
  { giftId: "libya_flag", name: "Libya Flag", coins: 500, animation: "libya_flag" },
  { giftId: "madagascar_flag", name: "Madagascar Flag", coins: 500, animation: "madagascar_flag" },
  { giftId: "malawi_flag", name: "Malawi Flag", coins: 500, animation: "malawi_flag" },
  { giftId: "mali_flag", name: "Mali Flag", coins: 500, animation: "mali_flag" },
  { giftId: "mauritania_flag", name: "Mauritania Flag", coins: 500, animation: "mauritania_flag" },
  { giftId: "mauritius_flag", name: "Mauritius Flag", coins: 500, animation: "mauritius_flag" },
  { giftId: "morocco_flag", name: "Morocco Flag", coins: 500, animation: "morocco_flag" },
  { giftId: "mozambique_flag", name: "Mozambique Flag", coins: 500, animation: "mozambique_flag" },
  { giftId: "namibia_flag", name: "Namibia Flag", coins: 500, animation: "namibia_flag" },
  { giftId: "niger_flag", name: "Niger Flag", coins: 500, animation: "niger_flag" },
  { giftId: "nigeria_flag", name: "Nigeria Flag", coins: 500, animation: "nigeria_flag" },
  { giftId: "rwanda_flag", name: "Rwanda Flag", coins: 500, animation: "rwanda_flag" },
  { giftId: "sao_tome_flag", name: "São Tomé and Príncipe Flag", coins: 500, animation: "sao_tome_flag" },
  { giftId: "senegal_flag", name: "Senegal Flag", coins: 500, animation: "senegal_flag" },
  { giftId: "seychelles_flag", name: "Seychelles Flag", coins: 500, animation: "seychelles_flag" },
  { giftId: "sierra_leone_flag", name: "Sierra Leone Flag", coins: 500, animation: "sierra_leone_flag" },
  { giftId: "somalia_flag", name: "Somalia Flag", coins: 500, animation: "somalia_flag" },
  { giftId: "south_africa_flag", name: "South Africa Flag", coins: 500, animation: "south_africa_flag" },
  { giftId: "south_sudan_flag", name: "South Sudan Flag", coins: 500, animation: "south_sudan_flag" },
  { giftId: "sudan_flag", name: "Sudan Flag", coins: 500, animation: "sudan_flag" },
  { giftId: "tanzania_flag", name: "Tanzania Flag", coins: 500, animation: "tanzania_flag" },
  { giftId: "togo_flag", name: "Togo Flag", coins: 500, animation: "togo_flag" },
  { giftId: "tunisia_flag", name: "Tunisia Flag", coins: 500, animation: "tunisia_flag" },
  { giftId: "uganda_flag", name: "Uganda Flag", coins: 500, animation: "uganda_flag" },
  { giftId: "zambia_flag", name: "Zambia Flag", coins: 500, animation: "zambia_flag" },
  { giftId: "zimbabwe_flag", name: "Zimbabwe Flag", coins: 500, animation: "zimbabwe_flag" },
  { giftId: "twitok_cap", name: "TwiTok Cap", coins: 500, animation: "twitok_cap" },
  { giftId: "money_gun", name: "Money Gun", coins: 750, animation: "money_gun" },
  { giftId: "wedding_rings", name: "Wedding Rings", coins: 1000, animation: "wedding_rings" },
  { giftId: "flying_angels", name: "Flying Angels", coins: 1500, animation: "flying_angels" }
] as const;

export async function initializeGiftIndexes(db: Db) {
  await Promise.all([
    db.collection("gift_transactions").createIndex({ transactionId: 1 }, { unique: true }),
    db.collection("gift_transactions").createIndex({ senderId: 1, createdAt: -1 }),
    db.collection("gift_transactions").createIndex({ receiverId: 1, createdAt: -1 }),
    db.collection("gift_transactions").createIndex({ senderId: 1, idempotencyKey: 1 }, { unique: true })
  ]);
}

export async function sendGift(db: Db, input: {
  senderId: string; receiverId: string; giftId: string; quantity?: number; idempotencyKey: string;
  context: "LIVE"|"VIDEO"|"COMMENT"; videoId?: string;
}) {
  if (input.senderId === input.receiverId) throw new Error("You cannot gift yourself");
  const gift = GIFT_CATALOG.find((item) => item.giftId === input.giftId);
  if (!gift) throw new Error("Gift not found");
  const idempotencyKey = String(input.idempotencyKey ?? "").trim();
  if (!idempotencyKey || idempotencyKey.length > 128) throw new Error("A valid Idempotency-Key is required");
  const existing = await db.collection("gift_transactions").findOne({ senderId: input.senderId, idempotencyKey });
  if (existing) return { transactionId: existing.transactionId, videoId: existing.videoId ?? null, duplicate: true, gift: GIFT_CATALOG.find((item) => item.giftId === existing.giftId), quantity: existing.quantity, coinsSpent: existing.coinsSpent, diamondsAwarded: existing.diamondsAwarded, creatorSharePercent: 30, platformSharePercent: 70 };
  const quantity = Math.max(1, Math.min(100, Math.floor(input.quantity ?? 1)));
  const coins = gift.coins * quantity;
  const diamonds = Number((coins * CREATOR_DIAMONDS_PER_COIN).toFixed(2));
  const transactionId = randomUUID();
  const now = new Date();
  const session = db.client?.startSession();
  if (!session) throw new Error("MongoDB session unavailable");

  try {
    await session.withTransaction(async () => {
      await db.collection("wallets").updateOne(
        { userId: input.senderId },
        { $setOnInsert: { userId: input.senderId, coinBalance: 0, diamondBalance: 0, cashBalanceUsd: 0, createdAt: now, updatedAt: now } },
        { upsert: true, session }
      );
      await db.collection("wallets").updateOne(
        { userId: input.receiverId },
        { $setOnInsert: { userId: input.receiverId, coinBalance: 0, diamondBalance: 0, cashBalanceUsd: 0, createdAt: now, updatedAt: now } },
        { upsert: true, session }
      );
      const debit = await db.collection("wallets").updateOne(
        { userId: input.senderId, coinBalance: { $gte: coins } },
        { $inc: { coinBalance: -coins }, $set: { updatedAt: now } }, { session }
      );
      if (debit.modifiedCount !== 1) throw new Error("Insufficient Coins");
      await db.collection("wallets").updateOne(
        { userId: input.receiverId },
        { $inc: { diamondBalance: diamonds, cashBalanceUsd: Number((diamonds * DIAMOND_CASH_VALUE_USD).toFixed(6)) }, $set: { updatedAt: now } }, { session }
      );
      await db.collection("gift_transactions").insertOne({
        transactionId, senderId: input.senderId, receiverId: input.receiverId, idempotencyKey,
        giftId: gift.giftId, giftName: gift.name, quantity, coinsSpent: coins,
        diamondsAwarded: diamonds, platformSharePercent: 70, creatorSharePercent: 30,
        context: input.context, videoId: input.videoId ?? null, createdAt: now
      }, { session });
      await db.collection("wallet_ledger").insertMany([
        { transactionId: randomUUID(), userId: input.senderId, type: "GIFT_SENT", coinsDelta: -coins, diamondsDelta: 0, cashDeltaUsd: 0, referenceId: transactionId, createdAt: now },
        { transactionId: randomUUID(), userId: input.receiverId, type: "GIFT_RECEIVED", coinsDelta: 0, diamondsDelta: diamonds, cashDeltaUsd: Number((diamonds * DIAMOND_CASH_VALUE_USD).toFixed(6)), referenceId: transactionId, createdAt: now }
      ], { session });
    });
  } finally { await session.endSession(); }
  return { transactionId, videoId: input.videoId ?? null, gift, quantity, coinsSpent: coins, diamondsAwarded: diamonds, creatorSharePercent: 30, platformSharePercent: 70 };
}
