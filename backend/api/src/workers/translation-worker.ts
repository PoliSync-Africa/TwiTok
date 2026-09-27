import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Db } from "mongodb";
import { getDb } from "../db/mongo.js";
import { getCaptionTranslationProvider } from "../video/translation-provider.js";
import { LANGUAGE_NAMES } from "../video/translation.js";
import { evaluateText } from "../safety/engine.js";

const bucket = process.env.MEDIA_BUCKET ?? "";
const publicBase = (process.env.MEDIA_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
const pollMs = Number(process.env.TWITOK_TRANSLATION_WORKER_POLL_MS ?? 3000);
const workerId = process.env.TWITOK_TRANSLATION_WORKER_ID ?? `translation-worker-${process.pid}`;

if (!bucket || !process.env.MEDIA_S3_ACCESS_KEY_ID || !process.env.MEDIA_S3_SECRET_ACCESS_KEY) {
  throw new Error("Media storage credentials are required");
}

const s3 = new S3Client({
  region: process.env.MEDIA_S3_REGION ?? "auto",
  endpoint: process.env.MEDIA_S3_ENDPOINT || undefined,
  forcePathStyle: process.env.MEDIA_S3_FORCE_PATH_STYLE === "true",
  credentials: { accessKeyId: process.env.MEDIA_S3_ACCESS_KEY_ID, secretAccessKey: process.env.MEDIA_S3_SECRET_ACCESS_KEY }
});

function vttTime(ms: number) {
  const total = Math.max(0, Math.round(ms));
  return `${String(Math.floor(total / 3600000)).padStart(2,"0")}:${String(Math.floor((total % 3600000) / 60000)).padStart(2,"0")}:${String(Math.floor((total % 60000) / 1000)).padStart(2,"0")}.${String(total % 1000).padStart(3,"0")}`;
}

async function claimJob(db: Db) {
  const now = new Date();
  return db.collection("translation_jobs").findOneAndUpdate(
    { status: "QUEUED", $or: [{ nextAttemptAt: { $lte: now } }, { nextAttemptAt: { $exists: false } }] },
    { $set: { status: "PROCESSING", workerId, leaseExpiresAt: new Date(now.getTime() + 5 * 60 * 1000), updatedAt: now } },
    { sort: { createdAt: 1 }, returnDocument: "after" }
  );
}

async function processJob(db: Db, job: any) {
  const captions = await db.collection("video_captions")
    .find({ videoId: job.videoId, source: { $in: ["AUTO_STT", "CREATOR"] } })
    .sort({ startMs: 1 }).limit(1000).toArray();
  if (!captions.length) throw new Error("No source captions available for translation");

  const provider = getCaptionTranslationProvider();
  const translated: any[] = [];
  for (let offset = 0; offset < captions.length; offset += 100) {
    const batch = captions.slice(offset, offset + 100);
    const texts = await provider.translate(batch.map(x => ({ text: String(x.text), startMs: Number(x.startMs), endMs: Number(x.endMs) })), String(job.sourceLanguage ?? "auto"), String(job.targetLanguage));
    for (let i = 0; i < batch.length; i++) {
      const text = String(texts[i] ?? "").trim().slice(0, 500);
      if (!text) continue;
      const decision = await evaluateText(db, {
        userId: String(job.userId),
        contentId: String(job.videoId),
        text,
        actionType: "VIDEO_CAPTION_TRANSLATION"
      });
      if (decision.decision === "BLOCK") continue;
      translated.push({
        videoId: job.videoId,
        source: "TRANSLATED",
        language: job.targetLanguage,
        sourceLanguage: job.sourceLanguage ?? "auto",
        text,
        startMs: Math.max(0, Number(batch[i].startMs)),
        endMs: Math.max(Number(batch[i].startMs) + 100, Number(batch[i].endMs)),
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
  }

  const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "twitok-translate-"));
  try {
    const vttPath = path.join(workDir, "captions.vtt");
    const lines = ["WEBVTT", ""];
    translated.forEach((x, i) => {
      lines.push(String(i + 1), `${vttTime(x.startMs)} --> ${vttTime(x.endMs)}`, x.text, "");
    });
    await fs.promises.writeFile(vttPath, lines.join("\n"), "utf8");
    const key = `videos/${job.videoId.toString()}/captions/${job.targetLanguage}.vtt`;
    await s3.send(new PutObjectCommand({
      Bucket: bucket, Key: key, Body: fs.createReadStream(vttPath), ContentType: "text/vtt", CacheControl: "public,max-age=3600"
    }));
    const url = publicBase ? `${publicBase}/${key}` : key;

    await db.collection("video_captions").deleteMany({ videoId: job.videoId, source: "TRANSLATED", language: job.targetLanguage });
    if (translated.length) await db.collection("video_captions").insertMany(translated);
    await db.collection("video_caption_tracks").updateOne(
      { videoId: job.videoId, language: job.targetLanguage },
      { $set: { videoId: job.videoId, language: job.targetLanguage, label: LANGUAGE_NAMES[job.targetLanguage] ?? job.targetLanguage, sourceLanguage: job.sourceLanguage ?? "auto", url, status: "READY", updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
    await db.collection("videos").updateOne(
      { _id: job.videoId },
      { $set: { updatedAt: new Date() }, $addToSet: { captionLanguages: job.targetLanguage } }
    );
    await db.collection("translation_jobs").updateOne(
      { _id: job._id },
      { $set: { status: "SUCCEEDED", segmentCount: translated.length, completedAt: new Date(), updatedAt: new Date() } }
    );
  } finally {
    await fs.promises.rm(workDir, { recursive: true, force: true });
  }
}

async function loop() {
  const db = await getDb();
  console.log(`TwiTok translation worker ${workerId} started`);
  for (;;) {
    const job = await claimJob(db);
    if (!job) { await new Promise(resolve => setTimeout(resolve, pollMs)); continue; }
    try {
      await processJob(db, job);
    } catch (error) {
      const attempts = Number(job.attempts ?? 0) + 1;
      const message = error instanceof Error ? error.message : "unknown translation error";
      await db.collection("translation_jobs").updateOne(
        { _id: job._id },
        { $set: { status: attempts >= 5 ? "FAILED" : "QUEUED", attempts, lastError: message, nextAttemptAt: new Date(Date.now() + Math.min(300000, 5000 * 2 ** attempts)), updatedAt: new Date() } }
      );
      console.error(`translation failed ${job.videoId.toString()}: ${message}`);
    }
  }
}

loop().catch(error => { console.error("TwiTok translation worker stopped", error); process.exit(1); });
