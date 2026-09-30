import { getDb } from "../db/mongo.js";
import { initializeFeedEventQueue, startFeedEventWorker } from "../feed/event-queue.js";

async function start() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
  const db = await getDb();
  await initializeFeedEventQueue(db);
  startFeedEventWorker(db);
  console.log("TwiTok feed event worker started");
}

start().catch(error => {
  console.error("TwiTok feed event worker failed to start", error);
  process.exit(1);
});
