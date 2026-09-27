import Link from "next/link";

const cards = [
  ["Users", "0", "Accounts registered"],
  ["Videos", "0", "Published videos"],
  ["Reports", "0", "Safety reports awaiting review"],
  ["Live", "0", "Active live sessions"],
  ["Creators", "0", "Creator accounts"],
  ["Revenue", "$0", "Platform revenue"]
];

export default function AdminHome() {
  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">T</div>
          <div><strong>TwiTok</strong><span>ADMIN</span></div>
        </div>
        <nav>
          <Link className="active" href="/admin">Overview</Link>
          <Link href="/admin/users">Users</Link>
          <Link href="/admin/content">Content</Link>
          <Link href="/admin/safety">Safety & Moderation</Link>
          <Link href="/admin/live">LIVE</Link>
          <Link href="/admin/creators">Creators</Link>
          <Link href="/admin/communities">Communities</Link>
          <Link href="/admin/marketplace">Marketplace</Link>
          <Link href="/admin/analytics">Analytics</Link>
          <Link href="/admin/settings">Platform Settings</Link>
        </nav>
        <div className="sidebar-footer">
          <div className="admin-badge">OWNER ADMIN</div>
          <small>Private control center</small>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">TWITOK PLATFORM CONTROL</p>
            <h1>Admin Control Center</h1>
            <p className="muted">Manage the platform, safety systems, creators and infrastructure from one private console.</p>
          </div>
          <div className="admin-session">
            <div className="avatar">A</div>
            <div><strong>Platform Admin</strong><span>Owner access</span></div>
          </div>
        </header>

        <div className="notice">
          <strong>Admin-only environment.</strong> This console is separate from the public TwiTok user experience. No public user account is being created for the administrator.
        </div>

        <section className="stats">
          {cards.map(([title, value, detail]) => (
            <article className="stat" key={title}>
              <span>{title}</span>
              <strong>{value}</strong>
              <small>{detail}</small>
            </article>
          ))}
        </section>

        <section className="grid">
          <article className="panel">
            <div className="panel-head"><div><p className="eyebrow">SAFETY</p><h2>Safety Command</h2></div><Link href="/admin/safety">Open</Link></div>
            <div className="metric-row"><span>Pending reports</span><strong>0</strong></div>
            <div className="metric-row"><span>Blocked content</span><strong>0</strong></div>
            <div className="metric-row"><span>Appeals</span><strong>0</strong></div>
            <div className="metric-row"><span>Automated actions</span><strong>0</strong></div>
          </article>

          <article className="panel">
            <div className="panel-head"><div><p className="eyebrow">PLATFORM</p><h2>System Status</h2></div><span className="status-dot">Operational</span></div>
            <div className="metric-row"><span>API</span><strong className="ok">Ready</strong></div>
            <div className="metric-row"><span>Database</span><strong className="ok">Ready</strong></div>
            <div className="metric-row"><span>Video pipeline</span><strong className="ok">Ready</strong></div>
            <div className="metric-row"><span>Realtime</span><strong className="ok">Ready</strong></div>
          </article>

          <article className="panel wide">
            <div className="panel-head"><div><p className="eyebrow">CONTROL</p><h2>Administrator Powers</h2></div></div>
            <div className="power-grid">
              {[
                "Manage accounts and roles",
                "Remove or restrict content",
                "Review safety decisions",
                "Configure youth protection",
                "Manage creators and verification",
                "Control LIVE access",
                "Manage communities",
                "Manage marketplace",
                "Review platform analytics",
                "Configure global settings",
                "Audit administrator actions",
                "Emergency platform controls"
              ].map((item) => <div className="power" key={item}>✓ {item}</div>)}
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}
