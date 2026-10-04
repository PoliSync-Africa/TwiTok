"use client";

import { useEffect, useState } from "react";

type NotificationRow = {
  id: string;
  category: string;
  title: string;
  body: string;
  actionLabel: string | null;
  actionUrl: string | null;
  audience: string;
  targetCountryCode: string | null;
  targetUserCount: number;
  priority: number;
  status: string;
  startsAt: string;
  expiresAt: string | null;
  createdAt: string;
};

const categories = ["ACCOUNT_UPDATES", "TWITOK", "LIVE", "PROMOTE_ASSISTANT", "SAFETY", "CREATOR"];
const audiences = ["ALL", "CREATORS", "VERIFIED", "COUNTRY", "INDIVIDUALS"];

export default function AdminNotificationsPage() {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [form, setForm] = useState({
    category: "TWITOK",
    audience: "ALL",
    targetCountryCode: "",
    targetUsernames: "",
    title: "",
    body: "",
    actionLabel: "",
    actionUrl: "",
    priority: "0",
    expiresAt: ""
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/admin/notifications?limit=50", { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      setRows(Array.isArray(data.notifications) ? data.notifications : []);
    }
  }

  useEffect(() => { void load(); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          targetUsernames: form.targetUsernames.split(/[\\s,]+/).map(value => value.trim()).filter(Boolean),
          priority: Number(form.priority || 0),
          publish: true,
          startsAt: new Date().toISOString(),
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to publish");
      setForm(current => ({ ...current, targetUsernames: "", title: "", body: "", actionLabel: "", actionUrl: "", expiresAt: "" }));
      setMessage("System notification published.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to publish");
    } finally {
      setBusy(false);
    }
  }

  async function archive(id: string) {
    if (!window.confirm("Archive this system notification?")) return;
    const response = await fetch(`/api/admin/notifications/${id}/archive`, { method: "POST" });
    if (response.ok) await load();
  }

  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">T</div><div><strong>TwiTok</strong><span>OWNER CONTROL</span></div></div>
        <nav>
          <a href="/admin">Command Center</a>
          <a className="active" href="/admin/notifications">Notifications & Announcements</a>
          <a href="/admin/users">Users</a>
          <a href="/admin/content">Content</a>
          <a href="/admin/safety">Safety & Moderation</a>
          <a href="/admin/youth">Youth Safety</a>
          <a href="/admin/live">LIVE</a>
          <a href="/admin/creators">Creators</a>
          <a href="/admin/verification">Verification</a>
          <a href="/admin/communities">Communities</a>
          <a href="/admin/marketplace">Marketplace</a>
          <a href="/admin/analytics">Analytics</a>
          <a href="/admin/settings">Platform Settings</a>
          <a href="/admin/security">Security & Audit</a>
        </nav>
        <div className="sidebar-footer"><div className="admin-badge">OWNER • PRIVILEGED</div><small>Separate from public users</small></div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">SYSTEM COMMUNICATIONS</p>
            <h1>Notifications & Announcements</h1>
            <p className="muted">Publish TikTok-style system messages without creating one notification document per user.</p>
          </div>
          <a className="logout" href="/admin">Back to command center</a>
        </header>

        <section className="panel notification-composer">
          <div className="panel-head"><div><p className="eyebrow">COMPOSE</p><h2>Publish system notification</h2></div></div>
          <form className="notification-form" onSubmit={submit}>
            <label>Category<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{categories.map(item => <option key={item}>{item}</option>)}</select></label>
            <label>Audience<select value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value })}>{audiences.map(item => <option key={item}>{item}</option>)}</select></label>
{form.audience === "COUNTRY" && <label>Country code<input maxLength={2} placeholder="GH" value={form.targetCountryCode} onChange={e => setForm({ ...form, targetCountryCode: e.target.value.toUpperCase() })} required /></label>}
            {form.audience === "INDIVIDUALS" && <label className="span-2">Individuals<input placeholder="@username1, @username2, @username3" value={form.targetUsernames} onChange={e => setForm({ ...form, targetUsernames: e.target.value })} required /><small className="field-help">Add up to 100 usernames. TwiTok verifies every account before publishing.</small></label>}
            <label>Priority<input type="number" min="0" max="100" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} /></label>
            <label className="span-2">Title<input maxLength={120} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required /></label>
            <label className="span-2">Message<textarea maxLength={3000} rows={6} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} required /></label>
            <label>Action label<input maxLength={40} placeholder="View more" value={form.actionLabel} onChange={e => setForm({ ...form, actionLabel: e.target.value })} /></label>
            <label>Action URL<input maxLength={500} placeholder="/settings or https://..." value={form.actionUrl} onChange={e => setForm({ ...form, actionUrl: e.target.value })} /></label>
            <label>Expires at<input type="datetime-local" value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} /></label>
            <div className="composer-actions"><button className="primary" disabled={busy}>{busy ? "Publishing…" : "Publish to TwiTok"}</button>{message && <span className="composer-message">{message}</span>}</div>
          </form>
        </section>

        <section className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head"><div><p className="eyebrow">HISTORY</p><h2>Published & archived messages</h2></div></div>
          <div className="notification-history">
            {rows.length ? rows.map(row => (
              <article className="notification-admin-row" key={row.id}>
                <div>
                  <div className="notification-meta"><strong>{row.category}</strong><span>{row.audience}{row.targetCountryCode ? ` • ${row.targetCountryCode}` : ""}</span><span>{row.status}</span></div>
                  <h3>{row.title}</h3><p>{row.body}</p>
                  <small>{new Date(row.createdAt).toLocaleString()}</small>
                </div>
                {(row.status === "PUBLISHED" || row.status === "DRAFT") && <button className="danger-button" onClick={() => archive(row.id)}>Archive</button>}
              </article>
            )) : <p className="muted">No system notifications yet.</p>}
          </div>
        </section>
      </section>
    </main>
  );
}
