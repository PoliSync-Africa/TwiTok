import { Db, ObjectId } from "mongodb";

export const SUPPORTED_STT_LANGUAGES = [
  "en","fr","ar","sw","tw","ha","yo","ig","zu","xh","am","pt"
] as const;

export type CaptionSource = "CREATOR" | "AUTO_STT" | "TRANSLATED";
export type TranscriptionStatus = "QUEUED" | "PROCESSING" | "SUCCEEDED" | "FAILED";

export async function ensureTranscriptionIndexes(db: Db) {
  await Promise.all([
    db.collection("transcription_jobs").createIndex({ videoId: 1 }, { unique: true }),
    db.collection("transcription_jobs").createIndex({ status: 1, createdAt: 1 }),
    db.collection("transcription_jobs").createIndex({ userId: 1, createdAt: 1 }),
    db.collection("video_captions").createIndex({ videoId: 1, startMs: 1 })
  ]);
}

export async function queueTranscription(
  db: Db,
  userId: ObjectId,
  videoId: ObjectId,
  language?: string
) {
  const video = await db.collection("videos").findOne({ _id: videoId, ownerId: userId });
  if (!video) throw new Error("Video not found");
  const requestedLanguage = language && SUPPORTED_STT_LANGUAGES.includes(language as any) ? language : "auto";
  const now = new Date();

  await db.collection("transcription_jobs").updateOne(
    { videoId },
    {
      $setOnInsert: {
        videoId,
        userId,
        status: "QUEUED" satisfies TranscriptionStatus,
        language: requestedLanguage,
        createdAt: now
      },
      $set: { updatedAt: now }
    },
    { upsert: true }
  );

  return db.collection("transcription_jobs").findOne({ videoId });
}

export async function getTranscription(db: Db, userId: ObjectId, videoId: ObjectId) {
  const video = await db.collection("videos").findOne({ _id: videoId, ownerId: userId }, { projection: { _id: 1 } });
  if (!video) throw new Error("Video not found");
  const job = await db.collection("transcription_jobs").findOne({ videoId });
  const captions = await db.collection("video_captions")
    .find({ videoId })
    .sort({ startMs: 1 })
    .toArray();
  return { job, captions };
}
