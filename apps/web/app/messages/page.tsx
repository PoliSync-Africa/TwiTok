"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
const WS = API.replace(/^http/, "ws").replace(/\/api\/v1$/, "") + "/realtime";

type Tab = "ALL" | "MESSAGES" | "ACTIVITY";
type Conversation = {
  id: string;
  otherUser: { username?: string; nickname?: string; profilePhotoUrl?: string | null } | null;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
  updatedAt?: string;
  unreadCount?: number;
};
type Message = { _id: string; senderId: string; text?: string; type?: "TEXT" | "VOICE"; createdAt: string; status?: string };
type Notification = {
  id: string;
  type: string;
  category?: string | null;
  title?: string | null;
  body?: string | null;
  read?: boolean;
  createdAt: string;
  actor?: { id?: string; username?: string; nickname?: string } | null;
};

const icons: Record<string, string> = {
  back: "M19 12H5m7 7-7-7 7-7",
  search: "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm5.5-1.5L21 22",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  message: "M20 11.5a7.5 7.5 0 0 1-8 7.5 8.7 8.7 0 0 1-4-.9L4 20l1.8-3.2A7.4 7.4 0 0 1 4 11.5 7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 13h4",
  heart: "m20.8 8.8-.1-.2A5.3 5.3 0 0 0 16 6c-1.6 0-3.1.7-4 1.9A5.1 5.1 0 0 0 8 6a5.3 5.3 0 0 0-4.7 2.6c-2.2 4.2 1 7.2 8.7 12.4 7.7-5.2 10.9-8.2 8.8-12.2Z",
  comment: "M20 11.5a7.5 7.5 0 0 1-8 7.5 8.7 8.7 0 0 1-4-.9L4 20l1.8-3.2A7.4 7.4 0 0 1 4 11.5 7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z",
  user: "M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  send: "m22 2-7 20-4-9-9-4Z",
  plus: "M12 5v14M5 12h14",
};
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={icons[name] ?? icons.message} /></svg>;
}
function time(value?: string | null) {
  if (!value) return "";
  const s = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  if (s < 604800) return Math.floor(s / 86400) + "d";
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
}
function notificationText(n: Notification) {
  if (n.type === "SYSTEM") return n.body || n.title || "TwiTok update";
  const actor = n.actor?.nickname || (n.actor?.username ? "@" + n.actor.username : "Someone");
  return n.type === "FOLLOW" ? actor + " started following you"
    : n.type === "LIKE" ? actor + " liked your video"
    : n.type === "COMMENT" ? actor + " commented on your video"
    : n.type === "REPOST" ? actor + " reposted your video"
    : n.type === "MENTION" ? actor + " mentioned you"
    : actor + " interacted with you";
}
function notificationIcon(type: string) {
  if (type === "LIKE") return "heart";
  if (type === "COMMENT") return "comment";
  if (type === "FOLLOW") return "user";
  return "bell";
}

