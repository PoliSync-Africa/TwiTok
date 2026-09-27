import { Db, ObjectId } from "mongodb";

export const TRANSLATION_LANGUAGES = [
  "en","fr","ar","sw","tw","ha","yo","ig","zu","xh","am","pt"
] as const;

export const LANGUAGE_NAMES: Record<string,string> = {
  en:"English", fr:"French", ar:"Arabic", sw:"Swahili", tw:"Twi", ha:"Hausa",
  yo:"Yoruba", ig:"Igbo", zu:"Zulu", xh:"Xhosa", am:"Amharic", pt:"Portuguese"
};

export async function ensureTranslationIndexes(db: Db) {
  await Promise.all([
    db.collection("translation_jobs").createIndex({ videoId: 1, targetLanguage: 1 }, { unique: true }),
    db.collection("translation_jobs").createIndex({ status: 1, createdAt: 1 }),
    db.collection("video_captions").createIndex({ videoId: 1, source: 1, language: 1, startMs: 1 })
  ]);
}

export async function queueCaptionTranslation(db: Db, userId: ObjectId, videoId: ObjectId, targetLanguage: string) {
  const video = await db.collection("videos").findOne({ _id: videoId, ownerId: userId });
  if (!video) throw new Error("Video not found");
  if (!TRANSLATION_LANGUAGES.includes(targetLanguage as any)) throw new Error("Unsupported translation language");
  const sourceLanguage = String(video.autoCaptionLanguage ?? "auto");
  if (sourceLanguage !== "auto" && sourceLanguage === targetLanguage) throw new Error("Target language matches source language");
  const now = new Date();
  await db.collection("translation_jobs").updateOne(
    { videoId, targetLanguage },
    { $setOnInsert: { videoId, userId, sourceLanguage, targetLanguage, status: "QUEUED", attempts: 0, createdAt: now }, $set: { updatedAt: now } },
    { upsert: true }
  );
  return db.collection("translation_jobs").findOne({ videoId, targetLanguage });
}

export async function getCaptionTracks(db: Db, videoId: ObjectId) {
  const rows = await db.collection("video_caption_tracks").find({ videoId, status: "READY" }).project({ _id: 0, language: 1, label: 1, url: 1, sourceLanguage: 1 }).sort({ language: 1 }).toArray();
  return rows;
}
