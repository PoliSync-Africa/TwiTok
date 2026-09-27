"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
type Step = "SELECT" | "EDIT" | "UPLOADING" | "PROCESSING" | "READY";

type Sound = { _id: string; title: string; artist: string; durationMs: number; coverUrl?: string; audioUrl?: string };

export default function CreatePage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [visibility, setVisibility] = useState<"PUBLIC" | "FOLLOWERS" | "PRIVATE">("PUBLIC");
  const [allowComments, setAllowComments] = useState(true);
  const [allowDuet, setAllowDuet] = useState(true);
  const [allowStitch, setAllowStitch] = useState(true);
  const [muted, setMuted] = useState(false);
  const [step, setStep] = useState<Step>("SELECT");
  const [message, setMessage] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string>("PROCESSING");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [coverTimeMs, setCoverTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [trimStartMs, setTrimStartMs] = useState(0);
  const [trimEndMs, setTrimEndMs] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [soundQuery, setSoundQuery] = useState("");
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [selectedSound, setSelectedSound] = useState<Sound | null>(null);
  const [soundOpen, setSoundOpen] = useState(false);
  const [soundLoading, setSoundLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const soundAudioRef = useRef<HTMLAudioElement | null>(null);
  const [soundPlaying, setSoundPlaying] = useState(false);
  const [soundInitialized, setSoundInitialized] = useState(false);
  const [originalVolume, setOriginalVolume] = useState(1);
  const [addedSoundVolume, setAddedSoundVolume] = useState(1);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = speed; }, [speed, preview]);

  useEffect(() => () => { soundAudioRef.current?.pause(); }, []);

  useEffect(() => {
    if (step !== "PROCESSING" || !videoId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      const token = window.localStorage.getItem("twitok_user_token");
      if (!token) return;
      try {
        const response = await fetch(API + "/video/" + encodeURIComponent(videoId), { headers: { Authorization: "Bearer " + token } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Unable to check processing status.");
        if (cancelled) return;
        setProcessingStatus(data.status ?? "PROCESSING");
        if (data.status === "READY") {
          setStep("READY");
          setMessage("Your video is ready. Review the result and publish it.");
          return;
        }
        if (data.status === "BLOCKED" || data.status === "FAILED") {
          setStep("EDIT");
          setMessage(data.status === "BLOCKED" ? "The video was blocked by the TwiTok Safety Engine." : "Video processing failed. Please try again.");
          return;
        }
        timer = setTimeout(poll, 2000);
      } catch (error) {
        if (!cancelled) timer = setTimeout(poll, 4000);
      }
    };
    poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [step, videoId]);

  async function publishReadyVideo() {
    if (!videoId) return;
    const token = window.localStorage.getItem("twitok_user_token");
    if (!token) return setMessage("Sign in to publish this video.");
    try {
      setMessage("Publishing your video…");
      const response = await fetch(API + "/video/" + encodeURIComponent(videoId) + "/publish", { method: "POST", headers: { Authorization: "Bearer " + token } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to publish video.");
      setStep("READY");
      setProcessingStatus("PUBLISHED");
      setMessage("Published successfully. Your video is now live on TwiTok.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to publish video.");
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const soundId = params.get("soundId");
    if (!soundId) return;
    const token = window.localStorage.getItem("twitok_user_token");
    if (!token) return;
    fetch(API + "/music/sounds/" + encodeURIComponent(soundId), { headers: { Authorization: "Bearer " + token } })
      .then(async response => { const data = await response.json(); if (response.ok && data.sound) { setSelectedSound(data.sound); setSoundInitialized(true); } })
      .catch(() => undefined);
  }, []);

  async function toggleSoundPreview(sound: Sound) {
    if (!sound.audioUrl) return setMessage("This sound does not have a preview available yet.");
    if (!soundAudioRef.current) soundAudioRef.current = new Audio();
    const audio = soundAudioRef.current;
    if (selectedSound?._id === sound._id && soundPlaying) { audio.pause(); setSoundPlaying(false); return; }
    audio.src = sound.audioUrl;
    audio.currentTime = 0;
    audio.onended = () => setSoundPlaying(false);
    await audio.play();
    setSoundPlaying(true);
  }

  const sizeText = useMemo(() => file ? (file.size / 1024 / 1024).toFixed(1) + " MB" : "", [file]);

  function onLoadedMetadata(e: React.SyntheticEvent<HTMLVideoElement>) {
    const d = e.currentTarget.duration;
    if (Number.isFinite(d)) {
      const ms = Math.round(d * 1000);
      setDurationMs(ms);
      setTrimEndMs(ms);
    }
  }

  function chooseFile(next: File | null) {
    if (!next) return;
    if (!next.type.startsWith("video/")) return setMessage("Please choose a video file.");
    if (next.size > 500 * 1024 * 1024) return setMessage("Maximum video size is 500 MB.");
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setStep("EDIT");
    setMessage("");
  }

  async function searchSounds() {
    const token = window.localStorage.getItem("twitok_user_token");
    if (!token) return setMessage("Sign in to browse sounds.");
    setSoundLoading(true);
    try {
      const url = API + "/music/sounds?q=" + encodeURIComponent(soundQuery);
      const response = await fetch(url, { headers: { Authorization: "Bearer " + token } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load sounds.");
      setSounds(data.sounds ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load sounds.");
    } finally {
      setSoundLoading(false);
    }
  }

  async function publishDraft() {
    if (!file) return;
    const token = window.localStorage.getItem("twitok_user_token");
    if (!token) return setMessage("Sign in to TwiTok before creating a post.");

    setStep("UPLOADING");
    setMessage("Preparing secure upload…");
    try {
      const create = await fetch(API + "/video/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size })
      });
      const session = await create.json();
      if (!create.ok || !session.uploadUrl) throw new Error(session.error ?? "Media storage is not configured.");

      const put = await fetch(session.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error("Video upload failed.");
      setUploadProgress(75);

      const complete = await fetch(API + "/video/uploads/" + session.uploadId + "/complete", {
        method: "POST", headers: { Authorization: "Bearer " + token }
      });
      const completed = await complete.json();
      if (!complete.ok) throw new Error(completed.error ?? "Unable to finalize upload.");

      const tags = hashtags.split(/[ ,#]+/).map(v => v.trim()).filter(Boolean).slice(0, 30);
      const draft = await fetch(API + "/video/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          uploadId: session.uploadId, caption, hashtags: tags, visibility,
          allowComments, allowDuet, allowStitch, coverTimeMs, trimStartMs, trimEndMs, speed, soundId: selectedSound?._id, originalVolume, addedSoundVolume
        })
      });
      const draftData = await draft.json();
      if (!draft.ok) throw new Error(draftData.error ?? "Unable to create draft.");

      setUploadProgress(100);
      setVideoId(String(draftData.videoId));
      setProcessingStatus(String(draftData.status ?? "PROCESSING"));
      setStep("PROCESSING");
      setMessage(draftData.safety === "RESTRICT"
        ? "The post was held by the TwiTok Safety Engine."
        : "Upload accepted. Video processing is now running.");
    } catch (error) {
      setStep("EDIT");
      setMessage(error instanceof Error ? error.message : "Unable to create post.");
    }
  }

  return (
    <main className="composer-page">
      <header className="composer-header">
        <Link href="/" className="back">← Back</Link>
        <strong>Create on TwiTok</strong>
        <span className="composer-brand">TwiTok</span>
      </header>

      <section className="composer-shell">
        <div className="composer-preview">
          {preview ? (
            <video ref={videoRef} src={preview} controls playsInline muted={muted} className="composer-video" onLoadedMetadata={onLoadedMetadata} />
          ) : (
            <label className="dropzone">
              <span className="plus">＋</span><b>Upload a video</b><small>MP4, MOV or WebM · up to 500 MB</small>
              <input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={e => chooseFile(e.target.files?.[0] ?? null)} />
            </label>
          )}
        </div>

        <div className="composer-panel">
          <div className="composer-title">
            <div><span>VIDEO POST</span><h1>Create</h1></div>
            {file && <label className="secondary">Replace<input type="file" accept="video/*" onChange={e => chooseFile(e.target.files?.[0] ?? null)} /></label>}
          </div>

          {file && <>
            <div className="file-pill"><b>{file.name}</b><span>{sizeText}</span></div>

            <button type="button" className="sound-button" onClick={() => setSoundOpen(v => !v)}>
              ♪ {selectedSound ? selectedSound.title + " — " + selectedSound.artist : "Add sound"}{soundInitialized ? " ✓" : ""}
            </button>

            {soundOpen && <div className="sound-picker">
              <div className="sound-search">
                <input value={soundQuery} onChange={e => setSoundQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") searchSounds(); }} placeholder="Search African sounds, artists…" />
                <button type="button" onClick={searchSounds} disabled={soundLoading}>{soundLoading ? "Searching…" : "Search"}</button>
              </div>
              <div className="sound-list">
                {sounds.map(sound => (
                  <button type="button" className="sound-row" key={sound._id} onClick={() => { setSelectedSound(sound); setSoundOpen(false); }}>
                    <span className="sound-cover">♪</span>
                    <span><b>{sound.title}</b><small>{sound.artist}</small></span>
                    <small>{Math.round(sound.durationMs / 1000)}s</small>
                  </button>
                ))}
                {!soundLoading && sounds.length === 0 && <small>No sounds found. Search the TwiTok library.</small>}
              </div>
            </div>}

            {selectedSound && <div className="sound-mixer">
              <b>Sound mix</b>
              <label>Original video sound: {Math.round(originalVolume * 100)}%<input type="range" min="0" max="1" step="0.05" value={originalVolume} onChange={e => setOriginalVolume(Number(e.target.value))} /></label>
              <label>Added sound: {Math.round(addedSoundVolume * 100)}%<input type="range" min="0" max="1" step="0.05" value={addedSoundVolume} onChange={e => setAddedSoundVolume(Number(e.target.value))} /></label>
            </div>}

            <label>Caption
              <textarea maxLength={2200} value={caption} onChange={e => setCaption(e.target.value)} placeholder="Tell Africa what this video is about…" />
              <small>{caption.length}/2200</small>
            </label>

            <label>Hashtags
              <input value={hashtags} onChange={e => setHashtags(e.target.value)} placeholder="#Ghana #Africa #TwiTok" />
            </label>

            <label>Cover position (seconds)
              <input type="number" min="0" step="0.1" value={coverTimeMs / 1000} onChange={e => setCoverTimeMs(Math.max(0, Number(e.target.value) * 1000 || 0))} />
            </label>

            <div className="speed-selector"><b>Speed</b><div className="speed-options">{[0.5, 0.75, 1, 1.5, 2].map(value => <button type="button" key={value} className={speed === value ? "selected" : ""} onClick={() => setSpeed(value)}>{value}×</button>)}</div></div>

            <div className="trim-editor">
              <b>Trim video</b>
              <div className="trim-values"><span>{(trimStartMs / 1000).toFixed(1)}s</span><span>{(trimEndMs / 1000).toFixed(1)}s</span></div>
              <input type="range" min="0" max={Math.max(durationMs, 1)} step="100" value={trimStartMs} onChange={e => setTrimStartMs(Math.min(Number(e.target.value), Math.max(0, trimEndMs - 100)))} />
              <input type="range" min="0" max={Math.max(durationMs, 1)} step="100" value={trimEndMs} onChange={e => setTrimEndMs(Math.max(Number(e.target.value), trimStartMs + 100))} />
              <small>Select the start and end of the clip.</small>
            </div>

            <div className="option-grid">
              <label>Visibility<select value={visibility} onChange={e => setVisibility(e.target.value as typeof visibility)}><option value="PUBLIC">Everyone</option><option value="FOLLOWERS">Followers</option><option value="PRIVATE">Only me</option></select></label>
              <label>Comments<select value={allowComments ? "ON" : "OFF"} onChange={e => setAllowComments(e.target.value === "ON")}><option>ON</option><option>OFF</option></select></label>
              <label>Duet<select value={allowDuet ? "ON" : "OFF"} onChange={e => setAllowDuet(e.target.value === "ON")}><option>ON</option><option>OFF</option></select></label>
              <label>Stitch<select value={allowStitch ? "ON" : "OFF"} onChange={e => setAllowStitch(e.target.value === "ON")}><option>ON</option><option>OFF</option></select></label>
            </div>

            {step === "READY" && processingStatus === "PUBLISHED" ? (
              <Link href="/" className="primary-action">View your video</Link>
            ) : step === "READY" ? (
              <button type="button" className="primary-action" onClick={publishReadyVideo}>Publish video</button>
            ) : (
              <button type="button" className="primary-action" onClick={publishDraft} disabled={step === "UPLOADING" || step === "PROCESSING"}>
                {step === "UPLOADING" ? "Uploading…" : step === "PROCESSING" ? "Processing…" : "Post"}
              </button>
            )}
            <button type="button" className="secondary-action" onClick={() => setMuted(v => !v)}>Preview sound: {muted ? "Off" : "On"}</button>
            {step === "UPLOADING" && <small>Upload progress: {uploadProgress}%</small>}
            {step === "PROCESSING" && <small>Processing status: {processingStatus} · We’ll notify this page when the video is ready.</small>}
            {step === "READY" && processingStatus !== "PUBLISHED" && <small>Processing complete. The video has passed the media pipeline and is waiting for your publication confirmation.</small>}
            {message && <p className="composer-message">{message}</p>}
          </>}
        </div>
      </section>
    </main>
  );
}
