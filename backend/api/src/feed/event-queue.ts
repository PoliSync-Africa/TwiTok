import { ObjectId, type Db } from "mongodb";
import type { FeedEventType } from "./service.js";

const DEFAULT_CONCURRENCY = 8;
const MAX_ATTEMPTS = 8;
const LOCK_TIMEOUT_MS = 60_000;
const IDLE_POLL_MS = 250;

export type QueuedFeedEvent = {
  _id?: ObjectId;
  eventId: string;
  userId: ObjectId;
  videoId: ObjectId;
  type: FeedEventType;
  watchMs: number;
  sessionId: string | null;
  source: string;
  status: "QUEUED" | "PROCESSING" | "DONE" | "FAILED";
  attempts: number;
  availableAt: Date;
  lockedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  lastError?: string;
};

export async function initializeFeedEventQueue(db: Db) {
  await Promise.all([
    db.collection("feed_event_queue").createIndex({ status: 1, availableAt: 1 }),
    db.collection("feed_event_queue").createIndex({ status: 1, lockedAt: 1 }),
    db.collection("feed_event_queue").createIndex({ eventId: 1 }, { unique: true }),
    db.collection("feed_event_queue").createIndex({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 }),
    db.collection("feed_events").createIndex({ eventId: 1 }, { unique: true, sparse: true })
  ]);
}

export async function enqueueFeedEvent(
  db: Db,
  input: Omit<QueuedFeedEvent, "_id" | "status" | "attempts" | "availableAt" | "createdAt">
) {
  const now = new Date();
  await db.collection("feed_event_queue").updateOne(
    { eventId: input.eventId },
    {
      $setOnInsert: {
        ...input,
        status: "QUEUED",
        attempts: 0,
        availableAt: now,
        createdAt: now
      }
    },
    { upsert: true }
  );
}

async function processFeedEvent(db: Db, event: QueuedFeedEvent) {
  const inserted = await db.collection("feed_events").updateOne(
    { eventId: event.eventId },
    {
      $setOnInsert: {
        eventId: event.eventId,
        userId: event.userId,
        videoId: event.videoId,
        type: event.type,
        watchMs: event.watchMs,
        sessionId: event.sessionId,
        source: event.source,
        createdAt: event.createdAt
      }
    },
    { upsert: true }
  );

  if (inserted.upsertedCount === 0) return;

  const campaigns = db.collection("promotion_campaigns");
  if (event.type === "IMPRESSION") {
    await campaigns.updateOne(
      { videoId: event.videoId, status: "ACTIVE", $expr: { $lt: ["$spentMinor", "$budgetMinor"] } },
      { $inc: { spentMinor: 1, "metrics.impressions": 1 }, $set: { updatedAt: new Date() } }
    );
  } else if (event.type === "VIEW_2S") {
    await campaigns.updateOne(
      { videoId: event.videoId, status: "ACTIVE", $expr: { $lt: ["$spentMinor", "$budgetMinor"] } },
      { $inc: { "metrics.views": 1 }, $set: { updatedAt: new Date() } }
    );
  } else if (event.type === "FOLLOW") {
    await campaigns.updateOne(
      { videoId: event.videoId, status: "ACTIVE" },
      { $inc: { "metrics.follows": 1 }, $set: { updatedAt: new Date() } }
    );
  }

  if (["LIKE", "SAVE", "NOT_INTERESTED"].includes(event.type)) {
    await db.collection("video_feedback").updateOne(
      { userId: event.userId, videoId: event.videoId, type: event.type },
      { $set: { userId: event.userId, videoId: event.videoId, type: event.type, createdAt: event.createdAt } },
      { upsert: true }
    );
  }
}

function workerConcurrency() {
  const configured = Number.parseInt(process.env.FEED_EVENT_WORKER_CONCURRENCY ?? "", 10);
  if (!Number.isFinite(configured)) return DEFAULT_CONCURRENCY;
  return Math.max(1, Math.min(32, configured));
}

