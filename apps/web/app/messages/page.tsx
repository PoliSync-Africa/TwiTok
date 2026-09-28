"use client";

import { useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
const WS = API.replace(/^http/, "ws").replace(/\/api\/v1$/, "") + "/realtime";

type Conversation = { id: string; otherUser: { username?: string; nickname?: string } | null; lastMessagePreview?: string | null };
type Message = { _id: string; conversationId: string; senderId: string; text: string; status: string; createdAt: string };

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const socket = useRef<WebSocket | null>(null);

  async function request(path: string, options: RequestInit = {}) {
    const token = localStorage.getItem("twitok_user_token");
    const response = await fetch(API + path, { ...options, headers: { ...(options.headers ?? {}), ...(token ? { Authorization: "Bearer " + token } : {}) } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }

  async function loadConversations() {
    try { setConversations((await request("/messages/conversations")).conversations ?? []); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Unable to load messages"); }
  }

  async function openConversation(conversation: Conversation) {
    setActive(conversation);
    try { setMessages((await request("/messages/conversations/" + conversation.id + "/messages")).messages ?? []); await request("/messages/conversations/" + conversation.id + "/read", { method: "POST" }); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Unable to load conversation"); }
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
      } catch {}
    };
    return () => { ws.close(); socket.current = null; };
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
          {conversations.map(c => <button key={c.id} onClick={() => openConversation(c)} style={{ display: "block", width: "100%", textAlign: "left", padding: 12, marginBottom: 6, borderRadius: 10, border: active?.id === c.id ? "2px solid #111" : "1px solid #ddd", background: "white" }}><b>{c.otherUser?.nickname ?? c.otherUser?.username ?? "Conversation"}</b><br /><small>{c.lastMessagePreview ?? "No messages yet"}</small></button>)}
        </aside>
        <section style={{ display: "flex", flexDirection: "column" }}>
          <header style={{ padding: 16, borderBottom: "1px solid #ddd" }}><b>{active?.otherUser?.nickname ?? active?.otherUser?.username ?? "Select a conversation"}</b></header>
          <div style={{ flex: 1, padding: 16, overflowY: "auto" }}>
            {messages.map(m => <div key={m._id} style={{ margin: "8px 0", textAlign: "left" }}><span style={{ display: "inline-block", padding: "10px 12px", borderRadius: 12, background: "#f1f1f1" }}>{m.text}</span><small style={{ marginLeft: 8 }}>{m.status}</small></div>)}
          </div>
          <form onSubmit={e => { e.preventDefault(); void sendMessage(); }} style={{ display: "flex", gap: 8, padding: 16, borderTop: "1px solid #ddd" }}>
            <input value={text} onChange={e => setText(e.target.value)} placeholder="Write a message…" disabled={!active} style={{ flex: 1 }} />
            <button type="submit" disabled={!active || !text.trim()}>Send</button>
          </form>
        </section>
      </div>
      {message && <p>{message}</p>}
    </main>
  );
}
