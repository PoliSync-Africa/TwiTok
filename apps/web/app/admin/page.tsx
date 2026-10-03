"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
const ADMIN_TOKEN_KEY = "twitok_admin_session";

type Overview = {
  users:number; videos:number; reports:number; live:number; creators:number; streams:number; wallets:number; pendingWithdrawals:number;
  money?: { grossUsd?:number; platformUsd?:number; creatorUsd?:number };
};

export default function AdminPage() {
  const router = useRouter();
  const [admin, setAdmin] = useState<any>(null);
  const [overview, setOverview] = useState<Overview|null>(null);
  const [error, setError] = useState("");

  async function request(path:string) {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (!token) { router.replace("/admin/login"); return null; }
    const response = await fetch(API + path, { cache:"no-store", headers:{ Authorization:"Bearer " + token, Accept:"application/json" } });
    if (response.status===401 || response.status===403) { localStorage.removeItem(ADMIN_TOKEN_KEY); router.replace("/admin/login"); return null; }
    const data = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(data.error ?? "Unable to load administrator data.");
    return data;
  }

  useEffect(() => {
    (async () => {
      try {
        const [me, stats] = await Promise.all([request("/admin/auth/me"), request("/admin/overview")]);
        if (me) setAdmin(me.administrator);
        if (stats) setOverview(stats);
      } catch (err) { setError(err instanceof Error ? err.message : "Unable to load administrator dashboard."); }
    })();
  }, []);

  function logout() { localStorage.removeItem(ADMIN_TOKEN_KEY); router.replace("/admin/login"); }

  const cards = [
    ["Users", overview?.users ?? 0], ["Published videos", overview?.videos ?? 0],
    ["Open reports", overview?.reports ?? 0], ["Live now", overview?.live ?? 0],
    ["Creators", overview?.creators ?? 0], ["Pending withdrawals", overview?.pendingWithdrawals ?? 0]
  ];

  return (
    <main style={styles.screen}>
      <header style={styles.header}>
        <div><div style={styles.brand}>TwiTok <span style={{color:"#777"}}>Admin</span></div><div style={styles.muted}>{admin?.displayName ?? "Administrator"}</div></div>
        <button onClick={logout} style={styles.logout}>Sign out</button>
      </header>
      <section style={styles.content}>
        <div style={styles.hero}>
          <div><div style={styles.eyebrow}>OWNER CONTROL CENTER</div><h1 style={styles.title}>Platform overview</h1><p style={styles.muted}>Manage TwiTok operations, safety, verification and platform finances.</p></div>
          <div style={styles.ownerBadge}>OWNER</div>
        </div>
        {error ? <div style={styles.error}>{error}</div> : null}
        <div style={styles.grid}>{cards.map(([label,value]) => <div key={String(label)} style={styles.card}><div style={styles.cardLabel}>{label}</div><div style={styles.number}>{Number(value).toLocaleString()}</div></div>)}</div>
        <section style={styles.panel}>
          <div style={styles.panelTitle}>Financial overview</div>
          <div style={styles.financeGrid}>
            <Metric label="Gross" value={overview?.money?.grossUsd}/><Metric label="Platform" value={overview?.money?.platformUsd}/><Metric label="Creator" value={overview?.money?.creatorUsd}/>
          </div>
        </section>
        <section style={styles.actions}>
          <Action title="Verification" text="Review creator verification requests."/><Action title="Safety & moderation" text="Review reports and moderation activity."/>
          <Action title="Finance" text="Review ledger and withdrawals."/><Action title="Platform controls" text="Owner-only operational controls."/>
        </section>
      </section>
    </main>
  );
}

function Metric({label,value}:{label:string,value?:number}) { return <div><div style={styles.cardLabel}>{label}</div><div style={styles.money}>{"$"+Number(value??0).toFixed(2)}</div></div>; }
function Action({title,text}:{title:string,text:string}) { return <div style={styles.action}><strong>{title}</strong><span style={styles.actionText}>{text}</span></div>; }

const styles: Record<string, React.CSSProperties> = {
  screen:{minHeight:"100dvh",background:"#f6f6f7",color:"#111",fontFamily:'"TikTok Sans Variable","TikTok Sans",system-ui,sans-serif'},
  header:{height:72,padding:"0 28px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fff",borderBottom:"1px solid #e7e7e9",position:"sticky",top:0,zIndex:5},
  brand:{fontSize:20,fontWeight:800}, muted:{color:"#777",fontSize:13,marginTop:3}, logout:{border:"1px solid #ddd",background:"#fff",borderRadius:10,padding:"9px 13px",fontWeight:700,cursor:"pointer"},
  content:{maxWidth:1180,margin:"0 auto",padding:"34px 24px 60px"}, hero:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:20,marginBottom:28},
  eyebrow:{fontSize:11,letterSpacing:1.3,fontWeight:800,color:"#777"}, title:{fontSize:32,lineHeight:1.1,margin:"7px 0 6px",letterSpacing:-.9},
  ownerBadge:{background:"#111",color:"#fff",borderRadius:999,padding:"8px 13px",fontSize:11,fontWeight:800,letterSpacing:1},
  error:{padding:14,borderRadius:12,background:"#fff1f3",color:"#a31e38",marginBottom:18,fontSize:13},
  grid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:14}, card:{background:"#fff",border:"1px solid #e7e7e9",borderRadius:16,padding:18},
  cardLabel:{color:"#777",fontSize:12,fontWeight:700}, number:{fontSize:28,fontWeight:800,marginTop:8,letterSpacing:-.7},
  panel:{marginTop:18,background:"#fff",border:"1px solid #e7e7e9",borderRadius:16,padding:20}, panelTitle:{fontSize:16,fontWeight:800,marginBottom:18},
  financeGrid:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}, money:{fontSize:22,fontWeight:800,marginTop:7},
  actions:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14,marginTop:18}, action:{background:"#fff",border:"1px solid #e7e7e9",borderRadius:16,padding:18,display:"grid",gap:7}, actionText:{color:"#777",fontSize:13}
};