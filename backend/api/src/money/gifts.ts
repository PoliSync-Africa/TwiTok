import type { Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { CREATOR_DIAMONDS_PER_COIN, DIAMOND_CASH_VALUE_USD } from "./wallet.js";

export const GIFT_CATALOG = [
  { giftId: "rose", name: "Rose", coins: 3, animation: "rose" },
  { giftId: "heart", name: "Heart", coins: 4, animation: "heart" },
  { giftId: "clap", name: "Clap", coins: 8, animation: "clap" },
  { giftId: "kente", name: "Kente", coins: 24, animation: "kente" },
  { giftId: "gold_drum", name: "Golden Drum", coins: 80, animation: "drum" },
  { giftId: "royal_crown", name: "Royal Crown", coins: 240, animation: "crown" },
  { giftId: "golden_lion", name: "Golden Lion", coins: 400, animation: "lion" },
  { giftId: "diamond_kingdom", name: "Diamond Kingdom", coins: 1200, animation: "diamond" },
  { giftId: "usa_flag", name: "USA Flag", coins: 100, animation: "usa_flag" },
  { giftId: "germany_flag", name: "Germany Flag", coins: 80, animation: "germany_flag" },
  { giftId: "canada_flag", name: "Canada Flag", coins: 80, animation: "canada_flag" },
  { giftId: "uk_flag", name: "UK Flag", coins: 80, animation: "uk_flag" },
  { giftId: "algeria_flag", name: "Algeria Flag", coins: 100, animation: "algeria_flag" },
  { giftId: "angola_flag", name: "Angola Flag", coins: 100, animation: "angola_flag" },
  { giftId: "benin_flag", name: "Benin Flag", coins: 100, animation: "benin_flag" },
  { giftId: "botswana_flag", name: "Botswana Flag", coins: 100, animation: "botswana_flag" },
  { giftId: "burkina_faso_flag", name: "Burkina Faso Flag", coins: 100, animation: "burkina_faso_flag" },
  { giftId: "burundi_flag", name: "Burundi Flag", coins: 100, animation: "burundi_flag" },
  { giftId: "cabo_verde_flag", name: "Cabo Verde Flag", coins: 100, animation: "cabo_verde_flag" },
  { giftId: "cameroon_flag", name: "Cameroon Flag", coins: 100, animation: "cameroon_flag" },
  { giftId: "central_african_republic_flag", name: "Central African Republic Flag", coins: 100, animation: "central_african_republic_flag" },
  { giftId: "chad_flag", name: "Chad Flag", coins: 100, animation: "chad_flag" },
  { giftId: "comoros_flag", name: "Comoros Flag", coins: 100, animation: "comoros_flag" },
  { giftId: "congo_flag", name: "Congo Flag", coins: 100, animation: "congo_flag" },
  { giftId: "dr_congo_flag", name: "DR Congo Flag", coins: 100, animation: "dr_congo_flag" },
  { giftId: "cote_divoire_flag", name: "Côte d’Ivoire Flag", coins: 100, animation: "cote_divoire_flag" },
  { giftId: "djibouti_flag", name: "Djibouti Flag", coins: 100, animation: "djibouti_flag" },
  { giftId: "egypt_flag", name: "Egypt Flag", coins: 100, animation: "egypt_flag" },
  { giftId: "equatorial_guinea_flag", name: "Equatorial Guinea Flag", coins: 100, animation: "equatorial_guinea_flag" },
  { giftId: "eritrea_flag", name: "Eritrea Flag", coins: 100, animation: "eritrea_flag" },
  { giftId: "eswatini_flag", name: "Eswatini Flag", coins: 100, animation: "eswatini_flag" },
  { giftId: "ethiopia_flag", name: "Ethiopia Flag", coins: 100, animation: "ethiopia_flag" },
  { giftId: "gabon_flag", name: "Gabon Flag", coins: 100, animation: "gabon_flag" },
  { giftId: "gambia_flag", name: "Gambia Flag", coins: 100, animation: "gambia_flag" },
  { giftId: "ghana_flag", name: "Ghana Flag", coins: 100, animation: "ghana_flag" },
  { giftId: "guinea_flag", name: "Guinea Flag", coins: 100, animation: "guinea_flag" },
  { giftId: "guinea_bissau_flag", name: "Guinea-Bissau Flag", coins: 100, animation: "guinea_bissau_flag" },
  { giftId: "kenya_flag", name: "Kenya Flag", coins: 100, animation: "kenya_flag" },
  { giftId: "lesotho_flag", name: "Lesotho Flag", coins: 100, animation: "lesotho_flag" },
  { giftId: "liberia_flag", name: "Liberia Flag", coins: 100, animation: "liberia_flag" },
  { giftId: "libya_flag", name: "Libya Flag", coins: 100, animation: "libya_flag" },
  { giftId: "madagascar_flag", name: "Madagascar Flag", coins: 100, animation: "madagascar_flag" },
  { giftId: "malawi_flag", name: "Malawi Flag", coins: 100, animation: "malawi_flag" },
  { giftId: "mali_flag", name: "Mali Flag", coins: 100, animation: "mali_flag" },
  { giftId: "mauritania_flag", name: "Mauritania Flag", coins: 100, animation: "mauritania_flag" },
  { giftId: "mauritius_flag", name: "Mauritius Flag", coins: 100, animation: "mauritius_flag" },
  { giftId: "morocco_flag", name: "Morocco Flag", coins: 100, animation: "morocco_flag" },
  { giftId: "mozambique_flag", name: "Mozambique Flag", coins: 100, animation: "mozambique_flag" },
  { giftId: "namibia_flag", name: "Namibia Flag", coins: 100, animation: "namibia_flag" },
  { giftId: "niger_flag", name: "Niger Flag", coins: 100, animation: "niger_flag" },
  { giftId: "nigeria_flag", name: "Nigeria Flag", coins: 100, animation: "nigeria_flag" },
  { giftId: "rwanda_flag", name: "Rwanda Flag", coins: 100, animation: "rwanda_flag" },
  { giftId: "sao_tome_flag", name: "São Tomé and Príncipe Flag", coins: 100, animation: "sao_tome_flag" },
  { giftId: "senegal_flag", name: "Senegal Flag", coins: 100, animation: "senegal_flag" },
  { giftId: "seychelles_flag", name: "Seychelles Flag", coins: 100, animation: "seychelles_flag" },
  { giftId: "sierra_leone_flag", name: "Sierra Leone Flag", coins: 100, animation: "sierra_leone_flag" },
  { giftId: "somalia_flag", name: "Somalia Flag", coins: 100, animation: "somalia_flag" },
  { giftId: "south_africa_flag", name: "South Africa Flag", coins: 100, animation: "south_africa_flag" },
  { giftId: "south_sudan_flag", name: "South Sudan Flag", coins: 100, animation: "south_sudan_flag" },
  { giftId: "sudan_flag", name: "Sudan Flag", coins: 100, animation: "sudan_flag" },
  { giftId: "tanzania_flag", name: "Tanzania Flag", coins: 100, animation: "tanzania_flag" },
  { giftId: "togo_flag", name: "Togo Flag", coins: 100, animation: "togo_flag" },
  { giftId: "tunisia_flag", name: "Tunisia Flag", coins: 100, animation: "tunisia_flag" },
  { giftId: "uganda_flag", name: "Uganda Flag", coins: 100, animation: "uganda_flag" },
  { giftId: "zambia_flag", name: "Zambia Flag", coins: 100, animation: "zambia_flag" },
  { giftId: "zimbabwe_flag", name: "Zimbabwe Flag", coins: 100, animation: "zimbabwe_flag" },
  { giftId: "africa_flag", name: "African Flag", coins: 100, animation: "africa_flag" },
  { giftId: "twitok_cap", name: "TwiTok Cap", coins: 100, animation: "twitok_cap" },
  { giftId: "money_gun", name: "Money Gun", coins: 500, animation: "money_gun" },
  { giftId: "wedding_rings", name: "Wedding Rings", coins: 800, animation: "wedding_rings" },
  { giftId: "flying_angel", name: "Flying Angel", coins: 1200, animation: "flying_angel" },
  { giftId: "france_flag", name: "France Flag", coins: 80, animation: "france_flag" },
  { giftId: "italy_flag", name: "Italy Flag", coins: 80, animation: "italy_flag" },
  { giftId: "japan_flag", name: "Japan Flag", coins: 80, animation: "japan_flag" },
  { giftId: "china_flag", name: "China Flag", coins: 80, animation: "china_flag" },
  { giftId: "luxury_yacht", name: "Luxury Yacht", coins: 5000, animation: "luxury_yacht" },
  { giftId: "private_jet", name: "Private Jet", coins: 10000, animation: "private_jet" },
  { giftId: "luxury_mansion", name: "Luxury Mansion", coins: 20000, animation: "luxury_mansion" },
  { giftId: "super_car", name: "Super Car", coins: 30000, animation: "super_car" },
  { giftId: "cash_bundle", name: "Cash Bundle", coins: 50000, animation: "cash_bundle" },
  { giftId: "money_bag", name: "Money Bag", coins: 100000, animation: "money_bag" },
  { giftId: "gold_bars", name: "Gold Bars", coins: 500000, animation: "gold_bars" },
  { giftId: "treasure_chest", name: "Treasure Chest", coins: 1000000, animation: "treasure_chest" },
  { giftId: "diamond_vault", name: "Diamond Vault", coins: 5000000, animation: "diamond_vault" },
  { giftId: "money_rain", name: "Money Rain", coins: 10000000, animation: "money_rain" },
  { giftId: "golden_tree", name: "Golden Tree", coins: 20000000, animation: "golden_tree" },
  { giftId: "fortune_dragon", name: "Fortune Dragon", coins: 50000000, animation: "fortune_dragon" },
  { giftId: "fireworks", name: "Fireworks", coins: 10000, animation: "fireworks" },
  { giftId: "birthday_cake", name: "Birthday Cake", coins: 50000, animation: "birthday_cake" },
  { giftId: "champagne", name: "Champagne", coins: 100000, animation: "champagne" },
  { giftId: "confetti", name: "Confetti", coins: 500000, animation: "confetti" },
  { giftId: "love_carriage", name: "Love Carriage", coins: 1000000, animation: "love_carriage" },
  { giftId: "sky_lantern", name: "Sky Lantern", coins: 2000000, animation: "sky_lantern" },
  { giftId: "stage_show", name: "Stage Show", coins: 5000000, animation: "stage_show" },
  { giftId: "festival_parade", name: "Festival Parade", coins: 10000000, animation: "festival_parade" },
  { giftId: "galaxy", name: "Galaxy", coins: 50000000, animation: "galaxy" },
  { giftId: "universe", name: "Universe", coins: 100000000, animation: "universe" },
  { giftId: "heavens_gate", name: "Heaven's Gate", coins: 200000000, animation: "heavens_gate" },
  { giftId: "atlantis", name: "Atlantis", coins: 500000000, animation: "atlantis" },
  { giftId: "phoenix", name: "Phoenix", coins: 1000000000, animation: "phoenix" },
  { giftId: "time_castle", name: "Time Castle", coins: 2000000000, animation: "time_castle" },
  { giftId: "eternal_love", name: "Eternal Love", coins: 5000000000, animation: "eternal_love" },
  { giftId: "twitok_legend", name: "TwiTok Legend", coins: 10000000000, animation: "twitok_legend" }
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
