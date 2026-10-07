import express from "express";
import { createServer } from "node:http";
import { attachRealtime } from "./realtime/ws.js";
import cors from "cors";
import helmet from "helmet";
import { getDb } from "./db/mongo.js";
import { apiRouter } from "./routes/index.js";
import { ensureOwnerAccount } from "./auth/owner.js";
import { initializeMoneyIndexes } from "./money/ledger.js";
import { initializeWalletIndexes } from "./money/wallet.js";
import { initializeGiftIndexes } from "./money/gifts.js";
import { initializeWithdrawalIndexes } from "./money/withdrawal.js";
import { initializeCreatorIndexes } from "./creator/studio.js";
import { initializeLiveIndexes } from "./live/service.js";
import { initializeSafetyIndexes } from "./safety/engine.js";
import { initializeMonetizationIndexes } from "./monetization/programs.js";
import { ensureUserIndexes } from "./auth/user.js";
import { ensureFollowIndexes } from "./social/follows.js";
import { initializeVideoIndexes } from "./video/service.js";
import { initializeFeedIndexes } from "./feed/service.js";
import { initializeEngagementIndexes } from "./social/engagement.js";
import { initializeNotificationIndexes } from "./social/notifications.js";
import { initializeSearchIndexes } from "./search/service.js";
import { initializeVideoProcessingIndexes } from "./video/processing.js";
import { ensureSoundIndexes } from "./music/service.js";
import { ensureTranscriptionIndexes } from "./video/transcription.js";
import { ensureTranslationIndexes } from "./video/translation.js";
import { ensureStickerIndexes } from "./video/stickers.js";
import { initializePlaylistIndexes } from "./social/playlists.js";
import { initializeStoryIndexes } from "./social/stories.js";
import { rateLimit } from "./security/rate-limit.js";
import { initializeVerificationIndexes } from "./verification/service.js";

const app = express();
const httpServer = createServer(app);
attachRealtime(httpServer);
const port = Number(process.env.PORT ?? 4000);

app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);
app.use(helmet());
const allowedOrigins = Array.from(new Set((process.env.ALLOWED_WEB_ORIGINS ?? process.env.ADMIN_WEB_ORIGIN ?? "").split(",").map(x => x.trim()).filter(Boolean).concat(["https://twitokapp.com", "https://www.twitokapp.com", "https://twitok-web.onrender.com"])));
if (!allowedOrigins.length) throw new Error("ALLOWED_WEB_ORIGINS or ADMIN_WEB_ORIGIN must be configured");
app.use(cors({ origin: (origin, callback) => !origin || allowedOrigins.includes(origin) ? callback(null, true) : callback(new Error("CORS origin denied")), credentials: true }));
app.use((req, res, next) => {
  const stateChanging = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (!stateChanging) return next();
  const origin = req.get("Origin");
  if (origin && !allowedOrigins.includes(origin)) return res.status(403).json({ error: "Origin not allowed" });
  // twitokapp.com -> Render is intentionally cross-site. The explicit
  // Origin allow-list above is the CSRF boundary; do not reject a trusted
  // browser request merely because Sec-Fetch-Site is "cross-site".
  next();
});
app.use(rateLimit({ windowMs: 60 * 1000, max: 300 }));
app.use(express.json({ limit: "2mb", verify: (req, _res, buf) => { (req as any).rawBody = Buffer.from(buf); } }));

app.get("/health", (_req, res) => res.json({ service: "twitok-api", status: "ok", platform: "TwiTok", version: "0.6.0" }));
app.use("/api/v1", apiRouter);

async function start() {
  if (process.env.MONGODB_URI) {
    const db = await getDb();
    await ensureOwnerAccount(db);
    await initializeMoneyIndexes(db); await initializeWalletIndexes(db); await initializeGiftIndexes(db); await initializeWithdrawalIndexes(db); await initializeCreatorIndexes(db); await initializeLiveIndexes(db); await initializeSafetyIndexes(db); await initializeMonetizationIndexes(db); await ensureUserIndexes(db); await ensureFollowIndexes(db); await initializeVideoIndexes(db); await initializeVideoProcessingIndexes(db); await initializeFeedIndexes(db); await initializeEngagementIndexes(db); await initializeNotificationIndexes(db); await initializeSearchIndexes(db); await ensureSoundIndexes(db); await ensureTranscriptionIndexes(db); await ensureTranslationIndexes(db); await ensureStickerIndexes(db); await initializePlaylistIndexes(db); await initializeStoryIndexes(db); await initializeVerificationIndexes(db); await (await import("./social/messaging.js")).ensureMessagingIndexes(db);
  } else console.warn("MONGODB_URI is not configured. Database features are disabled.");
  httpServer.listen(port, () => console.log(`TwiTok API listening on port ${port}`));
}
start().catch(error => { console.error("TwiTok API failed to start", error); process.exit(1); });