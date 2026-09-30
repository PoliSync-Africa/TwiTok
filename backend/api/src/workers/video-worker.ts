import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Db } from "mongodb";
import { getDb } from "../db/mongo.js";
import { claimNextVideoJob, markVideoProcessingFailed, markVideoProcessingSucceeded, recoverExpiredVideoJobs } from "../video/processing.js";
import { createOriginalSound } from "../music/service.js";

const bucket = process.env.MEDIA_BUCKET ?? "";
const region = process.env.MEDIA_S3_REGION ?? "auto";
const endpoint = process.env.MEDIA_S3_ENDPOINT || undefined;
const accessKeyId = process.env.MEDIA_S3_ACCESS_KEY_ID ?? "";
const secretAccessKey = process.env.MEDIA_S3_SECRET_ACCESS_KEY ?? "";
const publicBase = (process.env.MEDIA_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
const workerId = process.env.TWITOK_VIDEO_WORKER_ID ?? `video-worker-${process.pid}`;
const ffmpegBin = process.env.FFMPEG_BIN ?? "ffmpeg";
const ffprobeBin = process.env.FFPROBE_BIN ?? "ffprobe";
const pollMs = Number(process.env.TWITOK_VIDEO_WORKER_POLL_MS ?? 2000);
const fontFile = process.env.TWITOK_FONT_FILE ?? "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const stickerMap: Record<string,string> = { africa:"🌍", ghana:"🇬🇭", nigeria:"🇳🇬", kenya:"🇰🇪", "south-africa":"🇿🇦", celebrate:"🎉", love:"❤️", fire:"🔥", laugh:"😂", wow:"😮", clap:"👏", dance:"💃", drum:"🥁", music:"🎶", community:"🤝", food:"🍲" };
function resolveStickerGlyph(id: string) {
  const known = stickerMap[id];
  if (known) return known;
  if (/^flag-[A-Z]{2}$/.test(id)) {
    return id.slice(5).split("").map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join("");
  }
  if (/^emoji-[0-9a-f]+(?:-[0-9a-f]+)*$/i.test(id)) {
    try {
      const glyph = id.slice(6).split("-").map(x => Number.parseInt(x, 16)).map(cp => String.fromCodePoint(cp)).join("");
      return glyph.length <= 32 ? glyph : "";
    } catch {
      return "";
    }
  }
  return "";
}

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

async function downloadSource(key: string, target: string) {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) throw new Error("Storage returned an empty source object");
  await pipeline(response.Body as NodeJS.ReadableStream, fs.createWriteStream(target));
}

