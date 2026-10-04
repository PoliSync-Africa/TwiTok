import { ObjectId, type Db } from "mongodb";
import { verifyMediaObject } from "../media/storage.js";

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

export async function recoverStaleVideoUploads(db: Db) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const result = await db.collection("video_uploads").updateMany(
    { status: "UPLOADING", createdAt: { $lt: staleBefore } },
    {
      $set: {
        status: "FAILED",
        failureCode: "UPLOAD_EXPIRED",
        processingError: "Upload session expired before completion",
        updatedAt: now
      }
    }
  );
  return result.modifiedCount;
}

export async function recoverExpiredVideoJobs(db: Db) {
  const now = new Date();
  const jobs = db.collection("video_processing_jobs");

  // Recovery is ownership-safe: each expired job is atomically claimed for
  // terminalization or requeue, so a concurrent worker cannot cause stale
  // recovery code to mark the wrong upload/video as failed.
  const terminalCandidates = await jobs.find({
    status: "RUNNING",
    leaseExpiresAt: { $lt: now },
    $expr: { $gte: ["$attempts", { $ifNull: ["$maxAttempts", 5] }] }
  }).project({ _id: 1, uploadId: 1 }).toArray();

  let terminalCount = 0;
  for (const candidate of terminalCandidates) {
    const transitioned = await jobs.findOneAndUpdate(
      {
        _id: candidate._id,
        status: "RUNNING",
        leaseExpiresAt: { $lt: now },
        $expr: { $gte: ["$attempts", { $ifNull: ["$maxAttempts", 5] }] }
      },
      {
        $set: {
          status: "DEAD_LETTER",
          lastError: "Processing worker lease expired after maximum retry attempts",
          nextAttemptAt: null,
          updatedAt: now,
          finishedAt: now
        },
        $unset: { workerId: "", leaseExpiresAt: "" }
      },
      { returnDocument: "before", projection: { uploadId: 1 } }
    );

    if (!transitioned) continue;
    terminalCount += 1;

    await Promise.all([
      db.collection("video_uploads").updateOne(
        { uploadId: transitioned.uploadId },
        {
          $set: {
            status: "FAILED",
            updatedAt: now,
            processingError: "Processing worker lease expired after maximum retry attempts"
          }
        }
      ),
      db.collection("videos").updateOne(
        { uploadId: transitioned.uploadId },
        {
          $set: {
            status: "FAILED",
            updatedAt: now,
            processingError: "Processing worker lease expired after maximum retry attempts"
          }
        }
      )
    ]);
  }

  await jobs.updateMany
    {
      status: "RUNNING",
      leaseExpiresAt: { $lt: now },
      $expr: { $lt: ["$attempts", { $ifNull: ["$maxAttempts", 5] }] }
    },
    {
      $set: { status: "QUEUED", nextAttemptAt: now, updatedAt: now },
      $unset: { workerId: "", leaseExpiresAt: "" }
    }
  );

  return terminalCount;
}

export async function claimNextVideoJob(db: Db, workerId: string) {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + 2 * 60 * 1000);
  const result = await db.collection("video_processing_jobs").findOneAndUpdate(
    {
      status: "QUEUED",
      $or: [{ nextAttemptAt: { $lte: now } }, { nextAttemptAt: { $exists: false } }],
      // Never start a job that has already exhausted its retry budget.
      $expr: { $lt: ["$attempts", { $ifNull: ["$maxAttempts", 5] }] }
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
  },
  workerId?: string
) {
  const job = await db.collection("video_processing_jobs").findOne({ _id: jobId });
  if (!job) throw new Error("Processing job not found");

  const ownership = {
    _id: jobId,
    status: "RUNNING",
    ...(workerId ? { workerId } : {})
  };
  const now = new Date();
  const result = await db.collection("video_processing_jobs").updateOne(
    ownership,
    {
      $set: { status: "SUCCEEDED", assets, finishedAt: now, updatedAt: now },
      $unset: { leaseExpiresAt: "", workerId: "" }
    }
  );

  if (result.modifiedCount !== 1) {
    throw new Error("Video processing lease was lost before completion");
  }

  await db.collection("video_uploads").updateOne(
    { uploadId: job.uploadId },
    { $set: { status: "READY", updatedAt: now, playback: assets } }
  );

  await db.collection("videos").updateOne(
    { uploadId: job.uploadId },
    { $set: { status: "READY", playback: assets, thumbnail: assets.thumbnailUrl ?? null, updatedAt: now } }
  );
}

export async function markVideoProcessingFailed(db: Db, jobId: ObjectId, errorMessage: string, workerId?: string) {
  const job = await db.collection("video_processing_jobs").findOne({ _id: jobId });
  if (!job) throw new Error("Processing job not found");

  const attempts = Number(job.attempts ?? 0);
  const terminal = attempts >= Number(job.maxAttempts ?? 5);
  const now = new Date();
  const backoffMs = Math.min(60 * 60 * 1000, 2 ** attempts * 1000);
  const nextAttemptAt = new Date(now.getTime() + backoffMs);

  const ownership = {
    _id: jobId,
    status: "RUNNING",
    ...(workerId ? { workerId } : {})
  };
  const result = await db.collection("video_processing_jobs").updateOne(
    ownership,
    {
      $set: {
        status: terminal ? "DEAD_LETTER" : "QUEUED",
        lastError: errorMessage,
        nextAttemptAt: terminal ? null : nextAttemptAt,
        updatedAt: now
      },
      $unset: { leaseExpiresAt: "", workerId: "" }
    }
  );

  if (result.modifiedCount !== 1) {
    return false;
  }

  if (terminal) {
    await db.collection("video_uploads").updateOne(
      { uploadId: job.uploadId },
      { $set: { status: "FAILED", updatedAt: now, processingError: errorMessage } }
    );
    await db.collection("videos").updateOne(
      { uploadId: job.uploadId },
      { $set: { status: "FAILED", updatedAt: now, processingError: errorMessage } }
    );
  }
  return true;
}