async function claimFeedEvent(db: Db) {
  const now = new Date();
  return db.collection<QueuedFeedEvent>("feed_event_queue").findOneAndUpdate(
    {
      $or: [
        { status: "QUEUED", availableAt: { $lte: now } },
        { status: "PROCESSING", lockedAt: { $lte: new Date(Date.now() - LOCK_TIMEOUT_MS) } }
      ]
    },
    { $set: { status: "PROCESSING", lockedAt: now, availableAt: now }, $inc: { attempts: 1 } },
    { sort: { availableAt: 1, createdAt: 1 }, returnDocument: "after" }
  );
}

async function processClaimedEvent(db: Db, claimed: QueuedFeedEvent) {
  try {
    await processFeedEvent(db, claimed);
    await db.collection("feed_event_queue").updateOne(
      { _id: claimed._id, status: "PROCESSING" },
      { $set: { status: "DONE", completedAt: new Date() }, $unset: { lockedAt: "", lastError: "" } }
    );
  } catch (error) {
    const attempts = Number(claimed.attempts ?? 1);
    const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown feed event error";
    if (attempts >= MAX_ATTEMPTS) {
      await db.collection("feed_event_queue").updateOne(
        { _id: claimed._id, status: "PROCESSING" },
        { $set: { status: "FAILED", lastError: message, completedAt: new Date() }, $unset: { lockedAt: "" } }
      );
      console.error("Feed event permanently failed", { eventId: claimed.eventId, attempts, error: message });
      return;
    }

    const retryDelayMs = Math.min(60_000, 1_000 * 2 ** Math.min(attempts - 1, 6));
    await db.collection("feed_event_queue").updateOne(
      { _id: claimed._id, status: "PROCESSING" },
      {
        $set: {
          status: "QUEUED",
          availableAt: new Date(Date.now() + retryDelayMs),
          lastError: message
        },
        $unset: { lockedAt: "" }
      }
    );
    console.error("Feed event worker retry", { eventId: claimed.eventId, attempts, retryDelayMs, error: message });
  }
}

export async function getFeedEventQueueHealth(db: Db) {
  const now = new Date();
  const staleAt = new Date(Date.now() - LOCK_TIMEOUT_MS);
  const [queued, processing, failed, oldestQueued, oldestProcessing] = await Promise.all([
    db.collection("feed_event_queue").countDocuments({ status: "QUEUED", availableAt: { $lte: now } }),
    db.collection("feed_event_queue").countDocuments({ status: "PROCESSING" }),
    db.collection("feed_event_queue").countDocuments({ status: "FAILED" }),
    db.collection<QueuedFeedEvent>("feed_event_queue").findOne(
      { status: "QUEUED", availableAt: { $lte: now } },
      { sort: { availableAt: 1, createdAt: 1 }, projection: { createdAt: 1 } }
    ),
    db.collection<QueuedFeedEvent>("feed_event_queue").findOne(
      { status: "PROCESSING" },
      { sort: { lockedAt: 1 }, projection: { lockedAt: 1 } }
    )
  ]);

  return {
    queued,
    processing,
    failed,
    staleProcessing: processing > 0
      ? await db.collection("feed_event_queue").countDocuments({ status: "PROCESSING", lockedAt: { $lte: staleAt } })
      : 0,
    oldestQueuedAt: oldestQueued?.createdAt?.toISOString() ?? null,
    oldestProcessingAt: oldestProcessing?.lockedAt?.toISOString() ?? null,
    queueLagSeconds: oldestQueued ? Math.max(0, Math.floor((Date.now() - oldestQueued.createdAt.getTime()) / 1000)) : 0
  };
}

export function startFeedEventWorker(db: Db) {
  let stopped = false;
  const concurrency = workerConcurrency();

  const run = async () => {
    while (!stopped) {
      const claimed = await claimFeedEvent(db);
      if (!claimed) {
        await new Promise(resolve => setTimeout(resolve, IDLE_POLL_MS));
        continue;
      }
      await processClaimedEvent(db, claimed);
    }
  };

  const workers = Array.from({ length: concurrency }, () => run());
  const workerPromise = Promise.allSettled(workers);

  void workerPromise.then(results => {
    const rejected = results.find(result => result.status === "rejected");
    if (rejected && rejected.status === "rejected") console.error("Feed event worker stopped", rejected.reason);
  });

  return () => {
    stopped = true;
  };
}
