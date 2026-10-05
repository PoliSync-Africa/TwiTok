"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
type Step = "SELECT" | "EDIT" | "UPLOADING" | "PROCESSING" | "READY";

type Sound = { _id: string; title: string; artist: string; durationMs: number; coverUrl?: string; audioUrl?: string };

export default function CreatePage() {
  const [file, setFile] = useState<File | null>(null);
  const [clipFiles, setClipFiles] = useState<File[]>([]);
  const [clipTransitions, setClipTransitions] = useState<any[]>([]);
  const [clipSettings, setClipSettings] = useState<any[]>([]);
  const [selectedClip, setSelectedClip] = useState(0);
  const [timelineTransition, setTimelineTransition] = useState(0);
  const [timelinePlayheadMs, setTimelinePlayheadMs] = useState(0);
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  const timelineVideoRef = useRef<HTMLVideoElement | null>(null);
  function getTimelineClipAt(ms:number) { let cursor=0; for (let i=0;i<clipFiles.length;i++){ const s=timelineStartMs[i] ?? 0; const e=timelineEndMs[i] ?? 10000; const speed=clipSettings[i]?.speed ?? 1; const duration=Math.max(100,e-s)/speed; if(ms <= cursor+duration || i===clipFiles.length-1) return {index:i, localMs:Math.max(0,ms-cursor)*speed}; cursor+=duration; } return {index:0,localMs:0}; }
  function seekTimeline(ms:number) { const value=Math.max(0,Math.min(timelineTotalMs,ms)); const target=getTimelineClipAt(value); setTimelinePlayheadMs(value); setSelectedClip(target.index); if (timelineVideoRef.current) timelineVideoRef.current.currentTime=(target.localMs+(timelineStartMs[target.index] ?? 0))/1000; }
  const [timelineHistory, setTimelineHistory] = useState<any[]>([]);
  const [timelineFuture, setTimelineFuture] = useState<any[]>([]);
  const timelineSnapshot = () => ({ files: clipFiles, starts: timelineStartMs, ends: timelineEndMs, transitions: clipTransitions, settings: clipSettings });
  const pushTimelineHistory = () => { setTimelineHistory(h => [...h.slice(-19), timelineSnapshot()]); setTimelineFuture([]); };
  const restoreTimeline = (s:any) => { setClipFiles(s.files); setTimelineStartMs(s.starts); setTimelineEndMs(s.ends); setClipTransitions(s.transitions); setClipSettings(s.settings ?? []); };
  const undoTimeline = () => { if (!timelineHistory.length) return; const current=timelineSnapshot(); const next=timelineHistory[timelineHistory.length-1]; setTimelineHistory(h=>h.slice(0,-1)); setTimelineFuture(f=>[current,...f].slice(0,20)); restoreTimeline(next); };
  const redoTimeline = () => { if (!timelineFuture.length) return; const current=timelineSnapshot(); const next=timelineFuture[0]; setTimelineFuture(f=>f.slice(1)); setTimelineHistory(h=>[...h.slice(-19),current]); restoreTimeline(next); };
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
  const [timelineStartMs, setTimelineStartMs] = useState<Record<number, number>>({});
  const [timelineEndMs, setTimelineEndMs] = useState<Record<number, number>>({});
  const timelineTotalMs = Math.max(1, clipFiles.reduce((sum,_,i) => { const s=timelineStartMs[i] ?? 0; const e=timelineEndMs[i] ?? 10000; const speed=clipSettings[i]?.speed ?? 1; return sum + Math.max(100,e-s)/speed; },0));
  const activeTimelineClip = getTimelineClipAt(timelinePlayheadMs);
  const [trimEndMs, setTrimEndMs] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [effect, setEffect] = useState("NONE");
  const [stickers, setStickers] = useState<any[]>([]);
  const [stickerPicker, setStickerPicker] = useState<any[]>([]);
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
  const [overlayText, setOverlayText] = useState("");
  const [overlayStartMs, setOverlayStartMs] = useState(0);
  const [overlayEndMs, setOverlayEndMs] = useState(3000);
  const [overlayColor, setOverlayColor] = useState("#FFFFFF");
  const [overlayFontSize, setOverlayFontSize] = useState(42);
  const [overlayAlign, setOverlayAlign] = useState("center");
  const [textOverlays, setTextOverlays] = useState<Array<{text:string;startMs:number;endMs:number;x:number;y:number;fontSize:number;color:string;background:string;align:string}>>([]);
  const [autoCaptions, setAutoCaptions] = useState(true);
  const [captionLanguage, setCaptionLanguage] = useState("auto");
  const [generatedCaptions, setGeneratedCaptions] = useState<Array<{text:string;startMs:number;endMs:number}>>([]);
  const [captionsLoading, setCaptionsLoading] = useState(false);
  const [captionsSaving, setCaptionsSaving] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraRecording, setCameraRecording] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<"user" | "environment">("user");
  const [cameraDurationLimit, setCameraDurationLimit] = useState<15 | 60 | 600>(60);
  const cameraPreviewRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraChunksRef = useRef<Blob[]>([]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); cameraStreamRef.current?.getTracks().forEach(track => track.stop()); }, [preview]);
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
          await loadGeneratedCaptions(videoId);
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

  async function loadGeneratedCaptions(id: string) {
    const token = window.localStorage.getItem("twitok_user_token");
    if (!token) return;
    setCaptionsLoading(true);
    try {
      const response = await fetch(API + "/video/" + encodeURIComponent(id) + "/captions", { headers: { Authorization: "Bearer " + token } });
      const data = await response.json();
      if (response.ok && Array.isArray(data.captions)) setGeneratedCaptions(data.captions.map((x: any) => ({ text: String(x.text ?? ""), startMs: Number(x.startMs ?? 0), endMs: Number(x.endMs ?? 1000) })));
    } finally { setCaptionsLoading(false); }
  }

  async function saveGeneratedCaptions() {
    if (!videoId) return;
    const token = window.localStorage.getItem("twitok_user_token");
    if (!token) return;
    setCaptionsSaving(true);
    try {
      const response = await fetch(API + "/video/" + encodeURIComponent(videoId) + "/captions", {
        method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ captions: generatedCaptions })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to save captions.");
      setGeneratedCaptions(data.captions ?? generatedCaptions);
      setMessage("Captions saved and the caption track was updated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save captions."); }
    finally { setCaptionsSaving(false); }
  }

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

  function onLoadedMetadata(e: SyntheticEvent<HTMLVideoElement>) {
    const d = e.currentTarget.duration;
    if (Number.isFinite(d)) {
      const ms = Math.round(d * 1000);
      setDurationMs(ms);
      setTrimEndMs(ms);
    }
  }

  function chooseFiles(nextFiles: FileList | null) {
    const next = Array.from(nextFiles ?? []).filter(f => f.type.startsWith("video/") && f.size <= 500 * 1024 * 1024).slice(0, 20);
    if (!next.length) return setMessage("Please choose one or more video files under 500 MB each.");
    setClipFiles(next); setClipTransitions(next.slice(1).map(() => ({ type: "NONE", durationMs: 500 }))); setClipSettings(next.map(() => ({speed:1,volume:1,muted:false}))); chooseFile(next[0]); setMessage(next.length > 1 ? `${next.length} clips selected. Reorder them before posting.` : "");
  }

  function updateClipTrim(index: number, start: number, end: number) { setTimelineStartMs(v => ({...v, [index]: Math.max(0, start)})); setTimelineEndMs(v => ({...v, [index]: Math.max(start + 100, end)})); }

  function updateClipSpeed(index: number, value: number) { setClipFiles(items => items.map((f,i) => i === index ? f : f)); }

  function deleteClip(index: number) { if (clipFiles.length <= 1) return; pushTimelineHistory(); setClipFiles(items => items.filter((_,i)=>i!==index)); setClipTransitions(items => items.filter((_,i)=>i!==index && i!==index-1)); }
  function duplicateClip(index: number) { pushTimelineHistory(); setClipFiles(items => { const next=[...items]; next.splice(index+1,0,items[index]); return next; }); setClipTransitions(items => [...items, {type:"NONE",durationMs:500}].slice(0,Math.max(0,clipFiles.length))); }
  function splitClip(index: number) { const start=timelineStartMs[index] ?? 0; const end=timelineEndMs[index] ?? 0; if (end-start < 400) return; const mid=Math.floor((start+end)/2); pushTimelineHistory(); setTimelineEndMs(v=>({...v,[index]:mid})); setTimelineStartMs(v=>({...v,[index+1]:mid})); setTimelineEndMs(v=>({...v,[index+1]:end})); setClipFiles(items=>{const next=[...items]; next.splice(index+1,0,items[index]); return next;}); setClipTransitions(items=>{const next=[...items]; next.splice(index,0,{type:"NONE",durationMs:500}); return next;}); }
  function updateClipSetting(index:number, patch:any) { setClipSettings(items => items.map((x,i)=>i===index ? {...x,...patch}:x)); }
  function setTransition(index: number, type: string) { setClipTransitions(items => items.map((x,i) => i === index ? {...x, type} : x)); }

  function moveClip(index: number, direction: -1 | 1) {
    setClipFiles(items => { const next = [...items]; const target = index + direction; if (target < 0 || target >= next.length) return next; [next[index], next[target]] = [next[target], next[index]]; setClipTransitions(ts => { const normalized = [...ts]; while (normalized.length < next.length - 1) normalized.push({type:"NONE",durationMs:500}); return normalized.slice(0,next.length-1); }); if (next[0]) { setFile(next[0]); if (preview) URL.revokeObjectURL(preview); setPreview(URL.createObjectURL(next[0])); } return next; });
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

  async function openBrowserCamera(nextFacingMode: "user" | "environment" = cameraFacingMode) {
    if (typeof navigator === "undefined") return;
    if (!window.isSecureContext) {
      setMessage("Camera requires a secure HTTPS connection.");
      setCameraActive(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("This browser does not provide camera access. Use the TwiTok mobile app or upload a video.");
      setCameraActive(false);
      return;
    }

    stopBrowserCamera();

    try {
      // Request video first so a microphone permission/device problem cannot
      // make the entire camera preview fail.
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: nextFacingMode }, width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: false
      });

      let stream = cameraStream;
      try {
        const microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphoneStream.getAudioTracks().forEach(track => stream.addTrack(track));
      } catch {
        // Camera remains usable without microphone; users can add a sound later.
      }

      cameraStreamRef.current = stream;
      setCameraFacingMode(nextFacingMode);
      setCameraActive(true);
      setMessage("");
      requestAnimationFrame(() => {
        if (cameraPreviewRef.current) {
          cameraPreviewRef.current.srcObject = stream;
          void cameraPreviewRef.current.play().catch(() => undefined);
        }
      });
    } catch (error) {
      setCameraActive(false);
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setMessage("Camera permission is blocked. Allow Camera for twitokapp.com in your browser settings, then tap Enable camera to retry.");
      } else if (name === "NotFoundError") {
        setMessage("No camera was found on this device.");
      } else {
        setMessage("Unable to open the camera. Tap Flip to retry or choose Upload.");
      }
    }
  }

  function stopBrowserCamera() {
    const recorder = cameraRecorderRef.current;
    cameraRecorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch { /* already stopped */ }
    }
    cameraStreamRef.current?.getTracks().forEach(track => track.stop());
    cameraStreamRef.current = null;
    setCameraActive(false);
    setCameraRecording(false);
  }

  function recordBrowserVideo() {
    const stream = cameraStreamRef.current;
    if (!stream || cameraRecording) return;
    const mimeType = MediaRecorder.isTypeSupported("video/mp4") ? "video/mp4" : MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    cameraChunksRef.current = chunks;
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const extension = mimeType.includes("mp4") ? "mp4" : "webm";
      const recorded = new File([blob], "twitok-camera-" + Date.now() + "." + extension, { type: mimeType });
      cameraRecorderRef.current = null;
      cameraStreamRef.current?.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
      setCameraActive(false);
      setCameraRecording(false);
      chooseFile(recorded);
    };
    recorder.start(250);
    cameraRecorderRef.current = recorder;
    setCameraRecording(true);
    window.setTimeout(() => {
      if (cameraRecorderRef.current === recorder && recorder.state === "recording") recorder.stop();
    }, cameraDurationLimit * 1000);
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


  function uploadWithProgress(url: string, uploadFile: File, onProgress: (value: number) => void) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.setRequestHeader("Content-Type", uploadFile.type);
      xhr.upload.onprogress = event => {
        if (event.lengthComputable) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      };
      xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Video upload failed."));
      xhr.onerror = () => reject(new Error("Video upload failed. Check your connection and try again."));
      xhr.onabort = () => reject(new Error("Video upload was cancelled."));
      xhr.send(uploadFile);
    });
  }

  async function loadStickers() {
    if (stickerPicker.length) { setStickerPicker([]); return; }
    try {
      const token = window.localStorage.getItem("twitok_user_token");
      const response = await fetch(`${API}/video/stickers`, { headers: token ? { Authorization: "Bearer " + token } : {} });
      if (response.ok) setStickerPicker((await response.json()).stickers ?? []);
    } catch {}
  }

  function addSticker(sticker: any) {
    if (stickers.length >= 20) return;
    setStickers(items => [...items, { stickerId: sticker.id, emoji: sticker.emoji, startMs: 0, endMs: Math.max(1000, durationMs || 5000), x: 0.5, y: 0.5, size: 72, rotation: 0 }]);
  }

  function addTextOverlay() {
    const text = overlayText.trim();
    if (!text) return setMessage("Enter text before adding an overlay.");
    const end = Math.min(durationMs || 3000, Math.max(overlayStartMs + 500, overlayEndMs));
    setTextOverlays(items => [...items, { text: text.slice(0, 200), startMs: overlayStartMs, endMs: end, x: 0.5, y: 0.8, fontSize: overlayFontSize, color: overlayColor, background: "#000000@0.55", align: overlayAlign }].slice(0, 20));
    setOverlayText("");
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

      const selectedClips = clipFiles.length ? clipFiles : [file];
      const uploadIds: string[] = [];
      for (let clipIndex = 0; clipIndex < selectedClips.length; clipIndex += 1) {
        const clip = selectedClips[clipIndex];
        const uploadResponse = clipIndex === 0 ? create : await fetch(API + "/video/uploads", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ mimeType: clip.type, sizeBytes: clip.size })
        });
        const uploadSession = clipIndex === 0 ? session : await uploadResponse.json();
        if (clipIndex > 0 && (!uploadResponse.ok || !uploadSession.uploadUrl)) throw new Error(uploadSession.error ?? "Unable to prepare clip upload.");
        await uploadWithProgress(uploadSession.uploadUrl, clip, value => setUploadProgress(Math.round(((clipIndex + value / 100) / selectedClips.length) * 100)));
        const completeResponse = await fetch(API + "/video/uploads/" + uploadSession.uploadId + "/complete", { method: "POST", headers: { Authorization: "Bearer " + token } });
        const completed = await completeResponse.json();
        if (!completeResponse.ok) throw new Error(completed.error ?? "Unable to finalize clip upload.");
        uploadIds.push(uploadSession.uploadId);
      }

      const tags = hashtags.split(/[ ,#]+/).map(v => v.trim()).filter(Boolean).slice(0, 30);
      const draft = await fetch(API + "/video/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          uploadId: session.uploadId, clipUploadIds: uploadIds, clipTrimRanges: selectedClips.map((_, i) => ({ startMs: timelineStartMs[i] ?? 0, endMs: timelineEndMs[i] ?? 0 })), clipTransitions, clipSettings, caption, hashtags: tags, visibility,
          allowComments, allowDuet, allowStitch, coverTimeMs, trimStartMs, trimEndMs, speed, soundId: selectedSound?._id, originalVolume, addedSoundVolume, textOverlays, stickers, autoCaptions, captionLanguage, effect
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
            <video ref={videoRef} src={preview} controls playsInline muted={muted} style={{ filter: effect === "VIBRANT" ? "saturate(1.35) contrast(1.08) brightness(1.02)" : effect === "WARM" ? "sepia(.18) saturate(1.08)" : effect === "COOL" ? "hue-rotate(8deg) saturate(.95)" : effect === "NOIR" ? "grayscale(1) contrast(1.2)" : effect === "VINTAGE" ? "sepia(.2) saturate(.72) contrast(.92)" : effect === "BRIGHT" ? "brightness(1.08) contrast(1.02)" : effect === "FADE" ? "contrast(.86) brightness(1.05) saturate(.82)" : "none" }} className="composer-video" onLoadedMetadata={onLoadedMetadata} />
          ) : (
            <div className="camera-create">
              <div className="camera-stage">
                {cameraActive ? <video ref={cameraPreviewRef} className="browser-camera-preview" autoPlay playsInline muted /> : <div className="camera-unavailable"><b>Camera unavailable</b><small>Tap Enable camera to give Chrome permission, or upload a video.</small><button type="button" className="camera-enable" onClick={() => void openBrowserCamera()}>Enable camera</button></div>}
                <button type="button" className="camera-close" onClick={() => { stopBrowserCamera(); window.history.back(); }}>×</button>
                <button type="button" className="camera-sound" onClick={() => setSoundOpen(v => !v)}>♫ Add sound</button>
                <div className="camera-side-tools">
                  <button type="button" onClick={() => { const next = cameraFacingMode === "user" ? "environment" : "user"; void openBrowserCamera(next); }}>↻<small>Flip</small></button>
                  <button type="button" onClick={() => setSpeed(v => v === 2 ? .5 : v === .5 ? 1 : v === 1 ? 1.5 : 2)}>{speed}×<small>Speed</small></button>
                  <button type="button" onClick={() => setEffect(effect === "NONE" ? "VIBRANT" : "NONE")}>✦<small>Effects</small></button>
                  <button type="button">◷<small>Timer</small></button>
                </div>
              </div>
              <div className="camera-lengths">
                {([["10m",600],["60s",60],["15s",15]] as const).map(([label,value]) => <button key={label} type="button" className={cameraDurationLimit===value?"selected":""} onClick={() => setCameraDurationLimit(value)}>{label}</button>)}
                <button type="button">PHOTO</button><button type="button">TEXT</button>
              </div>
              <div className="camera-actions">
                <label className="camera-upload">▣<small>Upload</small><input type="file" multiple accept="video/mp4,video/quicktime,video/webm" onChange={e => { stopBrowserCamera(); chooseFiles(e.target.files); }} /></label>
                <button type="button" className={"camera-record " + (cameraRecording ? "recording" : "")} onClick={cameraRecording ? () => cameraRecorderRef.current?.stop() : recordBrowserVideo}><span /></button>
                <button type="button" className="camera-effects" onClick={() => setEffect(effect === "NONE" ? "VIBRANT" : "NONE")}>✦<small>Effects</small></button>
              </div>
              <div className="camera-bottom-tabs"><span className="active">Camera</span><span>LIVE</span><span>Create</span></div>
              {soundOpen && <div className="camera-sound-panel"><b>Add sound</b><input value={soundQuery} onChange={e => setSoundQuery(e.target.value)} placeholder="Search sounds" /><button type="button" onClick={searchSounds}>Search</button></div>}
            </div>
          )}
        </div>

        <div className="composer-panel">
          {clipFiles.length > 1 && (
            <div className="clip-list">
              <b>Timeline</b>
              <div className="timeline-preview">
                <video
                  ref={timelineVideoRef}
                  src={preview || undefined}
                  controls={false}
                  muted
                  playsInline
                  onTimeUpdate={e => setTimelinePlayheadMs(e.currentTarget.currentTime * 1000)}
                />
              </div>
              <div className="timeline-playhead">
                <input
                  aria-label="Timeline playhead"
                  type="range"
                  min="0"
                  max={timelineTotalMs}
                  step="10"
                  value={timelinePlayheadMs}
                  onChange={e => seekTimeline(Number(e.target.value))}
                />
                <span>{(timelinePlayheadMs / 1000).toFixed(2)}s / {(timelineTotalMs / 1000).toFixed(2)}s</span>
                <button
                  type="button"
                  onClick={() => {
                    const video = timelineVideoRef.current;
                    if (!video) return;
                    if (video.paused) {
                      void video.play();
                      setIsTimelinePlaying(true);
                    } else {
                      video.pause();
                      setIsTimelinePlaying(false);
                    }
                  }}
                >
                  {isTimelinePlaying ? "Pause" : "Play"}
                </button>
              </div>
              <div className="timeline-actions">
                <button type="button" onClick={undoTimeline} disabled={!timelineHistory.length}>Undo</button>
                <button type="button" onClick={redoTimeline} disabled={!timelineFuture.length}>Redo</button>
              </div>
              <div className="timeline-ruler">
                {clipFiles.map((_, index) => (
                  <button
                    type="button"
                    className="timeline-marker"
                    key={index}
                    onClick={() => {
                      let offset = 0;
                      for (let i = 0; i < index; i += 1) {
                        const s = timelineStartMs[i] ?? 0;
                        const e = timelineEndMs[i] ?? 10000;
                        const sp = clipSettings[i]?.speed ?? 1;
                        offset += Math.max(100, e - s) / sp;
                      }
                      seekTimeline(offset);
                    }}
                  >
                    Clip {index + 1}
                  </button>
                ))}
              </div>
              <div className="timeline-track">
                {clipFiles.map((clip, index) => {
                  const startMs = timelineStartMs[index] ?? 0;
                  const endMs = timelineEndMs[index] ?? 10000;
                  const clipDurationMs = Math.max(100, endMs - startMs);
                  const isActive = activeTimelineClip.index === index;
                  return (
                    <div
                      className={isActive ? "timeline-clip active" : "timeline-clip"}
                      onClick={() => setSelectedClip(index)}
                      key={`${clip.name}-${index}`}
                    >
                      <div>
                        <strong>{index + 1}</strong>
                        <span>{clip.name}</span>
                      </div>
                      <small>{(clipDurationMs / 1000).toFixed(1)}s</small>
                      <label>
                        Start
                        <input
                          type="range"
                          min="0"
                          max={Math.max(100, endMs - 100)}
                          value={Math.min(startMs, Math.max(0, endMs - 100))}
                          onChange={e => updateClipTrim(index, Number(e.target.value), endMs)}
                        />
                      </label>
                      <label>
                        End
                        <input
                          type="range"
                          min={Math.min(endMs, startMs + 100)}
                          max={Math.max(endMs, startMs + 100)}
                          value={endMs}
                          onChange={e => updateClipTrim(index, startMs, Number(e.target.value))}
                        />
                      </label>
                      <button type="button" onClick={() => splitClip(index)} disabled={clipDurationMs < 400}>Split</button>
                      <button type="button" onClick={() => duplicateClip(index)}>Duplicate</button>
                      <button type="button" onClick={() => deleteClip(index)} disabled={clipFiles.length <= 1}>Delete</button>
                      <button type="button" onClick={() => moveClip(index, -1)} disabled={index === 0}>↑</button>
                      <button type="button" onClick={() => moveClip(index, 1)} disabled={index === clipFiles.length - 1}>↓</button>
                    </div>
                  );
                })}
              </div>
              <div className="clip-settings">
                <b>Clip {activeTimelineClip.index + 1} controls</b>
                <label>
                  Speed
                  <select
                    value={clipSettings[activeTimelineClip.index]?.speed ?? 1}
                    onChange={e => updateClipSetting(activeTimelineClip.index, { speed: Number(e.target.value) })}
                  >
                    <option value="0.5">0.5×</option>
                    <option value="0.75">0.75×</option>
                    <option value="1">1×</option>
                    <option value="1.5">1.5×</option>
                    <option value="2">2×</option>
                  </select>
                </label>
                <label>
                  Volume
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={clipSettings[activeTimelineClip.index]?.volume ?? 1}
                    onChange={e => updateClipSetting(activeTimelineClip.index, { volume: Number(e.target.value) })}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={clipSettings[activeTimelineClip.index]?.muted ?? false}
                    onChange={e => updateClipSetting(activeTimelineClip.index, { muted: e.target.checked })}
                  />
                  Mute
                </label>
              </div>
              <div className="transition-row">
                <b>Transitions</b>
                {clipFiles.slice(0, -1).map((_, index) => (
                  <label key={index}>
                    After clip {index + 1}
                    <select
                      value={clipTransitions[index]?.type ?? "NONE"}
                      onChange={e => setTransition(index, e.target.value)}
                    >
                      <option value="NONE">None</option>
                      <option value="FADE">Fade</option>
                      <option value="DISSOLVE">Dissolve</option>
                      <option value="WIPELEFT">Wipe left</option>
                      <option value="WIPERIGHT">Wipe right</option>
                      <option value="SLIDELEFT">Slide left</option>
                      <option value="SLIDERIGHT">Slide right</option>
                    </select>
                    <input
                      type="range"
                      min="100"
                      max="1500"
                      step="50"
                      value={clipTransitions[index]?.durationMs ?? 500}
                      onChange={e => setClipTransitions(items => items.map((item, i) => i === index ? { ...item, durationMs: Number(e.target.value) } : item))}
                    />
                  </label>
                ))}
              </div>
              <b>Clips</b>
              {clipFiles.map((clip, index) => (
                <div key={`list-${clip.name}-${index}`}>
                  <span>{index + 1}. {clip.name}</span>
                </div>
              ))}
            </div>
          )}
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

            <div className="effect-selector"><b>Effects</b><div className="effect-options">{[
  ["NONE","Original"],["VIBRANT","Vibrant"],["WARM","Warm"],["COOL","Cool"],["NOIR","Noir"],["VINTAGE","Vintage"],["BRIGHT","Bright"],["FADE","Fade"]
].map(([value,label]) => <button type="button" key={value} className={effect === value ? "selected" : ""} onClick={() => setEffect(value)}>{label}</button>)}</div><small>Effects are rendered into the final video after upload.</small></div>

<div className="speed-selector"><b>Speed</b><div className="speed-options">{[0.5, 0.75, 1, 1.5, 2].map(value => <button type="button" key={value} className={speed === value ? "selected" : ""} onClick={() => setSpeed(value)}>{value}×</button>)}</div></div>

            <div className="trim-editor">
              <b>Trim video</b>
              <div className="trim-values"><span>{(trimStartMs / 1000).toFixed(1)}s</span><span>{(trimEndMs / 1000).toFixed(1)}s</span></div>
              <input type="range" min="0" max={Math.max(durationMs, 1)} step="100" value={trimStartMs} onChange={e => setTrimStartMs(Math.min(Number(e.target.value), Math.max(0, trimEndMs - 100)))} />
              <input type="range" min="0" max={Math.max(durationMs, 1)} step="100" value={trimEndMs} onChange={e => setTrimEndMs(Math.max(Number(e.target.value), trimStartMs + 100))} />
              <small>Select the start and end of the clip.</small>
            </div>

            <div className="caption-editor"><b>Accessibility captions</b><label><input type="checkbox" checked={autoCaptions} onChange={e => setAutoCaptions(e.target.checked)} /> Generate automatic captions from speech</label>{autoCaptions && <label>Video language<select value={captionLanguage} onChange={e => setCaptionLanguage(e.target.value)}><option value="auto">Detect automatically</option><option value="en">English</option><option value="fr">French</option><option value="ar">Arabic</option><option value="sw">Swahili</option><option value="tw">Twi</option><option value="ha">Hausa</option><option value="yo">Yoruba</option><option value="ig">Igbo</option><option value="zu">Zulu</option><option value="xh">Xhosa</option><option value="am">Amharic</option><option value="pt">Portuguese</option></select></label>}<small>Captions are generated after upload and can be reviewed before wider accessibility support is enabled.</small></div>

            {step === "READY" && autoCaptions && <div className="caption-review"><b>Review automatic captions</b>{captionsLoading ? <small>Loading generated captions…</small> : generatedCaptions.length === 0 ? <small>No speech captions were generated for this video.</small> : <div className="caption-list">{generatedCaptions.map((item, index) => <div className="caption-row" key={index}><span>{(item.startMs / 1000).toFixed(1)}–{(item.endMs / 1000).toFixed(1)}s</span><input value={item.text} onChange={e => setGeneratedCaptions(items => items.map((x, i) => i === index ? { ...x, text: e.target.value } : x))} /><button type="button" onClick={() => setGeneratedCaptions(items => items.filter((_, i) => i !== index))}>Remove</button></div>)}</div>} {generatedCaptions.length > 0 && <button type="button" className="secondary-action" onClick={saveGeneratedCaptions} disabled={captionsSaving}>{captionsSaving ? "Saving…" : "Save caption edits"}</button>}</div>}

            <div className="text-overlay-editor"><b>Text overlay</b><div className="overlay-style-row"><label>Color<input type="color" value={overlayColor ?? "#ffffff"} onChange={e => setOverlayColor(e.target.value)} /></label><label>Size<input type="number" min="16" max="96" value={overlayFontSize ?? 42} onChange={e => setOverlayFontSize(Number(e.target.value))} /></label><label>Align<select value={overlayAlign ?? "center"} onChange={e => setOverlayAlign(e.target.value)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label></div><input maxLength={200} value={overlayText} onChange={e => setOverlayText(e.target.value)} placeholder="Add text to your video…" /><div className="overlay-time"><label>Start (s)<input type="number" min="0" step="0.1" value={overlayStartMs / 1000} onChange={e => setOverlayStartMs(Math.max(0, Number(e.target.value) * 1000 || 0))} /></label><label>End (s)<input type="number" min="0.1" step="0.1" value={overlayEndMs / 1000} onChange={e => setOverlayEndMs(Math.max(500, Number(e.target.value) * 1000 || 500))} /></label></div><button type="button" className="secondary-action" onClick={addTextOverlay}>＋ Add text</button>{textOverlays.length > 0 && <div className="overlay-list">{textOverlays.map((item, index) => <div key={index}><span>{item.text}</span><small>{(item.startMs/1000).toFixed(1)}–{(item.endMs/1000).toFixed(1)}s</small><button type="button" onClick={() => setTextOverlays(items => items.filter((_, i) => i !== index))}>Remove</button></div>)}</div>}</div>

            <div className="sticker-editor"><b>Stickers & Emoji</b><button type="button" className="secondary-action" onClick={loadStickers}>{stickerPicker.length ? "Hide stickers" : "＋ Add sticker"}</button>{stickerPicker.length > 0 && <div className="sticker-grid">{stickerPicker.map((sticker:any) => <button type="button" key={sticker.id} onClick={() => addSticker(sticker)} title={sticker.name}><span>{sticker.emoji}</span><small>{sticker.name}</small></button>)}</div>}{stickers.length > 0 && <div className="overlay-list">{stickers.map((item:any,index:number) => <div key={index}><span>{item.emoji}</span><small>{(item.startMs/1000).toFixed(1)}–{(item.endMs/1000).toFixed(1)}s</small><button type="button" onClick={() => setStickers(items => items.filter((_,i) => i !== index))}>Remove</button></div>)}</div>}</div>

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
