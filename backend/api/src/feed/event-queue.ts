import { ObjectId, type Db } from "mongodb";
import type { FeedEventType } from "./service.js";

export type QueuedFeedEvent = {
  _id?: ObjectId;
  eventId: string;
  userId: ObjectId;
  videoId: ObjectId;
  type: FeedEventType;
  watchMs: number;
  sessionId: string | null;
  source: string;
  status: "QUEUED" | "PROCESSING" | "DONE";
  attempts: number;
  availableAt: Date;
  lockedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
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

export function startFeedEventWorker(db: Db) {
  let stopped = false;

  const run = async () => {
    while (!stopped) {
      const now = new Date();
      const claimed = await db.collection<QueuedFeedEvent>("feed_event_queue").findOneAndUpdate(
        { $or: [
          { status: "QUEUED", availableAt: { $lte: now } },
          { status: "PROCESSING", lockedAt: { $lte: new Date(Date.now() - 60_000) } }
        ] },
        { $set: { status: "PROCESSING", lockedAt: now, availableAt: now }, $inc: { attempts: 1 } },
        { sort: { createdAt: 1 }, returnDocument: "after" }
      );

      if (!claimed) {
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }

      try {
        await processFeedEvent(db, claimed);
        await db.collection("feed_event_queue").updateOne(
          { _id: claimed._id },
          { $set: { status: "DONE", completedAt: new Date() } }
        );
      } catch (error) {
        const attempts = Number(claimed.attempts ?? 1);
        const retryDelayMs = Math.min(60_000, 1_000 * 2 ** Math.min(attempts, 6));
        await db.collection("feed_event_queue").updateOne(
          { _id: claimed._id },
          {
            $set: {
              status: "QUEUED",
              availableAt: new Date(Date.now() + retryDelayMs)
            }
          }
        );
        console.error("Feed event worker retry", error);
      }
    }
  };

  void run().catch(error => console.error("Feed event worker stopped", error));
  return () => { stopped = true; };
}
