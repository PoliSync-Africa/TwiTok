import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getDb } from "../db/mongo.js";

const bucket = process.env.MEDIA_BUCKET ?? "";
const region = process.env.MEDIA_S3_REGION ?? "auto";
const endpoint = process.env.MEDIA_S3_ENDPOINT || undefined;
const accessKeyId = process.env.MEDIA_S3_ACCESS_KEY_ID ?? "";
const secretAccessKey = process.env.MEDIA_S3_SECRET_ACCESS_KEY ?? "";
const workerId = process.env.TWITOK_PHOTO_WORKER_ID ?? `photo-worker-${process.pid}`;
const pollMs = Number(process.env.TWITOK_PHOTO_WORKER_POLL_MS ?? 2500);
const ffmpegBin = process.env.FFMPEG_BIN ?? "ffmpeg";

if (!bucket || !accessKeyId || !secretAccessKey) throw new Error("Media storage credentials are required");
const s3 = new S3Client({ region, endpoint, forcePathStyle: process.env.MEDIA_S3_FORCE_PATH_STYLE === "true", credentials: { accessKeyId, secretAccessKey } });

function runProcess(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegBin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-3000)}`)));
  });
}

async function download(key: string, file: string) {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) throw new Error("Storage returned an empty image");
  await pipeline(response.Body as NodeJS.ReadableStream, fs.createWriteStream(file));
}

async function upload(file: string, key: string) {
  await s3.send(new PutObjectCommand({
    Bucket: bucket, Key: key, Body: fs.createReadStream(file), ContentType: "image/webp",
    CacheControl: "public,max-age=31536000,immutable"
  }));
}

async function processJob(db: any, job: any) {
  const upload = await db.collection("photo_uploads").findOne({ uploadId: job.uploadId, userId: job.userId });
  if (!upload) throw new Error("Photo upload no longer exists");
  const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "twitok-photo-"));
  const source = path.join(workDir, "source");
  const output = path.join(workDir, "optimized.webp");
  try {
    await download(String(upload.objectKey), source);
    await runProcess([
      "-hide_banner","-loglevel","error","-y","-i",source,
      "-vf","scale=w=4096:h=4096:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,hqdn3d=0.8:0.8:3:3,eq=contrast=1.06:saturation=1.06:brightness=0.025:gamma=1.03,unsharp=5:5:0.32:5:5:0,setsar=1",
      "-c:v","libwebp","-quality","92","-compression_level","6",output
    ]);
    const optimizedKey = String(upload.objectKey).replace(/\/[^/]+$/, "/optimized.webp");
    await upload(output, optimizedKey);
    await db.collection("photo_uploads").updateOne(
      { _id: upload._id },
      { $set: { optimizedObjectKey: optimizedKey, optimizedMimeType: "image/webp", optimizationStatus: "READY", updatedAt: new Date() } }
    );
    await db.collection("videos").updateMany(
      { mediaType: "PHOTO", photoObjectKeys: upload.objectKey },
      { $set: { "photoObjectKeys.$[photoKey]": optimizedKey, updatedAt: new Date() } },
      { arrayFilters: [{ photoKey: upload.objectKey }] }
    );
    await db.collection("photo_processing_jobs").updateOne({ _id: job._id }, { $set: { status: "SUCCEEDED", finishedAt: new Date(), updatedAt: new Date() } });
  } finally {
    await fs.promises.rm(workDir, { recursive: true, force: true });
  }
}

async function loop() {
  const db = await getDb();
  console.log(`TwiTok photo worker ${workerId} started`);
  for (;;) {
    const now = new Date();
    const job = await db.collection("photo_processing_jobs").findOneAndUpdate(
      { status: "QUEUED", $or: [{ nextAttemptAt: { $lte: now } }, { nextAttemptAt: { $exists: false } }] },
      { $set: { status: "RUNNING", workerId, updatedAt: now }, $inc: { attempts: 1 } },
      { sort: { createdAt: 1 }, returnDocument: "after" }
    );
    if (!job) { await new Promise(resolve => setTimeout(resolve, pollMs)); continue; }
    try {
      await processJob(db, job);
    } catch (error) {
      const attempts = Number(job.attempts ?? 0);
      const terminal = attempts >= Number(job.maxAttempts ?? 3);
      await db.collection("photo_processing_jobs").updateOne(
        { _id: job._id },
        { $set: { status: terminal ? "DEAD_LETTER" : "QUEUED", lastError: error instanceof Error ? error.message : "unknown error", nextAttemptAt: terminal ? null : new Date(Date.now() + Math.min(60 * 60 * 1000, 2 ** attempts * 1000)), updatedAt: new Date() } }
      );
    }
  }
}

loop().catch(error => { console.error("TwiTok photo worker stopped", error); process.exit(1); });
