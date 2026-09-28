"use client";

import { useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
const WS = API.replace(/^http/, "ws").replace(/\/api\/v1$/, "") + "/realtime";

type Conversation = { id: string; otherUser: { username?: string; nickname?: string } | null; lastMessagePreview?: string | null };
type Message = {
  _id: string;
  conversationId: string;
  senderId: string;
  type?: "TEXT" | "VOICE";
  text: string;
  status: "SENT" | "DELIVERED" | "READ" | string;
  createdAt: string;
  media?: { mimeType: string; durationMs: number };
};

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [playing, setPlaying] = useState<string | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recordingChunks = useRef<Blob[]>([]);
  const recordingStartedAt = useRef(0);
  const recordingTimer = useRef<number | null>(null);

  async function request(path: string, options: RequestInit = {}) {
    const token = localStorage.getItem("twitok_user_token");
    const response = await fetch(API + path, { ...options, headers: { ...(options.headers ?? {}), ...(token ? { Authorization: "Bearer " + token } : {}) } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }

  async function loadConversations() {
    try { setConversations((await request("/messages/conversations")).conversations ?? []); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Unable to load conversations"); }
  }

  async function openConversation(conversation: Conversation) {
    setActive(conversation);
    try {
      setMessages((await request("/messages/conversations/" + conversation.id + "/messages")).messages ?? []);
      await request("/messages/conversations/" + conversation.id + "/delivered", { method: "POST" });
      await request("/messages/conversations/" + conversation.id + "/read", { method: "POST" });
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to load conversation"); }
  }

  async function startConversation() {
    if (!username.trim()) return;
    try {
      const data = await request("/messages/conversations/direct", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: username.trim() }) });
      setUsername("");
      await loadConversations();
      await openConversation({ id: data.conversation._id, otherUser: null });
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to start conversation"); }
  }

  async function sendMessage() {
    if (!active || !text.trim()) return;
    try {
      await request("/messages/conversations/" + active.id + "/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      setText("");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to send message"); }
  }

  function supportedVoiceMime() {
    if (typeof MediaRecorder === "undefined") return null;
    const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
    return candidates.find(type => MediaRecorder.isTypeSupported(type)) ?? null;
  }

  function stopRecordingTimer() {
    if (recordingTimer.current !== null) window.clearInterval(recordingTimer.current);
    recordingTimer.current = null;
  }

  function finishRecording() {
    const activeRecorder = recorder.current;
    if (!activeRecorder || activeRecorder.state === "inactive") return;
    activeRecorder.stop();
    recorder.current = null;
    stopRecordingTimer();
    setRecording(false);
  }

  async function startRecording() {
    if (!active || recording || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMessage("Voice recording is not available on this device");
      return;
    }
    const mimeType = supportedVoiceMime();
    if (!mimeType) {
      setMessage("This browser does not support voice recording");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      recordingChunks.current = [];
      recordingStartedAt.current = Date.now();
      mediaRecorder.ondataavailable = event => { if (event.data.size) recordingChunks.current.push(event.data); };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        const blob = new Blob(recordingChunks.current, { type: mimeType.split(";")[0] });
        void uploadVoice(blob);
      };
      mediaRecorder.start();
      recorder.current = mediaRecorder;
      setRecording(true);
      setRecordingSeconds(0);
      recordingTimer.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartedAt.current) / 1000);
        setRecordingSeconds(Math.min(300, elapsed));
        if (elapsed >= 300) finishRecording();
      }, 250);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Microphone permission was denied");
    }
  }

  async function uploadVoice(blob: Blob) {
    if (!active) return;
    try {
      const durationMs = await new Promise<number>((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const audio = document.createElement("audio");
        audio.preload = "metadata";
        audio.onloadedmetadata = () => {
          const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
          URL.revokeObjectURL(url);
          resolve(Math.round(duration * 1000));
        };
        audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Unable to read recording duration")); };
        audio.src = url;
      });
      if (!durationMs) throw new Error("Recording is empty");

      const signed = await request("/messages/conversations/" + active.id + "/voice-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mimeType: blob.type || "audio/mp4" })
      });

      const uploadResponse = await fetch(signed.url, {
        method: "PUT",
        headers: { "Content-Type": blob.type || signed.mimeType },
        body: blob
      });
      if (!uploadResponse.ok) throw new Error("Voice upload failed");

      await request("/messages/conversations/" + active.id + "/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectKey: signed.objectKey,
          mimeType: blob.type || signed.mimeType,
          durationMs
        })
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to send voice message");
    }
  }

  async function playVoice(item: Message) {
    if (item.type !== "VOICE") return;
    try {
      const data = await request("/messages/messages/" + item._id + "/audio");
      const audio = new Audio(data.url);
      setPlaying(item._id);
      audio.onended = () => setPlaying(null);
      audio.onerror = () => { setPlaying(null); setMessage("Unable to play voice message"); };
      await audio.play();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to play voice message"); }
  }

  useEffect(() => {
    loadConversations();
    const token = localStorage.getItem("twitok_user_token");
    if (!token) return;
    const ws = new WebSocket(WS);
    socket.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token }));
    ws.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "message:new" && data.message) {
          setMessages(items => items.some(item => item._id === data.message._id) ? items : [...items, data.message]);
          void loadConversations();
          if (data.message.conversationId) void request("/messages/conversations/" + data.message.conversationId + "/delivered", { method: "POST" });
        }
        if (data.type === "message:sent" && data.message) {
          setMessages(items => items.some(item => item._id === data.message._id) ? items : [...items, data.message]);
          void loadConversations();
        }
        if (data.type === "message:status" && data.messageIds?.length) {
          const ids = new Set<string>(data.messageIds);
          setMessages(items => items.map(item => ids.has(item._id) ? { ...item, status: data.status } : item));
        }
      } catch {}
    };
    return () => {
      ws.close();
      socket.current = null;
      stopRecordingTimer();
      if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    };
  }, []);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <h1>TwiTok Messages</h1>
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", minHeight: 560, border: "1px solid #ddd", borderRadius: 16, overflow: "hidden" }}>
        <aside style={{ padding: 16, borderRight: "1px solid #ddd" }}>
          <b>New conversation</b>
          <div style={{ display: "flex", gap: 8, margin: "10px 0 18px" }}>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="username" />
            <button onClick={startConversation}>Start</button>
          </div>
          {conversations.map(c => (
            <button key={c.id} onClick={() => openConversation(c)} style={{ display: "block", width: "100%", textAlign: "left", padding: 12, marginBottom: 6, borderRadius: 10, border: active?.id === c.id ? "2px solid #111" : "1px solid #ddd", background: "white" }}>
              <b>{c.otherUser?.nickname ?? c.otherUser?.username ?? "Conversation"}</b><br />
              <small>{c.lastMessagePreview ?? "No messages yet"}</small>
            </button>
          ))}
        </aside>
        <section style={{ display: "flex", flexDirection: "column" }}>
          <header style={{ padding: 16, borderBottom: "1px solid #ddd" }}><b>{active?.otherUser?.nickname ?? active?.otherUser?.username ?? "Select a conversation"}</b></header>
          <div style={{ flex: 1, padding: 16, overflowY: "auto" }}>
            {messages.map(m => (
              <div key={m._id} style={{ margin: "8px 0", textAlign: "left" }}>
                {m.type === "VOICE" ? (
                  <button onClick={() => void playVoice(m)} style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #ddd", background: "white" }}>
                    {playing === m._id ? "▶ Playing…" : "🎤 Voice"} · {Math.max(1, Math.round((m.media?.durationMs ?? 0) / 1000))}s
                  </button>
                ) : (
                  <span style={{ display: "inline-block", padding: "10px 12px", borderRadius: 12, background: "#f1f1f1" }}>{m.text}</span>
                )}
                <small style={{ marginLeft: 8 }}>{m.status}</small>
              </div>
            ))}
          </div>
          <form onSubmit={e => { e.preventDefault(); void sendMessage(); }} style={{ display: "flex", gap: 8, padding: 16, borderTop: "1px solid #ddd" }}>
            <button type="button" onClick={() => void (recording ? finishRecording() : startRecording())} disabled={!active} style={{ minWidth: 88 }}>
              {recording ? "Stop " + recordingSeconds + "s" : "🎤 Voice"}
            </button>
            <input value={text} onChange={e => setText(e.target.value)} placeholder={recording ? "Recording voice…" : "Write a message…"} disabled={!active || recording} style={{ flex: 1 }} />
            <button type="submit" disabled={!active || recording || !text.trim()}>Send</button>
          </form>
        </section>
      </div>
      {message && <p>{message}</p>}
    </main>
  );
}
