"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function OwnerLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, mfaCode: mfaCode.trim() || undefined })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Unable to sign in");
        return;
      }

      router.replace("/admin");
      router.refresh();
    } catch {
      setError("Unable to connect to the TwiTok administration service");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-mark">T</div>
        <p className="eyebrow">TWITOK PLATFORM</p>
        <h1>Owner Control Center</h1>
        <p className="muted">Private administration access. This is not a public TwiTok user login.</p>

        <form onSubmit={submit}>
          <label>Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          <label>MFA code <span className="muted">(if enabled)</span><input inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={6} value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\\D/g, "").slice(0, 6))} placeholder="6-digit code" /></label>
          {error && <div className="login-error">{error}</div>}
          <button disabled={loading}>{loading ? "Signing in…" : "Sign in as Owner"}</button>
        </form>

        <small className="login-note">Owner credentials are stored as deployment secrets, never in the repository.</small>
      </section>
    </main>
  );
}
