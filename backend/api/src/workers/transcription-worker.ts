import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Db } from "mongodb";
import { getDb } from "../db/mongo.js";
import { getSpeechToTextProvider } from "../video/stt.js";
import { evaluateText } from "../safety/engine.js";

const bucket = process.env.MEDIA_BUCKET ?? "";
const region = process.env.MEDIA_S3_REGION ?? "auto";
const endpoint = process.env.MEDIA_S3_ENDPOINT || undefined;
const accessKeyId = process.env.MEDIA_S3_ACCESS_KEY_ID ?? "";
const secretAccessKey = process.env.MEDIA_S3_SECRET_ACCESS_KEY ?? "";
const publicBase = (process.env.MEDIA_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
const ffmpegBin = process.env.FFMPEG_BIN ?? "ffmpeg";
const pollMs = Number(process.env.TWITOK_STT_WORKER_POLL_MS ?? 3000);
const workerId = process.env.TWITOK_STT_WORKER_ID ?? `stt-worker-${process.pid}`;

if (!bucket || !accessKeyId || !secretAccessKey) throw new Error("Media storage credentials are required");

const s3 = new S3Client({
  region,
  endpoint,
  forcePathStyle: process.env.MEDIA_S3_FORCE_PATH_STYLE === "true",
  credentials: { accessKeyId, secretAccessKey }
});

function urlFor(key: string) {
  return publicBase ? `${publicBase}/${key}` : key;
}

function runProcess(bin: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`${bin} exited ${code}: ${stderr.slice(-4000)}`)));
  });
}

async function downloadSource(key: string, target: string) {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) throw new Error("Storage returned an empty source object");
  await pipeline(response.Body as NodeJS.ReadableStream, fs.createWriteStream(target));
}

async function uploadFile(file: string, key: string, contentType: string) {
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fs.createReadStream(file),
    ContentType: contentType,
    CacheControl: "public,max-age=31536000,immutable"
  }));
}

function vttTime(ms: number) {
  const total = Math.max(0, Math.round(ms));
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

async function claimJob(db: Db) {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + 5 * 60 * 1000);
  return db.collection("transcription_jobs").findOneAndUpdate(
    {
      status: "QUEUED",
      $or: [{ nextAttemptAt: { $lte: now } }, { nextAttemptAt: { $exists: false } }]
    },
    {
      $set: { status: "PROCESSING", workerId, leaseExpiresAt: leaseUntil, updatedAt: now }
    },
    { sort: { createdAt: 1 }, returnDocument: "after" }
  );
}

async function processJob(db: Db, job: any) {
  const video = await db.collection("videos").findOne({ _id: job.videoId, ownerId: job.userId });
  if (!video) throw new Error("Video no longer exists");

  const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "twitok-stt-"));
  const source = path.join(workDir, "source");
  const audio = path.join(workDir, "audio.mp3");
  const vtt = path.join(workDir, "captions.vtt");

  try {
    await downloadSource(String(video.sourceObjectKey), source);
    await runProcess(ffmpegBin, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", source, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "64k", audio
    ]);

    const provider = getSpeechToTextProvider();
    const segments = await provider.transcribe(audio, String(job.language ?? "auto"));
    const safeSegments = [];

    for (const segment of segments.slice(0, 1000)) {
      const safety = await evaluateText(db, {
        userId: String(job.userId),
        contentId: String(job.videoId),
        text: segment.text,
        actionType: "VIDEO_CAPTION"
      });
      if (safety.decision === "BLOCK") continue;
      safeSegments.push({
        videoId: job.videoId,
        source: "AUTO_STT",
        language: job.language ?? "auto",
        text: segment.text.slice(0, 500),
        startMs: Math.max(0, segment.startMs),
        endMs: Math.max(segment.startMs + 100, segment.endMs),
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    const lines = ["WEBVTT", ""];
    safeSegments.forEach((segment, index) => {
      lines.push(String(index + 1));
      lines.push(`${vttTime(segment.startMs)} --> ${vttTime(segment.endMs)}`);
      lines.push(segment.text);
      lines.push("");
    });
    await fs.promises.writeFile(vtt, lines.join("\n"), "utf8");

    const baseKey = String(video.sourceObjectKey).replace(/\/source$/, "");
    const captionsKey = `${baseKey}/captions/auto-${job.language ?? "auto"}.vtt`;
    await uploadFile(vtt, captionsKey, "text/vtt");

    await db.collection("video_captions").deleteMany({ videoId: job.videoId, source: "AUTO_STT" });
    if (safeSegments.length) await db.collection("video_captions").insertMany(safeSegments);

    const now = new Date();
    await db.collection("videos").updateOne(
      { _id: job.videoId },
      { $set: { autoCaptionsUrl: urlFor(captionsKey), autoCaptionLanguage: job.language ?? "auto", autoCaptionsStatus: "READY", updatedAt: now } }
    );
    await db.collection("transcription_jobs").updateOne(
      { _id: job._id },
      { $set: { status: "SUCCEEDED", segmentCount: safeSegments.length, completedAt: now, updatedAt: now } }
    );
  } finally {
    await fs.promises.rm(workDir, { recursive: true, force: true });
  }
}

async function loop() {
  const db = await getDb();
  console.log(`TwiTok STT worker ${workerId} started`);
  for (;;) {
    const job = await claimJob(db);
    if (!job) {
      await new Promise(resolve => setTimeout(resolve, pollMs));
      continue;
    }
    try {
      await processJob(db, job);
      console.log(`transcribed ${job.videoId.toString()}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown transcription error";
      console.error(`transcription failed ${job.videoId.toString()}: ${message}`);
      const attempts = Number(job.attempts ?? 0) + 1;
      const now = new Date();
      await db.collection("transcription_jobs").updateOne(
        { _id: job._id },
        {
          $set: {
            status: attempts >= 5 ? "FAILED" : "QUEUED",
            attempts,
            lastError: message,
            nextAttemptAt: new Date(Date.now() + Math.min(300000, 5000 * 2 ** attempts)),
            updatedAt: now
          }
        }
      );
    }
  }
}

loop().catch(error => {
  console.error("TwiTok STT worker stopped", error);
  process.exit(1);
});
