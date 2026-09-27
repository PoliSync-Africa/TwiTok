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
  const [coverTimeMs, setCoverTimeMs] = useState(0);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const sizeText = useMemo(() => file ? (file.size / 1024 / 1024).toFixed(1) + " MB" : "", [file]);

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
            <video src={preview} controls playsInline muted={muted} className="composer-video" />
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

            <div className="settings-grid">
              <label>Who can view
                <select value={visibility} onChange={e => setVisibility(e.target.value as typeof visibility)}>
                  <option value="PUBLIC">Everyone</option>
                  <option value="FOLLOWERS">Followers</option>
                  <option value="PRIVATE">Only me</option>
                </select>
              </label>
              <button className="toggle-row" onClick={() => setMuted(v => !v)}>Preview sound <b>{muted ? "Off" : "On"}</b></button>
            </div>

            <div className="switches">
              <button onClick={() => setAllowComments(v => !v)}><span>Comments</span><b className={allowComments ? "on" : ""}>{allowComments ? "ON" : "OFF"}</b></button>
              <button onClick={() => setAllowDuet(v => !v)}><span>Duet</span><b className={allowDuet ? "on" : ""}>{allowDuet ? "ON" : "OFF"}</b></button>
              <button onClick={() => setAllowStitch(v => !v)}><span>Stitch</span><b className={allowStitch ? "on" : ""}>{allowStitch ? "ON" : "OFF"}</b></button>
            </div>

            <div className="composer-note">
              <b>Safety before publishing</b>
              <span>TwiTok checks the caption and applies platform safety rules before the post can become public.</span>
            </div>

            {step === "UPLOADING" && <div className="progress"><span style={{ width: uploadProgress + "%" }} /></div>}
            {message && <div className="composer-message">{message}</div>}

            <button className="publish-button" disabled={step === "UPLOADING" || step === "PROCESSING"} onClick={publishDraft}>
              {step === "UPLOADING" ? "Uploading…" : step === "PROCESSING" ? "Processing…" : "Post to TwiTok"}
            </button>
          </>}

          {!file && <p className="composer-hint">Choose a video to open the creator editor. TwiTok will upload the original securely, run the safety gate, and send the media to the transcoding pipeline.</p>}
        </div>
      </section>
    </main>
  );
}
