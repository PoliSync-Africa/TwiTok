import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Db } from "mongodb";
import { getDb } from "../db/mongo.js";
import { claimNextVideoJob, markVideoProcessingFailed, markVideoProcessingSucceeded, recoverExpiredVideoJobs } from "../video/processing.js";

const bucket = process.env.MEDIA_BUCKET ?? "";
const region = process.env.MEDIA_S3_REGION ?? "auto";
const endpoint = process.env.MEDIA_S3_ENDPOINT || undefined;
const accessKeyId = process.env.MEDIA_S3_ACCESS_KEY_ID ?? "";
const secretAccessKey = process.env.MEDIA_S3_SECRET_ACCESS_KEY ?? "";
const publicBase = (process.env.MEDIA_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
const workerId = process.env.TWITOK_VIDEO_WORKER_ID ?? \`video-worker-\${process.pid}\`;
const ffmpegBin = process.env.FFMPEG_BIN ?? "ffmpeg";
const ffprobeBin = process.env.FFPROBE_BIN ?? "ffprobe";
const pollMs = Number(process.env.TWITOK_VIDEO_WORKER_POLL_MS ?? 2000);

if (!bucket || !accessKeyId || !secretAccessKey) throw new Error("Media storage credentials are required");
const s3 = new S3Client({
  region,
  endpoint,
  forcePathStyle: process.env.MEDIA_S3_FORCE_PATH_STYLE === "true",
  credentials: { accessKeyId, secretAccessKey }
});

function urlFor(key: string) {
  return publicBase ? \`\${publicBase}/\${key}\` : key;
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
    CacheControl: key.endsWith(".m3u8") ? "public,max-age=60" : "public,max-age=31536000,immutable"
  }));
}

function runProcess(bin: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(\`\${bin} exited \${code}: \${stderr.slice(-4000)}\`)));
  });
}

async function hasAudio(input: string) {
  try {
    await runProcess(ffprobeBin, [
      "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=index",
      "-of", "csv=p=0", input
    ]);
    return true;
  } catch {
    return false;
  }
}

async function runFfmpeg(input: string, outputDir: string, audio: boolean) {
  const args = [
    "-hide_banner", "-loglevel", "error", "-y", "-i", input,
    "-filter_complex",
    "[0:v]split=3[v0][v1][v2];[v0]scale=w=360:h=-2:force_original_aspect_ratio=decrease[v360];[v1]scale=w=540:h=-2:force_original_aspect_ratio=decrease[v540];[v2]scale=w=720:h=-2:force_original_aspect_ratio=decrease[v720]",
    "-map", "[v360]", "-c:v:0", "libx264", "-b:v:0", "500k", "-maxrate:v:0", "650k", "-bufsize:v:0", "1000k",
    "-map", "[v540]", "-c:v:1", "libx264", "-b:v:1", "1100k", "-maxrate:v:1", "1400k", "-bufsize:v:1", "2200k",
    "-map", "[v720]", "-c:v:2", "libx264", "-b:v:2", "2200k", "-maxrate:v:2", "2800k", "-bufsize:v:2", "4400k",
    ...(audio ? ["-map", "0:a?", "-map", "0:a?", "-map", "0:a?", "-c:a", "aac", "-b:a", "96k", "-ar", "48000"] : []),
    "-force_key_frames", "expr:gte(t,n_forced*2)",
    "-g", "60", "-keyint_min", "60", "-sc_threshold", "0",
    "-f", "hls", "-hls_time", "2", "-hls_playlist_type", "vod",
    "-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", "init_%v.mp4",
    "-hls_segment_filename", path.join(outputDir, "seg_%v_%05d.m4s"),
    "-master_pl_name", "master.m3u8",
    "-var_stream_map", audio ? "v:0,a:0 v:1,a:1 v:2,a:2" : "v:0 v:1 v:2",
    path.join(outputDir, "stream_%v.m3u8")
  ];
  await runProcess(ffmpegBin, args);
}

async function createThumbnail(input: string, output: string) {
  await runProcess(ffmpegBin, [
    "-hide_banner", "-loglevel", "error", "-y", "-ss", "1", "-i", input,
    "-frames:v", "1", "-vf", "scale=720:-2", "-q:v", "3", output
  ]);
}

async function processJob(db: Db, job: any) {
  const upload = await db.collection("video_uploads").findOne({ uploadId: job.uploadId, userId: job.userId });
  if (!upload) throw new Error("Upload session no longer exists");

  const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "twitok-video-"));
  const input = path.join(workDir, "source");
  const outputDir = path.join(workDir, "hls");
  const thumbnail = path.join(workDir, "thumbnail.jpg");
  await fs.promises.mkdir(outputDir);
  try {
    await downloadSource(upload.objectKey, input);
    const audio = await hasAudio(input);
    await runFfmpeg(input, outputDir, audio);
    await createThumbnail(input, thumbnail);

    const baseKey = upload.objectKey.replace(/\/source$/, "");
    const files = await fs.promises.readdir(outputDir);
    for (const file of files) {
      const type = file.endsWith(".m3u8") ? "application/vnd.apple.mpegurl"
        : file.endsWith(".m4s") ? "video/iso.segment"
        : file.endsWith(".mp4") ? "video/mp4" : "application/octet-stream";
      await uploadFile(path.join(outputDir, file), \`\${baseKey}/hls/\${file}\`, type);
    }

    const thumbnailKey = \`\${baseKey}/thumbnail.jpg\`;
    await uploadFile(thumbnail, thumbnailKey, "image/jpeg");

    const playbackKey = \`\${baseKey}/hls/master.m3u8\`;
    await markVideoProcessingSucceeded(db, job._id, {
      hlsUrl: urlFor(playbackKey),
      thumbnailUrl: urlFor(thumbnailKey),
      durationMs: upload.durationMs ?? null
    });
  } finally {
    await fs.promises.rm(workDir, { recursive: true, force: true });
  }
}

async function loop() {
  const db = await getDb();
  console.log(\`TwiTok video worker \${workerId} started\`);
  for (;;) {
    await recoverExpiredVideoJobs(db);
    const job = await claimNextVideoJob(db, workerId);
    if (!job) {
      await new Promise(resolve => setTimeout(resolve, pollMs));
      continue;
    }
    try {
      await processJob(db, job);
      console.log(\`processed \${job.uploadId}\`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown processing error";
      console.error(\`failed \${job.uploadId}: \${message}\`);
      await markVideoProcessingFailed(db, job._id, message);
    }
  }
}

loop().catch(error => {
  console.error("TwiTok video worker stopped", error);
  process.exit(1);
});
