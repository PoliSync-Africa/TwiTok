import { ObjectId, type Db } from "mongodb";
import { verifyMediaObject } from "../media/storage.js";

const MAX_PROCESSING_ERROR_LENGTH = 500;
const MAX_OUTPUT_URL_LENGTH = 2048;

function safeProcessingError(value: unknown) {
  return String(value ?? "processing error").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX_PROCESSING_ERROR_LENGTH);
}

function safeAssetUrl(value: unknown, field: string) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > MAX_OUTPUT_URL_LENGTH) throw new Error(`Invalid ${field}`);
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error(`Invalid ${field}`);
  const allowedHosts = (process.env.TWITOK_MEDIA_OUTPUT_ALLOWED_HOSTS ?? "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  if (allowedHosts.length && !allowedHosts.includes(url.hostname.toLowerCase())) throw new Error(`Untrusted ${field}`);
  return url.toString();
}

export type VideoProcessingState =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "DEAD_LETTER";

export async function initializeVideoProcessingIndexes(db: Db) {
  await Promise.all([
    db.collection("video_processing_jobs").createIndex({ status: 1, nextAttemptAt: 1 }),
    db.collection("video_processing_jobs").createIndex({ uploadId: 1 }, { unique: true }),
    db.collection("video_processing_jobs").createIndex({ leaseExpiresAt: 1 }),
    db.collection("video_processing_jobs").createIndex({ createdAt: 1 })
  ]);
}

export async function verifySourceAndQueue(db: Db, userId: ObjectId, uploadId: string) {
  const upload = await db.collection("video_uploads").findOne({ uploadId, userId });
  if (!upload) throw new Error("Upload session not found");

  try {
    const verified = await verifyMediaObject(upload.objectKey, String(upload.mimeType), 500 * 1024 * 1024);
    if (verified.sizeBytes !== Number(upload.sizeBytes)) throw new Error("Uploaded object size does not match the declared size");
  } catch (error) {
    throw new Error(`Uploaded media could not be verified: ${error instanceof Error ? error.message : "storage error"}`);
  }

  const now = new Date();
  const result = await db.collection("video_processing_jobs").updateOne(
    { uploadId },
    {
      $setOnInsert: {
        uploadId,
        userId,
        type: "VIDEO_TRANSCODE",
        attempts: 0,
        maxAttempts: 5,
        status: "QUEUED" satisfies VideoProcessingState,
        createdAt: now
      },
      $set: { updatedAt: now, nextAttemptAt: now }
    },
    { upsert: true }
  );

  await db.collection("video_uploads").updateOne(
    { uploadId, userId },
    { $set: { status: "PROCESSING", updatedAt: now } }
  );

  return { queued: true, jobCreated: result.upsertedCount === 1 };
}

export async function recoverExpiredVideoJobs(db: Db) {
  const now = new Date();
  await db.collection("video_processing_jobs").updateMany(
    { status: "RUNNING", leaseExpiresAt: { $lt: now } },
    { $set: { status: "QUEUED", nextAttemptAt: now, updatedAt: now }, $unset: { workerId: "", leaseExpiresAt: "" } }
  );
}

export async function claimNextVideoJob(db: Db, workerId: string) {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + 2 * 60 * 1000);
  const result = await db.collection("video_processing_jobs").findOneAndUpdate(
    {
      status: "QUEUED",
      $or: [{ nextAttemptAt: { $lte: now } }, { nextAttemptAt: { $exists: false } }]
    },
    {
      $set: {
        status: "RUNNING",
        workerId,
        leaseExpiresAt,
        updatedAt: now
      },
      $inc: { attempts: 1 }
    },
    { sort: { createdAt: 1 }, returnDocument: "after" }
  );
  return result;
}

export async function markVideoProcessingSucceeded(
  db: Db,
  jobId: ObjectId,
  assets: {
    hlsUrl: string;
    thumbnailUrl?: string | null;
    durationMs?: number | null;
  }
) {
  const job = await db.collection("video_processing_jobs").findOne({ _id: jobId });
  if (!job) throw new Error("Processing job not found");

  const now = new Date();
  const hlsUrl = safeAssetUrl(assets.hlsUrl, "HLS URL");
  const thumbnailUrl = assets.thumbnailUrl ? safeAssetUrl(assets.thumbnailUrl, "thumbnail URL") : null;
  const safeAssets = { hlsUrl, thumbnailUrl, durationMs: assets.durationMs == null ? null : Math.max(0, Math.min(Number(assets.durationMs), 24 * 60 * 60 * 1000)) };
  await db.collection("video_processing_jobs").updateOne(
    { _id: jobId },
    { $set: { status: "SUCCEEDED", assets: safeAssets, finishedAt: now, updatedAt: now }, $unset: { leaseExpiresAt: "" } }
  );

  await db.collection("video_uploads").updateOne(
    { uploadId: job.uploadId },
    { $set: { status: "READY", updatedAt: now, playback: safeAssets } }
  );

  await db.collection("videos").updateOne(
    { uploadId: job.uploadId },
    { $set: { status: "READY", playback: safeAssets, thumbnail: safeAssets.thumbnailUrl, updatedAt: now } }
  );
}

export async function markVideoProcessingFailed(db: Db, jobId: ObjectId, errorMessage: string) {
  const job = await db.collection("video_processing_jobs").findOne({ _id: jobId });
  if (!job) throw new Error("Processing job not found");

  const attempts = Number(job.attempts ?? 0);
  const terminal = attempts >= Number(job.maxAttempts ?? 5);
  const now = new Date();
  const nextAttemptAt = new Date(now.getTime() * 0 + now.getTime() + Math.min(60 * 60 * 1000, 2 ** attempts * 1000));

  await db.collection("video_processing_jobs").updateOne(
    { _id: jobId },
    {
      $set: {
        status: terminal ? "DEAD_LETTER" : "QUEUED",
        lastError: safeProcessingError(errorMessage),
        nextAttemptAt: terminal ? null : nextAttemptAt,
        updatedAt: now
      },
      $unset: { leaseExpiresAt: "" }
    }
  );

  if (terminal) {
    await db.collection("video_uploads").updateOne(
      { uploadId: job.uploadId },
      { $set: { status: "FAILED", updatedAt: now, processingError: safeProcessingError(errorMessage) } }
    );
    await db.collection("videos").updateOne(
      { uploadId: job.uploadId },
      { $set: { status: "FAILED", updatedAt: now, processingError: errorMessage } }
    );
  }
}
