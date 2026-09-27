import express from "express";
import cors from "cors";
import helmet from "helmet";
import { getDb } from "./db/mongo.js";
import { apiRouter } from "./routes/index.js";
import { ensureOwnerAccount } from "./auth/owner.js";
import { initializeMoneyIndexes } from "./money/ledger.js";
import { initializeWithdrawalIndexes } from "./money/withdrawal.js";
import { initializeCreatorIndexes } from "./creator/studio.js";
import { initializeLiveIndexes } from "./live/service.js";
import { initializeSafetyIndexes } from "./safety/engine.js";
import { initializeMonetizationIndexes } from "./monetization/programs.js";
import { ensureUserIndexes } from "./auth/user.js";
import { ensureFollowIndexes } from "./social/follows.js";
import { initializeVideoIndexes } from "./video/service.js";
import { initializeFeedIndexes } from "./feed/service.js";
import { initializeVideoProcessingIndexes } from "./video/processing.js";
import { ensureSoundIndexes } from "./music/service.js";
import { ensureTranscriptionIndexes } from "./video/transcription.js";
import { ensureTranslationIndexes } from "./video/translation.js";
import { ensureStickerIndexes } from "./video/stickers.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(helmet());
app.use(cors({ origin: process.env.ADMIN_WEB_ORIGIN?.split(",").map((origin) => origin.trim()) ?? true, credentials: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ service: "twitok-api", status: "ok", platform: "TwiTok", version: "0.6.0" });
});

app.use("/api/v1", apiRouter);

async function start() {
  if (process.env.MONGODB_URI) {
    const db = await getDb();
    await ensureOwnerAccount(db);
    await initializeMoneyIndexes(db);
    await initializeWithdrawalIndexes(db);
    await initializeCreatorIndexes(db);
    await initializeLiveIndexes(db);
    await initializeSafetyIndexes(db);
    await initializeMonetizationIndexes(db);
    await ensureUserIndexes(db);
    await ensureFollowIndexes(db);
    await initializeVideoIndexes(db);
    await initializeVideoProcessingIndexes(db);
    await initializeFeedIndexes(db);
    await ensureSoundIndexes(db);
    await ensureTranscriptionIndexes(db);
    await ensureTranslationIndexes(db);
    await ensureStickerIndexes(db);
  } else {
    console.warn("MONGODB_URI is not configured. Database features are disabled.");
  }
  app.listen(port, () => console.log(`TwiTok API listening on port ${port}`));
}

start().catch((error) => {
  console.error("TwiTok API failed to start", error);
  process.exit(1);
});
