"use client";

import { FormEvent, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import CountryCodePicker from "../../components/CountryCodePicker";
import { TWITOK_COUNTRIES } from "@twitok/types";

const API = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "https://twitok-api-sfig.onrender.com/api/v1";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [method, setMethod] = useState<"phone" | "email" | "username">("phone");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [countryCode, setCountryCode] = useState("GH");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const country = TWITOK_COUNTRIES.find(item => item.alpha2 === countryCode);
  const countryName = country?.name ?? "your country";

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(API + "/auth/login", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: identifier.trim(), password, countryCode }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token) throw new Error(data.error ?? "Unable to sign in");
      localStorage.setItem("twitok_user_token", data.token);
      const next = searchParams.get("next");
      const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : (data.user?.profileSetupComplete === false ? "/profile-setup" : "/");
      router.replace(destination);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to sign in"); }
    finally { setBusy(false); }
  }

  function social(provider: "google" | "apple" | "facebook") {
    setError(provider[0].toUpperCase() + provider.slice(1) + " sign-in will open when this provider is configured.");
  }

  return <main style={styles.page}><div style={styles.card}>
    <Link href="/" style={styles.back}>← TwiTok</Link>
    <h1>Sign in</h1><p style={styles.muted}>Sign in to your TwiTok account.</p>

    <div className="kente-button-wrap"><button type="button" className="auth-secondary" onClick={() => setError("QR login will open when the device session is available.")}>Sign in with QR code</button></div>

    <div style={styles.tabs}>{(["email","phone","username"] as const).map(item => <button type="button" key={item} onClick={() => setMethod(item)} style={method === item ? styles.tabActive : styles.tab}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
    {method === "phone" ? <div style={styles.phoneRow}><CountryCodePicker value={countryCode} onChange={setCountryCode} /><input value={identifier} onChange={e => setIdentifier(e.target.value.replace(/[^0-9+\s().-]/g, ""))} style={styles.input} placeholder="Phone number" type="tel" inputMode="tel" required autoComplete="tel" /></div> : <input value={identifier} onChange={e => setIdentifier(e.target.value)} style={styles.input} placeholder={method === "email" ? "Email address" : "Username"} required autoCapitalize="none" />}
    <input value={password} onChange={e => setPassword(e.target.value)} style={styles.input} placeholder="Password" type="password" required minLength={8} />
    {error ? <p style={styles.error}>{error}</p> : null}
    <div className="kente-button-wrap"><button disabled={busy} className="auth-primary" style={styles.primary}>{busy ? "Signing in…" : "Sign in"}</button></div>

    <div style={styles.divider}><span>or continue with</span></div>
    <div style={styles.socialGrid}>
      <button type="button" onClick={() => social("google")} style={styles.social}>Google</button>
      <button type="button" onClick={() => social("apple")} style={styles.social}>Apple</button>
      <button type="button" onClick={() => social("facebook")} style={styles.social}>Facebook</button>
    </div>

    <div style={styles.legal}>
      Continuing with an account located in {countryName} means you agree to our <Link href="/terms" style={styles.link}>Terms of Service</Link> and acknowledge that you have read our <Link href="/privacy" style={styles.link}>Privacy Policy</Link>.
    </div>

    <div style={styles.helpRow}><Link href="/feedback" style={styles.link}>? Feedback and Help</Link></div>
    <div className="kente-button-wrap auth-signup-wrap"><Link href="/register" className="auth-signup-primary" style={styles.signupButton}>Sign up</Link></div>
  </div></main>;
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#000", color: "#fff", display: "grid", placeItems: "center", padding: 24 },
  card: { width: "100%", maxWidth: 460, background: "#111", border: "1px solid #292929", borderRadius: 24, padding: 32, boxShadow: "0 20px 80px rgba(0,0,0,.5)" },
  back: { color: "#25f4ee", textDecoration: "none" },
  muted: { color: "#999", lineHeight: 1.6 },
  tabs: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, margin: "20px 0 10px" },
  tab: { background: "#1b1b1b", color: "#aaa", border: "1px solid #333", padding: 11, borderRadius: 10 },
  tabActive: { background: "#fff", color: "#000", border: "1px solid #fff", padding: 11, borderRadius: 10 },
  phoneRow: { display: "grid", gridTemplateColumns: "132px 1fr", gap: 8 },
  input: { width: "100%", boxSizing: "border-box", marginTop: 10, padding: "14px 15px", borderRadius: 12, border: "1px solid #333", background: "#181818", color: "#fff", outline: "none" },
  primary: { width: "100%", padding: 13, border: 0, borderRadius: 10, background: "#25f4ee", color: "#000", fontWeight: 900, fontSize: 16 },
  error: { color: "#ff6b7f", fontSize: 13 },
  divider: { display: "flex", alignItems: "center", gap: 10, margin: "22px 0 12px", color: "#777", fontSize: 12 },
  socialGrid: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 },
  social: { border: "1px solid #333", background: "#181818", color: "#fff", padding: 12, borderRadius: 10, fontWeight: 800 },
  legal: { color: "#777", fontSize: 12, lineHeight: 1.55, textAlign: "center", marginTop: 18 },
  link: { color: "#25f4ee", fontWeight: 800, textDecoration: "none" },
  helpRow: { textAlign: "center", marginTop: 16 },
  signupButton: { display: "flex", alignItems: "center", justifyContent: "center", width: "100%", minHeight: 52, boxSizing: "border-box", borderRadius: 15, textDecoration: "none", fontWeight: 900, fontSize: 17 }
};