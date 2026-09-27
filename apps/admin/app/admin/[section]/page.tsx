import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const API_URL = process.env.TWITOK_API_URL ?? "http://localhost:4000";

const modules: Record<string, {title:string; description:string; controls:string[]}> = {
  users:{title:"Users & Accounts",description:"Manage ordinary TwiTok users. Owner authority is never stored as a user role.",controls:["Search accounts","Suspend or restore accounts","Verification","Account safety history"]},
  content:{title:"Content Control",description:"Review and manage published platform content.",controls:["Video review","Comments","Hashtags","Takedowns and appeals"]},
  safety:{title:"Safety & Moderation",description:"Operate the automated and human safety system.",controls:["Moderation queue","Policy rules","Blocked content","Appeals"]},
  youth:{title:"Youth Safety",description:"Configure age-aware protection and continuous-use policies.",controls:["60-minute active-use limit","2-hour mandatory break","Allowed hours","LIVE and messaging controls"]},
  live:{title:"LIVE Control",description:"Control live streaming and emergency safety operations.",controls:["Active streams","Host controls","Reports","Emergency shutdown"]},
  creators:{title:"Creator Economy",description:"Manage creators, verification and monetization operations.",controls:["Creator verification","Rewards","Gifts","Payouts"]},
  communities:{title:"Communities",description:"Manage community discovery, reports and enforcement.",controls:["Community review","Membership controls","Reports","Featured communities"]},
  marketplace:{title:"Marketplace",description:"Manage sellers, products and commerce safety.",controls:["Seller verification","Listings","Orders","Disputes"]},
  analytics:{title:"Analytics",description:"Monitor platform performance and safety metrics.",controls:["Growth","Engagement","Retention","Safety analytics"]},
  settings:{title:"Platform Settings",description:"Control global TwiTok configuration.",controls:["Countries","Languages","Feature flags","Maintenance mode"]},
  security:{title:"Security & Audit",description:"Control privileged access and review administrative activity.",controls:["Owner sessions","Staff roles","MFA","Audit logs"]}
};

async function isOwnerSessionValid() {
  const cookieStore = await cookies();
  const token = cookieStore.get("twitok_owner_session")?.value;
  if (!token) return false;

  const response = await fetch(`${API_URL}/api/v1/admin/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  return response.ok;
}

export default async function AdminModule({params}:{params:Promise<{section:string}>}) {
  if (!(await isOwnerSessionValid())) redirect("/admin/login");
  const {section}=await params;
  const module=modules[section] ?? {title:"Control Module",description:"TwiTok administrative control.",controls:["Configuration","Monitoring","Audit"]};

  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">T</div><div><strong>TwiTok</strong><span>OWNER CONTROL</span></div></div>
        <nav>
          <Link href="/admin">Command Center</Link>
          {Object.entries(modules).map(([key,item])=><Link className={key===section?"active":""} key={key} href={`/admin/${key}`}>{item.title}</Link>)}
        </nav>
        <div className="sidebar-footer"><div className="admin-badge">OWNER • PRIVILEGED</div><small>Separate from public users</small></div>
      </aside>
      <section className="content">
        <header className="topbar">
          <div><p className="eyebrow">OWNER CONTROL</p><h1>{module.title}</h1><p className="muted">{module.description}</p></div>
          <Link className="logout" href="/admin">Back to command center</Link>
        </header>
        <div className="notice"><strong>Privileged module.</strong> Real mutations will require server-side OWNER permission checks and audit logging.</div>
        <section className="grid">
          <article className="panel wide">
            <div className="panel-head"><div><p className="eyebrow">CONTROLS</p><h2>Available controls</h2></div></div>
            <div className="power-grid">{module.controls.map(control=><div className="power" key={control}>✓ {control}</div>)}</div>
          </article>
          <article className="panel wide">
            <div className="panel-head"><div><p className="eyebrow">NEXT IMPLEMENTATION</p><h2>Protected operations</h2></div></div>
            <p className="muted">This module is wired into the owner control-plane navigation. Its data mutations will be connected to MongoDB-backed API endpoints as each TwiTok domain is implemented.</p>
          </article>
        </section>
      </section>
    </main>
  );
}
