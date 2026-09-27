import { Db } from "mongodb";

export const STICKERS = [
  { id: "africa", name: "Africa", emoji: "🌍", category: "Africa" },
  { id: "ghana", name: "Ghana", emoji: "🇬🇭", category: "Africa" },
  { id: "nigeria", name: "Nigeria", emoji: "🇳🇬", category: "Africa" },
  { id: "kenya", name: "Kenya", emoji: "🇰🇪", category: "Africa" },
  { id: "south-africa", name: "South Africa", emoji: "🇿🇦", category: "Africa" },
  { id: "celebrate", name: "Celebrate", emoji: "🎉", category: "Reactions" },
  { id: "love", name: "Love", emoji: "❤️", category: "Reactions" },
  { id: "fire", name: "Fire", emoji: "🔥", category: "Reactions" },
  { id: "laugh", name: "Laugh", emoji: "😂", category: "Reactions" },
  { id: "wow", name: "Wow", emoji: "😮", category: "Reactions" },
  { id: "clap", name: "Clap", emoji: "👏", category: "Reactions" },
  { id: "dance", name: "Dance", emoji: "💃", category: "Culture" },
  { id: "drum", name: "Drum", emoji: "🥁", category: "Culture" },
  { id: "music", name: "Music", emoji: "🎶", category: "Culture" },
  { id: "community", name: "Community", emoji: "🤝", category: "Culture" },
  { id: "food", name: "Food", emoji: "🍲", category: "Culture" }
] as const;

export function listStickers(category?: string) {
  return category ? STICKERS.filter(x => x.category === category) : STICKERS;
}

export function getSticker(id: string) {
  return STICKERS.find(x => x.id === id) ?? null;
}

export async function ensureStickerIndexes(db: Db) {
  await db.collection("sticker_usage").createIndex({ stickerId: 1, createdAt: -1 });
}
