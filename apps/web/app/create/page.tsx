"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

type Step = "SELECT" | "EDIT" | "UPLOADING" | "PROCESSING";

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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [coverTimeMs, setCoverTimeMs] = useState(0);\n  const [durationMs, setDurationMs] = useState(0);\n  const [trimStartMs, setTrimStartMs] = useState(0);\n  const [trimEndMs,\n          speed, setTrimEndMs] = useState(0);\n  const [speed, setSpeed] = useState(1);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const sizeText = useMemo(() => file ? (file.size / 1024 / 1024).toFixed(1) + " MB" : "", [file]);

  function onLoadedMetadata(e: React.SyntheticEvent<HTMLVideoElement>) { const d = e.currentTarget.duration; if (Number.isFinite(d)) { const ms = Math.round(d * 1000); setDurationMs(ms); setTrimEndMs(ms); } }\n\n  function chooseFile(next: File | null) {
    if (!next) return;
    if (!next.type.startsWith("video/")) return setMessage("Please choose a video file.");
    if (next.size > 500 * 1024 * 1024) return setMessage("Maximum video size is 500 MB.");
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setStep("EDIT");
    setMessage("");
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

      const put = await fetch(session.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file
      });
      if (!put.ok) throw new Error("Video upload failed.");

      setUploadProgress(75);
      const complete = await fetch(API + "/video/uploads/" + session.uploadId + "/complete", {
        method: "POST",
        headers: { Authorization: "Bearer " + token }
      });
      const completed = await complete.json();
      if (!complete.ok) throw new Error(completed.error ?? "Unable to finalize upload.");

      const tags = hashtags.split(/[ ,#]+/).map(v => v.trim()).filter(Boolean).slice(0, 30);
      const draft = await fetch(API + "/video/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          uploadId: session.uploadId,
          caption,
          hashtags: tags,
          visibility,
          allowComments,
          allowDuet,
          allowStitch
        })
      });
      const draftData = await draft.json();
      if (!draft.ok) throw new Error(draftData.error ?? "Unable to create draft.");

      setUploadProgress(100);
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
            <video src={preview} controls playsInline muted={muted} className="composer-video" onLoadedMetadata={onLoadedMetadata} />
          ) : (
            <label className="dropzone">
              <span className="plus">＋</span>
              <b>Upload a video</b>
              <small>MP4, MOV or WebM · up to 500 MB</small>
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

            <label>Caption
              <textarea maxLength={2200} value={caption} onChange={e => setCaption(e.target.value)} placeholder="Tell Africa what this video is about…" />
              <small>{caption.length}/2200</small>
            </label>

            <label>Hashtags
              <input value={hashtags} onChange={e => setHashtags(e.target.value)} placeholder="#Ghana #Africa #TwiTok" />
            </label>

            <label>Cover position (seconds)<input type="number" min="0" step="0.1" value={coverTimeMs / 1000} onChange={e => setCoverTimeMs(Math.max(0, Number(e.target.value) * 1000 || 0))} /></label>\n\n            <div className="speed-selector"><b>Speed</b><div className="speed-options">{[0.5,0.75,1,1.5,2].map(value => <button type="button" key={value} className={speed === value ? "selected" : ""} onClick={() => setSpeed(value)}>{value}×</button>)}</div></div>\n\n            <div className="trim-editor"><b>Trim video</b><div className="trim-values"><span>{(trimStartMs / 1000).toFixed(1)}s</span><span>{(trimEndMs / 1000).toFixed(1)}s</span></div><input type="range" min="0" max={Math.max(durationMs, 1)} step="100" value={trimStartMs} onChange={e => setTrimStartMs(Math.min(Number(e.target.value), Math.max(0, trimEndMs - 100)))} /><input type="range" min="0" max={Math.max(durationMs, 1)} step="100" value={trimEndMs} onChange={e => setTrimEndMs(Math.max(Number(e.target.value), trimStartMs + 100))} /><small>Select the start and end of the clip.</small></div>
