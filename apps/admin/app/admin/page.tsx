import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const API_URL = process.env.TWITOK_API_URL ?? "http://localhost:4000";

async function getOwnerData() {
  const cookieStore = await cookies();
  const token = cookieStore.get("twitok_owner_session")?.value;
  if (!token) return null;
  const response = await fetch(`${API_URL}/api/v1/admin/overview`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!response.ok) return null;
  return response.json();
}

export default async function AdminHome() {
  const data = await getOwnerData();
  if (!data) redirect("/admin/login");

  const cards = [
    ["Users", data.users ?? 0, "Accounts registered"],
    ["Videos", data.videos ?? 0, "Published videos"],
    ["Reports", data.reports ?? 0, "Safety cases awaiting review"],
    ["LIVE", data.live ?? 0, "Active live sessions"],
    ["Creators", data.creators ?? 0, "Creator profiles"],
    ["Platform", "ON", "Owner control plane"]
  ];

  const powers = [
    "Manage accounts and roles",
    "Publish system notifications and announcements",
    "Remove or restrict content",
    "Review safety decisions and appeals",
    "Configure youth protection",
    "Manage creators, verification and monetization",
    "Control LIVE access and safety",
    "Manage communities and marketplace",
    "Review platform analytics and finance",
    "Configure global platform settings",
    "Audit administrator actions",
    "Emergency platform controls"
  ];

  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">T</div>
          <div><strong>TwiTok</strong><span>OWNER CONTROL</span></div>
        </div>
        <nav>
          <Link className="active" href="/admin">Command Center</Link>
          <Link href="/admin/notifications">Notifications & Announcements</Link>
          <Link href="/admin/users">Users</Link>
          <Link href="/admin/content">Content</Link>
          <Link href="/admin/safety">Safety & Moderation</Link>
          <Link href="/admin/youth">Youth Safety</Link>
          <Link href="/admin/live">LIVE</Link>
          <Link href="/admin/creators">Creators</Link>
          <Link href="/admin/verification">Verification</Link>
          <Link href="/admin/communities">Communities</Link>
          <Link href="/admin/marketplace">Marketplace</Link>
          <Link href="/admin/analytics">Analytics</Link>
          <Link href="/admin/settings">Platform Settings</Link>
          <Link href="/admin/security">Security & Audit</Link>
        </nav>
        <div className="sidebar-footer">
          <div className="admin-badge">OWNER • PRIVILEGED</div>
          <small>Separate from public users</small>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">TWITOK PLATFORM CONTROL</p>
            <h1>Owner Command Center</h1>
            <p className="muted">The private control plane for the TwiTok platform.</p>
          </div>
          <form action="/api/admin/logout" method="post"><button className="logout">Sign out</button></form>
        </header>

        <div className="notice">
          <strong>OWNER CONTROL PLANE.</strong> The platform owner is not represented as a normal TwiTok user account.
        </div>

        <section className="stats">
          {cards.map(([title, value, detail]) => (
            <article className="stat" key={title}><span>{title}</span><strong>{value}</strong><small>{detail}</small></article>
          ))}
        </section>

        <section className="grid">
          <article className="panel">
            <div className="panel-head"><div><p className="eyebrow">SAFETY</p><h2>Safety Command</h2></div><Link href="/admin/safety">Open</Link></div>
            <div className="metric-row"><span>Open reports</span><strong>{data.reports ?? 0}</strong></div>
            <div className="metric-row"><span>Automated moderation</span><strong>Enabled</strong></div>
            <div className="metric-row"><span>Youth protection</span><strong>Enabled</strong></div>
          </article>

          <article className="panel">
            <div className="panel-head"><div><p className="eyebrow">PLATFORM</p><h2>System Status</h2></div><span className="status-dot">Connected</span></div>
            <div className="metric-row"><span>API</span><strong className="ok">Ready</strong></div>
            <div className="metric-row"><span>MongoDB</span><strong className="ok">Connected</strong></div>
            <div className="metric-row"><span>Owner authentication</span><strong className="ok">Protected</strong></div>
          </article>

          <article className="panel wide">
            <div className="panel-head">
              <div><p className="eyebrow">CONTROL</p><h2>Administrator Powers</h2></div>
              <Link href="/admin/notifications">Open communications</Link>
            </div>
            <div className="power-grid">
              {powers.map((item) => <div className="power" key={item}>✓ {item}</div>)}
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}