export default function MessagesPage() {
  const [tab, setTab] = useState<Tab>("ALL");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [viewerId, setViewerId] = useState("");
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const socket = useRef<WebSocket | null>(null);

  async function request(path: string, options: RequestInit = {}) {
    const token = localStorage.getItem("twitok_user_token");
    const response = await fetch(API + path, {
      ...options,
      headers: { ...(options.headers ?? {}), ...(token ? { Authorization: "Bearer " + token } : {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }

  async function load() {
    try {
      setError("");
      const [me, chats, activity] = await Promise.all([
        request("/auth/me"),
        request("/messages/conversations"),
        request("/notifications?limit=100"),
      ]);
      setViewerId(String(me.user?._id ?? me.user?.id ?? ""));
      setConversations(chats.conversations ?? []);
      setNotifications(activity.notifications ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load inbox");
    } finally {
      setLoading(false);
    }
  }

  async function openConversation(c: Conversation) {
    setActive(c);
    try {
      const data = await request("/messages/conversations/" + c.id + "/messages");
      setMessages(data.messages ?? []);
      await request("/messages/conversations/" + c.id + "/delivered", { method: "POST" });
      await request("/messages/conversations/" + c.id + "/read", { method: "POST" });
      setConversations(items => items.map(item => item.id === c.id ? { ...item, unreadCount: 0 } : item));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to open conversation"); }
  }

  async function startConversation() {
    const username = query.trim().replace(/^@/, "");
    if (!username) return;
    try {
      const data = await request("/messages/conversations/direct", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username }) });
      setQuery("");
      await load();
      await openConversation({ id: data.conversation._id, otherUser: { username } });
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to start conversation"); }
  }

  async function sendMessage() {
    if (!active || !text.trim()) return;
    try {
      const data = await request("/messages/conversations/" + active.id + "/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text.trim() }) });
      setMessages(items => [...items, data.message]);
      setText("");
      void load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to send message"); }
  }

  async function markRead(id?: string) {
    try {
      await request("/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(id ? { notificationId: id } : {}) });
      setNotifications(items => id ? items.map(n => n.id === id ? { ...n, read: true } : n) : items.map(n => ({ ...n, read: true })));
    } catch {}
  }

  useEffect(() => {
    void load();
    const token = localStorage.getItem("twitok_user_token");
    if (!token) return;
    const ws = new WebSocket(WS);
    socket.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token }));
    ws.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "notification:new" && data.notification) setNotifications(items => [{ ...data.notification, read: false }, ...items]);
        if ((data.type === "message:new" || data.type === "message:sent") && data.message) {
          if (active?.id === data.message.conversationId) setMessages(items => items.some(i => i._id === data.message._id) ? items : [...items, data.message]);
          void load();
        }
      } catch {}
    };
    return () => { ws.close(); socket.current = null; };
  }, []);

  const unreadMessages = conversations.reduce((sum, c) => sum + Number(c.unreadCount ?? 0), 0);
  const unreadActivity = notifications.filter(n => !n.read).length;
  const combined = useMemo(() => [
    ...conversations.map(c => ({ kind: "chat" as const, id: "c:" + c.id, date: c.lastMessageAt || c.updatedAt || "", item: c })),
    ...notifications.map(n => ({ kind: "notification" as const, id: "n:" + n.id, date: n.createdAt, item: n })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [conversations, notifications]);

  if (active) {
    return <main className="inbox-page">
      <section className="inbox-shell chat-shell">
        <header className="inbox-header"><button className="icon-btn" onClick={() => setActive(null)}><Icon name="back" /></button><div className="chat-user"><div className="avatar">{active.otherUser?.nickname?.[0] || active.otherUser?.username?.[0] || "?"}</div><div><b>{active.otherUser?.nickname || "TwiTok user"}</b><small>@{active.otherUser?.username || "user"}</small></div></div><button className="icon-btn"><Icon name="more" /></button></header>
        <div className="chat-messages">
          {messages.map(m => <div key={m._id} className={"bubble-row " + (String(m.senderId) === viewerId ? "mine" : "")}><div className="bubble">{m.type === "VOICE" ? "🎤 Voice message" : m.text}<small>{time(m.createdAt)}</small></div></div>)}
          {!messages.length ? <div className="empty"><Icon name="message" size={36}/><h2>Start the conversation</h2><p>Send a message to @{active.otherUser?.username || "this creator"}.</p></div> : null}
        </div>
        <form className="chat-composer" onSubmit={e => { e.preventDefault(); void sendMessage(); }}><input value={text} onChange={e => setText(e.target.value)} placeholder="Message…" /><button className="send-btn" disabled={!text.trim()}><Icon name="send" size={19}/></button></form>
      </section>
    </main>;
  }

  return <main className="inbox-page">
    <section className="inbox-shell">
      <header className="inbox-header"><Link className="icon-btn" href="/"><Icon name="back" /></Link><h1>Inbox</h1><button className="icon-btn"><Icon name="more" /></button></header>
      <nav className="inbox-tabs">
        {([["ALL","All",unreadMessages + unreadActivity],["MESSAGES","Messages",unreadMessages],["ACTIVITY","Activity",unreadActivity]] as const).map(([key,label,count]) =>
          <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}{count ? <span>{count > 99 ? "99+" : count}</span> : null}</button>
        )}
      </nav>
      <div className="new-chat"><div className="search"><Icon name="search" size={18}/><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if(e.key === "Enter") void startConversation(); }} placeholder="Search people or start a chat" /></div><button onClick={() => void startConversation()}><Icon name="plus" size={19}/></button></div>
      {error ? <p className="inbox-error">{error}</p> : null}
      <div className="inbox-list">
        {loading ? <div className="loading">Loading inbox…</div> : null}
        {tab === "ALL" && !loading ? combined.map(entry => entry.kind === "chat" ? (
          <button className="inbox-row" key={entry.id} onClick={() => void openConversation(entry.item)}>
            <div className="avatar">{entry.item.otherUser?.nickname?.[0] || entry.item.otherUser?.username?.[0] || "?"}</div><div className="row-main"><div><b>{entry.item.otherUser?.nickname || "TwiTok user"}</b><time>{time(entry.date)}</time></div><p>{entry.item.lastMessagePreview || "Start a conversation"}</p></div>{Number(entry.item.unreadCount ?? 0) > 0 ? <strong className="badge">{entry.item.unreadCount! > 99 ? "99+" : entry.item.unreadCount}</strong> : null}
          </button>
        ) : (
          <button className={"inbox-row activity " + (!entry.item.read ? "unread" : "")} key={entry.id} onClick={() => void markRead(entry.item.id)}>
            <div className="activity-icon"><Icon name={notificationIcon(entry.item.type)} size={19}/></div><div className="row-main"><div><b>{entry.item.title || entry.item.actor?.nickname || "Activity"}</b><time>{time(entry.date)}</time></div><p>{notificationText(entry.item)}</p></div>{!entry.item.read ? <i className="dot"/> : null}
          </button>
        )) : null}
        {tab === "MESSAGES" && !loading ? conversations.length ? conversations.map(c => (
          <button className="inbox-row" key={c.id} onClick={() => void openConversation(c)}>
            <div className="avatar">{c.otherUser?.nickname?.[0] || c.otherUser?.username?.[0] || "?"}</div><div className="row-main"><div><b>{c.otherUser?.nickname || "TwiTok user"}</b><time>{time(c.lastMessageAt || c.updatedAt)}</time></div><p>{c.lastMessagePreview || "Start a conversation"}</p></div>{Number(c.unreadCount ?? 0) > 0 ? <strong className="badge">{c.unreadCount! > 99 ? "99+" : c.unreadCount}</strong> : null}
          </button>
        )) : <div className="empty"><Icon name="message" size={36}/><h2>No messages yet</h2><p>Start a conversation with a friend or creator.</p></div> : null}
        {tab === "ACTIVITY" && !loading ? <><div className="activity-head"><b>All activity</b><button onClick={() => void markRead()}>Mark all read</button></div>{notifications.length ? notifications.map(n => <button className={"inbox-row activity " + (!n.read ? "unread" : "")} key={n.id} onClick={() => void markRead(n.id)}><div className="activity-icon"><Icon name={notificationIcon(n.type)} size={19}/></div><div className="row-main"><div><b>{n.title || n.actor?.nickname || "Activity"}</b><time>{time(n.createdAt)}</time></div><p>{notificationText(n)}</p></div>{!n.read ? <i className="dot"/> : null}</button>) : <div className="empty"><Icon name="bell" size={36}/><h2>No activity yet</h2><p>Likes, comments, follows and mentions will appear here.</p></div>}</> : null}
      </div>
    </section>
  </main>;
}
