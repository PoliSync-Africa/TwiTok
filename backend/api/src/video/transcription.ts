import { ObjectId, type Db } from "mongodb";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

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


export async function updateCaptions(
  db: Db,
  userId: ObjectId,
  videoId: ObjectId,
  captions: Array<{ text: string; startMs: number; endMs: number }>
) {
  const video = await db.collection("videos").findOne({ _id: videoId, ownerId: userId });
  if (!video) throw new Error("Video not found");
  const safe = [];
  for (const item of captions.slice(0, 1000)) {
    const text = String(item.text ?? "").trim().slice(0, 500);
    const startMs = Math.max(0, Number(item.startMs ?? 0));
    const endMs = Math.max(startMs + 100, Number(item.endMs ?? startMs + 100));
    if (!text || !Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    const decision = await (await import("../safety/engine.js")).evaluateText(db, {
      userId: userId.toHexString(), contentId: videoId.toHexString(), text, actionType: "VIDEO_CAPTION"
    });
    if (decision.decision === "BLOCK") continue;
    safe.push({ videoId, source: "CREATOR", language: video.autoCaptionLanguage ?? "auto", text, startMs, endMs, createdAt: new Date(), updatedAt: new Date() });
  }
  await db.collection("video_captions").deleteMany({ videoId });
  if (safe.length) await db.collection("video_captions").insertMany(safe);
  const trackUrl = await regenerateCaptionTrack(db, videoId, safe);
  if (trackUrl) await db.collection("videos").updateOne({ _id: videoId }, { $set: { autoCaptionsUrl: trackUrl, autoCaptionsStatus: "READY", updatedAt: new Date() } });
  return safe;
}

function captionVttTime(ms: number) {
  const total = Math.max(0, Math.round(ms));
  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${String(total % 1000).padStart(3,"0")}`;
}

export async function regenerateCaptionTrack(db: Db, videoId: ObjectId, captions: any[]) {
  const bucket = process.env.MEDIA_BUCKET ?? "";
  const key = `videos/${videoId.toHexString()}/captions/creator.vtt`;
  const publicBase = (process.env.MEDIA_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  if (!bucket || !process.env.MEDIA_S3_ACCESS_KEY_ID || !process.env.MEDIA_S3_SECRET_ACCESS_KEY) return null;
  const s3 = new S3Client({
    region: process.env.MEDIA_S3_REGION ?? "auto",
    endpoint: process.env.MEDIA_S3_ENDPOINT || undefined,
    forcePathStyle: process.env.MEDIA_S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: process.env.MEDIA_S3_ACCESS_KEY_ID, secretAccessKey: process.env.MEDIA_S3_SECRET_ACCESS_KEY }
  });
  const lines = ["WEBVTT", ""];
  captions.forEach((item, index) => {
    lines.push(String(index + 1), `${captionVttTime(item.startMs)} --> ${captionVttTime(item.endMs)}`, item.text, "");
  });
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.from(lines.join("\n"), "utf8"), ContentType: "text/vtt", CacheControl: "no-cache" }));
  return publicBase ? `${publicBase}/${key}` : key;
}