async function downloadSoundAsset(audioUrl: string, target: string) {
  if (/^https?:\/\//i.test(audioUrl)) {
    const response = await fetch(audioUrl);
    if (!response.ok || !response.body) throw new Error(`Unable to download sound asset: HTTP ${response.status}`);
    await pipeline(response.body as any, fs.createWriteStream(target));
    return;
  }
  await downloadSource(audioUrl, target);
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

function effectFilter(input: string, output: string, effect: string) {
  const filters: Record<string, string> = {
    NONE: "null",
    VIBRANT: "eq=contrast=1.08:saturation=1.35",
    WARM: "colorbalance=rs=.08:gs=.03:bs=-.03",
    COOL: "colorbalance=rs=-.03:gs=.03:bs=.08",
    NOIR: "hue=s=0,eq=contrast=1.15:brightness=-0.02",
    VINTAGE: "eq=contrast=.95:saturation=.75:brightness=.02",
    BRIGHT: "eq=contrast=1.03:saturation=1.05:brightness=.08",
    FADE: "eq=contrast=.85:saturation=.9:brightness=.05"
  };
  const filter = filters[effect] ?? filters.NONE;
  return `[${input}]${filter}[${output}]`;
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

async function runFfmpeg(
  input: string,
  outputDir: string,
  options: {
    hasOriginalAudio: boolean;
    trimStartMs: number;
    trimEndMs: number | null;
    speed: number;
    soundFile?: string;
    originalVolume: number;
    addedSoundVolume: number;
    outputDurationSec: number;
    textOverlays: Array<{ text: string; startMs: number; endMs: number; x: number; y: number; fontSize: number; color?: string; background?: string; align?: string }>;
    captions: Array<{ text: string; startMs: number; endMs: number }>;
    effect: string;
    stickers: Array<{ stickerId: string; startMs: number; endMs: number; x: number; y: number; size: number; rotation: number }>;
    editPlan?: { quality?: string; filter?: string; crop?: string; rotate?: number; mirror?: boolean; aiTool?: string; aiPrompt?: string };
  }
) {
  const { hasOriginalAudio, trimStartMs, trimEndMs, speed, soundFile, originalVolume, addedSoundVolume, outputDurationSec, textOverlays, captions, effect, stickers, editPlan } = options;
  const inputArgs = [
    ...(trimStartMs > 0 ? ["-ss", String(trimStartMs / 1000)] : []),
    ...(trimEndMs && trimEndMs > trimStartMs ? ["-to", String(trimEndMs / 1000)] : []),
    "-i", input
  ];
  if (soundFile) inputArgs.push("-stream_loop", "-1", "-i", soundFile);

  const plan = editPlan ?? {};
  const quality = String(plan.quality ?? "HD");
  const aiTool = String(plan.aiTool ?? "NONE");
  const filterName = String(plan.filter ?? "NONE");
  const polish = quality === "HD" || aiTool === "HD_ENHANCE" ? "hqdn3d=1.2:1.2:6:6,unsharp=5:5:0.7:5:5:0.0,eq=contrast=1.05:saturation=1.08:brightness=0.015" : quality === "CLEAN" || aiTool === "RESTORE" ? "hqdn3d=1:1:4:4,unsharp=5:5:0.45:5:5:0.0" : "null";
  const filterMap: Record<string,string> = {
    NONE:"null", VIVID:"eq=contrast=1.08:saturation=1.3", WARM:"colorbalance=rs=.08:gs=.03:bs=-.03",
    COOL:"colorbalance=rs=-.03:gs=.03:bs=.08", NOIR:"hue=s=0,eq=contrast=1.15:brightness=-.02",
    VINTAGE:"eq=contrast=.95:saturation=.78:brightness=.02", CINEMATIC:"eq=contrast=1.12:saturation=1.08:gamma=1.03"
  };
  const cropMap: Record<string,string> = {
    "9:16":"crop=min(iw\,ih*0.5625):min(ih\,iw*1.7778)",
    "1:1":"crop=min(iw\,ih):min(iw\,ih)",
    "4:5":"crop=min(iw\,ih*0.8):min(ih\,iw*1.25)",
    "16:9":"crop=min(iw\,ih*1.7778):min(ih\,iw*0.5625)"
  };
  const rotate = Number(plan.rotate ?? 0);
  const geometry = [
    cropMap[String(plan.crop ?? "ORIGINAL")] ?? "null",
    plan.mirror ? "hflip" : "null",
    rotate === 90 ? "transpose=1" : rotate === 180 ? "transpose=1,transpose=1" : rotate === 270 ? "transpose=2" : "null"
  ].filter(x => x !== "null").join(",") || "null";
  const aiVisual = aiTool === "RELIGHT" ? "eq=brightness=0.07:gamma=1.08" : aiTool === "COLORIZE" ? "hue=s=1.18" : "null";
  const filters = [
    "[0:v]split=3[v0][v1][v2]",
    `[v0]scale=w=360:h=-2:force_original_aspect_ratio=decrease,${polish},${filterMap[filterName] ?? "null"},${aiVisual},${geometry},setpts=PTS/${speed}[v360base]`,
    `[v1]scale=w=540:h=-2:force_original_aspect_ratio=decrease,${polish},${filterMap[filterName] ?? "null"},${aiVisual},${geometry},setpts=PTS/${speed}[v540base]`,
    `[v2]scale=w=720:h=-2:force_original_aspect_ratio=decrease,${polish},${filterMap[filterName] ?? "null"},${aiVisual},${geometry},setpts=PTS/${speed}[v720base]`
  ];

  const overlayInputs: string[] = [];
  for (let index = 0; index < textOverlays.length; index += 1) {
    const overlay = textOverlays[index];
    const textFile = path.join(outputDir, `overlay-${index}.txt`);
    fs.writeFileSync(textFile, overlay.text, "utf8");
    overlayInputs.push(textFile);
  }
  const variants = [
    { base: "v360base", out: "v360", width: 360 },
    { base: "v540base", out: "v540", width: 540 },
    { base: "v720base", out: "v720", width: 720 }
  ];
  const captionInputs: string[] = [];
  for (let index = 0; index < captions.length; index += 1) {
    const caption = captions[index];
    const file = path.join(outputDir, `caption-${index}.txt`);
    fs.writeFileSync(file, caption.text, "utf8");
    captionInputs.push(file);
  }
  for (const variant of variants) {
    let current = variant.base;
    for (let si = 0; si < stickers.length; si++) {
      const sticker = stickers[si];
      const glyph = resolveStickerGlyph(sticker.stickerId);
      if (!glyph) continue;
      const file = path.join(outputDir, `sticker-${si}.txt`);
      await fs.promises.writeFile(file, glyph, "utf8");
      const out = `${variant.out}_sticker_${si}`;
      const x = `(w*${sticker.x}-text_w/2)`;
      const y = `(h*${sticker.y}-text_h/2)`;
      filters.push(`[${current}]drawtext=fontfile='${fontFile}':textfile='${file}':fontsize=${Math.round(sticker.size)}:fontcolor=white:borderw=2:bordercolor=black@0.8:x=${x}:y=${y}:enable='between(t,${sticker.startMs/1000},${sticker.endMs/1000})'[${out}]`);
      current = out;
    }
    const effectOut = `${variant.out}_effect`;
    filters.push(effectFilter(current, effectOut, effect));
    current = effectOut;
    textOverlays.forEach((overlay, index) => {
      const next = `${variant.out}_${index}`;
      const x = overlay.align === "left" ? `(w*${overlay.x})` : overlay.align === "right" ? `(w*${overlay.x}-text_w)` : `(w*${overlay.x}-text_w/2)`;
      const y = `(h*${overlay.y}-text_h/2)`;
      const start = Math.max(0, overlay.startMs / 1000);
      const end = Math.max(start + 0.01, overlay.endMs / 1000);
      filters.push(`[${current}]drawtext=fontfile=${fontFile}:textfile=${overlayInputs[index]}:fontsize=${Math.round(overlay.fontSize)}:fontcolor=${overlay.color ?? "#FFFFFF"}:box=1:boxcolor=${overlay.background ?? "#000000@0.55"}:boxborderw=12:borderw=2:bordercolor=black@0.85:x=${x}:y=${y}:enable=between(t\\,${start}\\,${end})[${next}]`);
      current = next;
    });
    captions.forEach((caption, index) => {
      const next = `${variant.out}_caption_${index}`;
      const start = Math.max(0, caption.startMs / 1000);
      const end = Math.max(start + 0.01, caption.endMs / 1000);
      filters.push(`[${current}]drawtext=fontfile=${fontFile}:textfile=${captionInputs[index]}:fontsize=34:fontcolor=white:borderw=3:bordercolor=black@0.9:x=(w-text_w)/2:y=h-text_h-80:enable=between(t\\,${start}\\,${end})[${next}]`);
      current = next;
    });
    filters.push(`[${current}]null[${variant.out}]`);
  }

  if (soundFile) {
    const soundInput = 1;
    const soundFilter = `[${soundInput}:a]atrim=duration=${Math.max(0.1, outputDurationSec).toFixed(3)},asetpts=N/SR/TB,volume=${addedSoundVolume}[added]`;
    filters.push(soundFilter);
    if (hasOriginalAudio && originalVolume > 0) {
      filters.push(`[0:a]atempo=${speed},volume=${originalVolume},atrim=duration=${Math.max(0.1, outputDurationSec).toFixed(3)},asetpts=N/SR/TB[original]`);
      filters.push("[original][added]amix=inputs=2:duration=first:dropout_transition=0:normalize=1[mixed]");
    } else {
      filters.push("[added]anull[mixed]");
    }
  } else if (hasOriginalAudio) {
    filters.push(`[0:a]atempo=${speed},volume=1,atrim=duration=${Math.max(0.1, outputDurationSec).toFixed(3)},asetpts=N/SR/TB[audio]`);
  }

  await fs.promises.writeFile(path.join(outputDir, "filters.txt"), filters.join(";"), "utf8");
  const audioMap = soundFile ? ["-map", "[mixed]"] : hasOriginalAudio ? ["-map", "[audio]"] : [];
  const args = [
    "-hide_banner", "-loglevel", "error", "-y",
    ...inputArgs,
    "-filter_complex_script", path.join(outputDir, "filters.txt"),
    "-map", "[v360]", "-c:v:0", "libx264", "-b:v:0", "500k", "-maxrate:v:0", "650k", "-bufsize:v:0", "1000k",
    "-map", "[v540]", "-c:v:1", "libx264", "-b:v:1", "1100k", "-maxrate:v:1", "1400k", "-bufsize:v:1", "2200k",
    "-map", "[v720]", "-c:v:2", "libx264", "-b:v:2", "2200k", "-maxrate:v:2", "2800k", "-bufsize:v:2", "4400k",
    ...audioMap,
    ...(audioMap.length ? ["-c:a", "aac", "-b:a", "96k", "-ar", "48000"] : []),
    "-force_key_frames", "expr:gte(t,n_forced*2)",
    "-g", "60", "-keyint_min", "60", "-sc_threshold", "0",
    "-f", "hls", "-hls_time", "2", "-hls_playlist_type", "vod",
    "-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", "init_%v.mp4",
    "-hls_segment_filename", path.join(outputDir, "seg_%v_%05d.m4s"),
    "-master_pl_name", "master.m3u8",
    "-var_stream_map", audioMap.length ? "v:0,a:0 v:1,a:0 v:2,a:0" : "v:0 v:1 v:2",
    path.join(outputDir, "stream_%v.m3u8")
  ];
  await runProcess(ffmpegBin, args);
}

async function getDurationMs(input: string) {
  try {
    const result = await new Promise<string>((resolve, reject) => {
      const child = spawn(ffprobeBin, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", input], { stdio: ["ignore", "pipe", "pipe"] });
      let out = ""; let err = "";
      child.stdout.on("data", chunk => { out += chunk.toString(); });
      child.stderr.on("data", chunk => { err += chunk.toString(); });
      child.on("error", reject);
      child.on("close", code => code === 0 ? resolve(out) : reject(new Error(err)));
    });
    const seconds = Number.parseFloat(result.trim());
    return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
  } catch { return null; }
}

async function concatClips(files: string[], output: string, transitions: Array<{ type: string; durationMs: number }> = []) {
  if (files.length === 1) { await fs.promises.copyFile(files[0], output); return; }
  const durations = await Promise.all(files.map(async file => Math.max(0.1, (await getDurationMs(file) ?? 100) / 1000)));
  const inputs: string[] = [];
  for (const file of files) inputs.push("-i", file);
  const filters: string[] = [];
  for (let i = 0; i < files.length; i += 1) {
    const audio = await hasAudio(files[i]);
    filters.push(`[${i}:v]fps=30,format=yuv420p,setpts=PTS-STARTPTS[v${i}]`);
    if (audio) filters.push(`[${i}:a]aresample=48000,asetpts=PTS-STARTPTS[a${i}]`);
    else filters.push(`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${durations[i].toFixed(3)},asetpts=N/SR/TB[a${i}]`);
  }
  let currentV = "v0", currentA = "a0", currentDuration = durations[0];
  for (let i = 1; i < files.length; i += 1) {
    const transition = transitions[i - 1] ?? { type: "NONE", durationMs: 0 };
    const d = Math.max(0, Math.min(1.5, Number(transition.durationMs ?? 0) / 1000));
    if (transition.type === "NONE" || d <= 0) {
      filters.push(`[${currentV}][v${i}]concat=n=2:v=1:a=0[vcat${i}]`);
      filters.push(`[${currentA}][a${i}]concat=n=2:v=0:a=1[acat${i}]`);
      currentV = `vcat${i}`; currentA = `acat${i}`; currentDuration += durations[i];
      continue;
    }
    const safeD = Math.min(d, Math.max(0.05, currentDuration - 0.05), Math.max(0.05, durations[i] - 0.05));
    const transitionName = transition.type === "FADE" ? "fade" : transition.type === "DISSOLVE" ? "fade" : transition.type === "WIPELEFT" ? "wipeleft" : transition.type === "WIPERIGHT" ? "wiperight" : transition.type === "SLIDELEFT" ? "slideleft" : "slideright";
    const offset = Math.max(0.05, currentDuration - safeD);
    filters.push(`[${currentV}][v${i}]xfade=transition=${transitionName}:duration=${safeD.toFixed(3)}:offset=${offset.toFixed(3)}[vtrans${i}]`);
    filters.push(`[${currentA}][a${i}]acrossfade=d=${safeD.toFixed(3)}[atrans${i}]`);
    currentV = `vtrans${i}`; currentA = `atrans${i}`; currentDuration = currentDuration + durations[i] - safeD;
  }
  filters.push(`[${currentV}]format=yuv420p[vout]`);
  filters.push(`[${currentA}]aresample=48000[aout]`);
  await runProcess(ffmpegBin, [
    "-hide_banner", "-loglevel", "error", "-y", ...inputs,
    "-filter_complex", filters.join(";"),
    "-map", "[vout]", "-map", "[aout]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
    "-movflags", "+faststart", output
  ]);
}

async function extractAudio(input: string, output: string) {
  await runProcess(ffmpegBin, ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-vn", "-c:a", "aac", "-b:a", "128k", "-ar", "48000", output]);
}

async function createThumbnail(input: string, output: string, coverTimeMs = 0) {
  await runProcess(ffmpegBin, [
    "-hide_banner", "-loglevel", "error", "-y", "-ss", String(Math.max(0, coverTimeMs) / 1000), "-i", input,
    "-frames:v", "1", "-vf", "scale=720:-2", "-q:v", "3", output
  ]);
}

async function processJob(db: Db, job: any) {
  const upload = await db.collection("video_uploads").findOne({ uploadId: job.uploadId, userId: job.userId });
  if (!upload) throw new Error("Upload session no longer exists");

  const video = await db.collection("videos").findOne({ uploadId: job.uploadId, ownerId: job.userId });
  if (!video) throw new Error("Video draft not found; waiting for creator settings");

  const soundLink = await db.collection("video_sounds").findOne({ videoId: video._id });
  let sound: any = null;
  let soundFile: string | undefined;
  const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "twitok-video-"));
  const input = path.join(workDir, "source");
  const outputDir = path.join(workDir, "hls");
  const thumbnail = path.join(workDir, "thumbnail.jpg");
  const originalSoundFile = path.join(workDir, "original-sound.m4a");
  try {
    await fs.promises.mkdir(outputDir);
    const clipUploads = Array.isArray(video.clips) && video.clips.length > 0 ? video.clips : [{ objectKey: upload.objectKey }];
    const clipFiles: string[] = [];
    for (let i = 0; i < clipUploads.length; i += 1) {
      const clipFile = path.join(workDir, `clip-${i}`);
      await downloadSource(String(clipUploads[i].objectKey), clipFile);
      clipFiles.push(clipFile);
    }
    const clipRanges = Array.isArray(video.clipTrimRanges) ? video.clipTrimRanges : [];
    const trimmedFiles: string[] = [];
    for (let i = 0; i < clipFiles.length; i += 1) { const range = clipRanges[i] ?? {}; const setting = Array.isArray(video.clipSettings) ? (video.clipSettings[i] ?? {}) : {}; const start = Math.max(0, Number(range.startMs ?? 0)); const end = Number(range.endMs ?? 0); const clipSpeed = [0.5,0.75,1,1.5,2].includes(Number(setting.speed)) ? Number(setting.speed) : 1; const clipVolume = setting.muted ? 0 : Math.max(0, Math.min(1, Number(setting.volume ?? 1))); if (start > 0 || end > start || clipSpeed !== 1 || clipVolume !== 1) { const trimmed = path.join(workDir, `trimmed-${i}.mp4`); const args = ["-hide_banner","-loglevel","error","-y", ...(start > 0 ? ["-ss", String(start/1000)] : []), "-i", clipFiles[i], ...(end > start ? ["-t", String((end-start)/1000)] : []), "-filter:v", "setpts=PTS/" + clipSpeed, "-af", "volume=" + clipVolume, "-c:v","libx264","-preset","veryfast","-crf","20","-c:a","aac","-b:a","128k","-ar","48000","-movflags","+faststart",trimmed]; await runProcess(ffmpegBin,args); trimmedFiles.push(trimmed); } else trimmedFiles.push(clipFiles[i]); }
    await concatClips(trimmedFiles, input, Array.isArray(video.clipTransitions) ? video.clipTransitions : []);
    const hasOriginalAudio = await hasAudio(input);

    if (soundLink?.soundId) {
      sound = await db.collection("sounds").findOne({ _id: soundLink.soundId, status: "ACTIVE" });
      if (!sound?.audioUrl) throw new Error("Selected sound has no playable audio asset");
      soundFile = path.join(workDir, "selected-sound");
      await downloadSoundAsset(String(sound.audioUrl), soundFile);
    }

    const sourceDurationMs = await getDurationMs(input);
    const trimStartMs = Math.max(0, Number(video.trimStartMs ?? 0));
    const rawTrimEndMs = video.trimEndMs == null ? null : Number(video.trimEndMs);
    const trimEndMs = rawTrimEndMs && rawTrimEndMs > trimStartMs ? rawTrimEndMs : null;
    const availableMs = Math.max(100, (trimEndMs ?? sourceDurationMs ?? Number(upload.durationMs ?? 1000)) - trimStartMs);
    const speed = [0.5, 0.75, 1, 1.5, 2].includes(Number(video.speed)) ? Number(video.speed) : 1;
    const outputDurationSec = availableMs / 1000 / speed;
    const originalVolume = Math.max(0, Math.min(1, Number(soundLink?.originalVolume ?? 1)));
    const addedSoundVolume = Math.max(0, Math.min(1, Number(soundLink?.addedSoundVolume ?? 1)));

    await runFfmpeg(input, outputDir, {
      hasOriginalAudio,
      trimStartMs,
      trimEndMs,
      speed,
      soundFile,
      originalVolume,
      addedSoundVolume,
      outputDurationSec,
      textOverlays: Array.isArray(video.textOverlays) ? video.textOverlays : [],
      captions: Array.isArray(video.captions) ? video.captions : [],
      effect: String(video.effect ?? "NONE"),
      stickers: Array.isArray(video.stickers) ? video.stickers : [],
      editPlan: video.editPlan ?? undefined
    });

    await createThumbnail(input, thumbnail, Number(video.coverTimeMs ?? 0));
    const baseKey = upload.objectKey.replace(/\/source$/, "");
    const files = await fs.promises.readdir(outputDir);
    for (const file of files) {
      const type = file.endsWith(".m3u8") ? "application/vnd.apple.mpegurl"
        : file.endsWith(".m4s") ? "video/iso.segment"
        : file.endsWith(".mp4") ? "video/mp4" : "application/octet-stream";
      await uploadFile(path.join(outputDir, file), `${baseKey}/hls/${file}`, type);
    }

    const thumbnailKey = `${baseKey}/thumbnail.jpg`;
    await uploadFile(thumbnail, thumbnailKey, "image/jpeg");

    if (hasOriginalAudio) {
      const originalDurationSec = Math.max(0.1, outputDurationSec);
      await runProcess(ffmpegBin, [
        "-hide_banner", "-loglevel", "error", "-y",
        ...(trimStartMs > 0 ? ["-ss", String(trimStartMs / 1000)] : []),
        ...(trimEndMs ? ["-to", String(trimEndMs / 1000)] : []),
        "-i", input,
        "-vn", "-af", `atempo=${speed},atrim=duration=${originalDurationSec.toFixed(3)},asetpts=N/SR/TB`,
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000", originalSoundFile
      ]);
      const originalSoundKey = `${baseKey}/original-sound.m4a`;
      await uploadFile(originalSoundFile, originalSoundKey, "audio/mp4");
      await createOriginalSound(db, video._id, urlFor(originalSoundKey), Math.round(outputDurationSec * 1000));
    }

    const playbackKey = `${baseKey}/hls/master.m3u8`;
    await markVideoProcessingSucceeded(db, job._id, {
      hlsUrl: urlFor(playbackKey),
      thumbnailUrl: urlFor(thumbnailKey),
      durationMs: Math.round(outputDurationSec * 1000)
    });
  } finally {
    await fs.promises.rm(workDir, { recursive: true, force: true });
  }
}

async function loop() {
  const db = await getDb();
  console.log(`TwiTok video worker ${workerId} started`);
  for (;;) {
    await recoverExpiredVideoJobs(db);
    const job = await claimNextVideoJob(db, workerId);
    if (!job) {
      await new Promise(resolve => setTimeout(resolve, pollMs));
      continue;
    }
    try {
      await processJob(db, job);
      console.log(`processed ${job.uploadId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown processing error";
      console.error(`failed ${job.uploadId}: ${message}`);
      await markVideoProcessingFailed(db, job._id, message);
    }
  }
}

loop().catch(error => {
  console.error("TwiTok video worker stopped", error);
  process.exit(1);
});
