"use client";

import { useEffect, useState } from "react";

type Controls = {
  maintenanceMode: boolean;
  readOnlyMode: boolean;
  registrationEnabled: boolean;
  uploadsEnabled: boolean;
  commentsEnabled: boolean;
  liveEnabled: boolean;
  giftsEnabled: boolean;
  withdrawalsEnabled: boolean;
  globalAnnouncementEnabled: boolean;
  strictYouthSafety: boolean;
  aiModerationEnforced: boolean;
};

const API = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "";

const GROUPS: Array<{ title: string; description: string; items: Array<{ key: keyof Controls; label: string; description: string; danger?: boolean }> }> = [
  {
    title: "Platform availability",
    description: "Global switches that affect access to core platform services.",
    items: [
      { key: "maintenanceMode", label: "Maintenance mode", description: "Show a controlled maintenance state and pause normal platform activity.", danger: true },
      { key: "readOnlyMode", label: "Read-only mode", description: "Prevent state-changing user actions while keeping the platform viewable.", danger: true },
      { key: "registrationEnabled", label: "New registrations", description: "Allow new users to create TwiTok accounts." }
    ]
  },
  {
    title: "Content & community",
    description: "Control publishing and interaction surfaces.",
    items: [
      { key: "uploadsEnabled", label: "Video & media uploads", description: "Allow creators to publish new media." },
      { key: "commentsEnabled", label: "Comments", description: "Allow comments and community replies." },
      { key: "liveEnabled", label: "LIVE streaming", description: "Allow eligible creators to start LIVE sessions." },
      { key: "giftsEnabled", label: "LIVE Gifts", description: "Allow virtual gifts and creator support during LIVE." }
    ]
  },
  {
    title: "Money & creator protection",
    description: "High-impact controls for creator monetization and youth safety.",
    items: [
      { key: "withdrawalsEnabled", label: "Creator withdrawals", description: "Allow eligible creators to request payouts.", danger: true },
      { key: "strictYouthSafety", label: "Strict youth safety", description: "Keep enhanced protections for minors enforced." },
      { key: "aiModerationEnforced", label: "AI moderation enforcement", description: "Require automated safety checks before eligible content/actions proceed." },
      { key: "globalAnnouncementEnabled", label: "Global announcement channel", description: "Enable owner-issued platform-wide announcements." }
    ]
  }
];

export default function PlatformControlPage() {
  const [controls, setControls] = useState<Controls | null>(null);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API}/api/admin/platform/control`, { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load controls");
      setControls(data.controls);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load controls");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function toggle(key: keyof Controls, value: boolean) {
    if (!controls) return;
    if ((key === "maintenanceMode" || key === "readOnlyMode" || key === "withdrawalsEnabled") && value === false) {
      const ok = window.confirm(`Confirm changing "${key}" to OFF. This is a high-impact platform control.`);
      if (!ok) return;
    }
    setSaving(key);
    setSaved("");
    setError("");
    try {
      const response = await fetch(`${API}/api/admin/platform/control`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ controls: { [key]: value } })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to save control");
      setControls(data.controls);
      setSaved("Control updated and audit logged.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save control");
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">T</div><div><strong>TwiTok</strong><span>OWNER CONTROL</span></div></div>
        <nav>
          <a href="/admin">Command Center</a>
          <a href="/admin/notifications">Notifications & Announcements</a>
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
          <a className="active" href="/admin/control">Platform Control</a>
          <a href="/admin/settings">Platform Settings</a>
          <a href="/admin/security">Security & Audit</a>
        </nav>
        <div className="sidebar-footer"><div className="admin-badge">OWNER • PRIVILEGED</div><small>Every control change is audit logged.</small></div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">TWITOK PLATFORM CONTROL</p>
            <h1>Global Platform Control</h1>
            <p className="muted">High-level switches for availability, content, LIVE, monetization and safety. Changes are restricted to the owner session.</p>
          </div>
          <div className="control-header-actions"><a className="logout" href="/admin">Back to command center</a></div>
        </header>

        <div className="notice"><strong>PRIVILEGED CONTROL.</strong> These switches affect platform-wide behavior. Use emergency controls only when necessary.</div>
        {error && <div className="control-error">{error}</div>}
        {saved && <div className="control-success">{saved}</div>}

        {loading || !controls ? (
          <section className="panel control-loading">Loading platform controls…</section>
        ) : (
          <div className="control-groups">
            {GROUPS.map(group => (
              <section className="panel control-group" key={group.title}>
                <div className="panel-head"><div><p className="eyebrow">CONTROL GROUP</p><h2>{group.title}</h2><p className="muted">{group.description}</p></div></div>
                <div className="control-list">
                  {group.items.map(item => {
                    const on = controls[item.key];
                    return (
                      <div className={`control-row ${item.danger ? "high-impact" : ""}`} key={item.key}>
                        <div className="control-copy"><strong>{item.label}</strong><span>{item.description}</span></div>
                        <button
                          className={`switch ${on ? "on" : ""}`}
                          disabled={saving === item.key}
                          aria-pressed={on}
                          aria-label={`${item.label}: ${on ? "on" : "off"}`}
                          onClick={() => void toggle(item.key, !on)}
                        ><span /></button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        <section className="panel control-footer-panel">
          <div><p className="eyebrow">ADMINISTRATION MODEL</p><h2>Owner-only, least-privilege foundation</h2><p className="muted">The API validates the signed owner session server-side before accepting control changes. Client-side navigation alone is not treated as authorization.</p></div>
        </section>
      </section>
    </main>
  );
}
