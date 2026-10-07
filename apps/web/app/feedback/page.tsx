"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "https://twitok-api-sfig.onrender.com/api/v1";

export default function FeedbackPage() {
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return setStatus("Please enter your feedback or question.");
    setBusy(true); setStatus("");
    try {
      const response = await fetch(API + "/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim(), email: email.trim() || undefined }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Unable to send feedback");
      setMessage("");
      setStatus("Thanks. Your feedback has been submitted.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Feedback is temporarily unavailable.");
    } finally { setBusy(false); }
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <Link href="/" style={styles.back}>← TwiTok</Link>
        <h1 style={styles.title}>Feedback &amp; Help</h1>
        <p style={styles.muted}>Get help, report a problem, or tell us how TwiTok can improve.</p>

        <div style={styles.quick}>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
        </div>

        <form onSubmit={submit}>
          <label style={styles.label}>Email (optional)</label>
          <input value={email} onChange={e => setEmail(e.target.value)} style={styles.input} type="email" placeholder="you@example.com" autoComplete="email" />

          <label style={styles.label}>Feedback or question</label>
          <textarea value={message} onChange={e => setMessage(e.target.value)} style={styles.textarea} maxLength={4000} placeholder="Tell us what happened or what you need help with." required />

          {status ? <p role="status" style={styles.status}>{status}</p> : null}
          <button disabled={busy} style={styles.button}>{busy ? "Sending…" : "Send feedback"}</button>
        </form>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page:{minHeight:"100vh",background:"#000",color:"#fff",display:"grid",placeItems:"center",padding:"24px 16px"},
  card:{width:"100%",maxWidth:680,boxSizing:"border-box",background:"#111",border:"1px solid #292929",borderRadius:24,padding:"30px 28px"},
  back:{color:"#25f4ee",textDecoration:"none",fontWeight:800},
  title:{fontSize:"clamp(32px,7vw,48px)",margin:"18px 0 8px"},
  muted:{color:"#aaa",lineHeight:1.6},
  quick:{display:"flex",gap:18,flexWrap:"wrap",margin:"18px 0 24px"},
  label:{display:"block",margin:"14px 0 7px",fontWeight:700,color:"#ddd"},
  input:{width:"100%",boxSizing:"border-box",padding:"14px 15px",background:"#181818",color:"#fff",border:"1px solid #383838",borderRadius:14},
  textarea:{width:"100%",minHeight:170,boxSizing:"border-box",padding:"14px 15px",background:"#181818",color:"#fff",border:"1px solid #383838",borderRadius:14,resize:"vertical"},
  status:{color:"#25f4ee",fontSize:14},
  button:{width:"100%",marginTop:16,padding:"15px",border:0,borderRadius:999,background:"#25f4ee",color:"#000",fontWeight:900,fontSize:16},
};
