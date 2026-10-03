"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
const ADMIN_TOKEN_KEY = "twitok_admin_session";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (!token) return;
    fetch(API + "/admin/auth/me", { cache: "no-store", headers: { Authorization: "Bearer " + token } })
      .then(r => { if (r.ok) router.replace("/admin"); else localStorage.removeItem(ADMIN_TOKEN_KEY); })
      .catch(() => {});
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(API + "/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password, ...(mfaCode ? { mfaCode } : {}) })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { if (data.mfaRequired) setMfaRequired(true); throw new Error(data.error ?? "Administrator sign-in failed."); }
      localStorage.setItem(ADMIN_TOKEN_KEY, data.token); router.replace("/admin");
    } catch (err) { setError(err instanceof Error ? err.message : "Administrator sign-in failed."); }
    finally { setBusy(false); }
  }

  return (
    <main style={styles.screen}>
      <section style={styles.card}>
        <div style={styles.mark}>T</div>
        <div style={styles.eyebrow}>TWITOK ADMINISTRATION</div>
        <h1 style={styles.title}>Administrator sign in</h1>
        <p style={styles.subtitle}>Owner access to the TwiTok control center.</p>
        <form onSubmit={submit} style={styles.form}>
          <label style={styles.label}>Administrator email
            <input style={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" placeholder="admin@yourdomain.com" required />
          </label>
          <label style={styles.label}>Password
            <input style={styles.input} type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" placeholder="Administrator password" required />
          </label>
          {mfaRequired ? <label style={styles.label}>Authentication code
            <input style={styles.input} inputMode="numeric" maxLength={6} value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" required />
          </label> : null}
          {error ? <div style={styles.error}>{error}</div> : null}
          <button disabled={busy} style={{...styles.button, opacity: busy ? 0.65 : 1}}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <div style={styles.security}><span>OWNER</span><span>•</span><span>Protected administrator session</span></div>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  screen: { minHeight:"100dvh", display:"grid", placeItems:"center", padding:24, background:"linear-gradient(180deg,#08080b,#111116)", color:"#111", fontFamily:'"TikTok Sans Variable","TikTok Sans",system-ui,sans-serif' },
  card: { width:"min(440px,100%)", padding:34, borderRadius:24, background:"#fff", boxShadow:"0 24px 80px rgba(0,0,0,.35)" },
  mark: { width:46, height:46, borderRadius:13, display:"grid", placeItems:"center", background:"#111", color:"#fff", fontSize:25, fontWeight:800, marginBottom:20 },
  eyebrow: { fontSize:11, fontWeight:800, letterSpacing:1.4, color:"#777" },
  title: { margin:"8px 0 7px", fontSize:28, lineHeight:1.1, letterSpacing:-.7 },
  subtitle: { margin:0, color:"#777", fontSize:14, lineHeight:1.5 },
  form: { display:"grid", gap:15, marginTop:26 },
  label: { display:"grid", gap:7, fontSize:13, fontWeight:700 },
  input: { width:"100%", boxSizing:"border-box", border:"1px solid #ddd", borderRadius:12, padding:"13px 14px", fontSize:15, outline:"none", background:"#fafafa" },
  button: { border:0, borderRadius:13, padding:"14px 16px", background:"#111", color:"#fff", fontSize:15, fontWeight:800, cursor:"pointer" },
  error: { borderRadius:10, padding:"10px 12px", background:"#fff1f3", color:"#b4233c", fontSize:13, lineHeight:1.4 },
  security: { display:"flex", justifyContent:"center", gap:7, marginTop:20, color:"#888", fontSize:11 }
};