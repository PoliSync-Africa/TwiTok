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

async function renewVideoLease(db: Db, jobId: any, workerId: string) {
  const leaseExpiresAt = new Date(Date.now() + 2 * 60 * 1000);
  const result = await db.collection("video_processing_jobs").updateOne(
    { _id: jobId, status: "RUNNING", workerId },
    { $set: { leaseExpiresAt, updatedAt: new Date() } }
  );
  if (result.modifiedCount !== 1) throw new Error("Video processing lease was lost");
}

async function processJob(db: Db, job: any) {
  await renewVideoLease(db, job._id, workerId);
  const heartbeat = setInterval(() => {
    void renewVideoLease(db, job._id, workerId).catch(error => {
      console.error(`lease renewal failed for ${job.uploadId}: ${error instanceof Error ? error.message : "unknown error"}`);
    });
  }, 30_000);
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
    clearInterval(heartbeat);
    await fs.promises.rm(workDir, { recursive: true, force: true });
  }
}

async function loop() {
  const db = await getDb();
  console.log(`TwiTok video worker ${workerId} started`);
  for (;;) {
    await recoverExpiredVideoJobs(db);
    await recoverStaleVideoUploads(db);
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
      await markVideoProcessingFailed(db, job._id, message, workerId);
    }
  }
}

loop().catch(error => {
  console.error("TwiTok video worker stopped", error);
  process.exit(1);
});