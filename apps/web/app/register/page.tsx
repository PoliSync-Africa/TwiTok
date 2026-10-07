"use client";

import { FormEvent, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TWITOK_COUNTRIES, countryFlag, type TwiTokCountry } from "@twitok/types";

const API = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "https://twitok-api-sfig.onrender.com/api/v1";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [dob, setDob] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedCountry: TwiTokCountry | undefined = useMemo(
    () => TWITOK_COUNTRIES.find(country => country.alpha2 === countryCode),
    [countryCode]
  );
  const maxDob = useMemo(() => new Date().toISOString().slice(0, 10), []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (!email.trim() && !phone.trim()) {
      setError("Enter an email address or phone number.");
      return;
    }
    if (email.trim() && phone.trim()) {
      setError("Use either an email address or a phone number to create your account.");
      return;
    }
    if (!countryCode) {
      setError("Select your country.");
      return;
    }
    if (phone.trim() && !selectedCountry) {
      setError("Select a valid country for your phone number.");
      return;
    }
    if (password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!dob) {
      setError("Select your date of birth.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(API + "/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          password,
          dateOfBirth: dob,
          countryCode
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token) throw new Error(data.error ?? "Unable to create account");
      localStorage.setItem("twitok_user_token", data.token);
      router.replace("/profile-setup");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={styles.page}>
      <form onSubmit={submit} style={styles.card}>
        <Link href="/" style={styles.back}>← TwiTok</Link>
        <h1 style={styles.title}>Create your TwiTok account</h1>
        <p style={styles.muted}>Choose your country, secure your password, and enter your date of birth.</p>

        <label style={styles.label}>Email address</label>
        <input value={email} onChange={event => setEmail(event.target.value)} style={styles.input} placeholder="Email address" type="email" autoCapitalize="none" autoComplete="email" />

        <label style={styles.label}>Country</label>
        <div style={styles.countrySelectWrap}>
          {selectedCountry ? <span aria-hidden="true" style={styles.flag}>{countryFlag(selectedCountry.alpha2)}</span> : null}
          <select value={countryCode} onChange={event => setCountryCode(event.target.value)} style={styles.select} aria-label="Select country">
            <option value="">Select country</option>
            {TWITOK_COUNTRIES.map(country => (
              <option key={country.alpha2} value={country.alpha2}>
                {country.alpha3} {countryFlag(country.alpha2)} {country.dialCode} — {country.name}
              </option>
            ))}
          </select>
        </div>

        <label style={styles.label}>Phone number</label>
        <div style={styles.phoneRow}>
          <div style={styles.phonePrefix} aria-label={selectedCountry ? selectedCountry.alpha3 + " " + selectedCountry.dialCode : "Country code"}>
            <span>{selectedCountry ? countryFlag(selectedCountry.alpha2) : "🌐"}</span>
            <strong>{selectedCountry?.alpha3 ?? "CODE"}</strong>
            <span>{selectedCountry?.dialCode ?? "+—"}</span>
          </div>
          <input
            value={phone}
            onChange={event => setPhone(event.target.value.replace(/[^0-9+\s().-]/g, ""))}
            style={styles.phoneInput}
            placeholder="Phone number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
          />
        </div>

        <label style={styles.label}>Password</label>
        <div style={styles.passwordWrap}>
          <input value={password} onChange={event => setPassword(event.target.value)} style={styles.passwordInput} placeholder="Password (minimum 8 characters)" type={showPassword ? "text" : "password"} minLength={8} required autoComplete="new-password" />
          <button type="button" onClick={() => setShowPassword(value => !value)} style={styles.eye} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button>
        </div>

        <label style={styles.label}>Confirm password</label>
        <div style={styles.passwordWrap}>
          <input value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} style={styles.passwordInput} placeholder="Confirm password" type={showConfirmPassword ? "text" : "password"} minLength={8} required autoComplete="new-password" />
          <button type="button" onClick={() => setShowConfirmPassword(value => !value)} style={styles.eye} aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}>{showConfirmPassword ? "Hide" : "Show"}</button>
        </div>

        <label style={styles.label}>Date of birth</label>
        <div style={styles.dateWrap}>
          <input value={dob} onChange={event => setDob(event.target.value)} style={styles.dateInput} type="date" max={maxDob} required aria-label="Date of birth" />
          <span style={styles.calendarHint}>📅</span>
        </div>
        <p style={styles.hint}>Tap the date field to open the calendar and choose your birth date.</p>

        {error ? <p role="alert" style={styles.error}>{error}</p> : null}
        <button disabled={busy} style={{ ...styles.primary, opacity: busy ? 0.65 : 1 }}>{busy ? "Creating account…" : "Sign up"}</button>
        <p style={styles.bottom}>Already have an account? <Link href="/login" style={styles.link}>Sign in</Link></p>
      </form>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#000", color: "#fff", display: "grid", placeItems: "center", padding: "28px 18px" },
  card: { width: "100%", maxWidth: 520, boxSizing: "border-box", background: "#111", border: "1px solid #292929", borderRadius: 24, padding: "30px 28px", boxShadow: "0 18px 60px rgba(0,0,0,.35)" },
  back: { color: "#25f4ee", textDecoration: "none", fontWeight: 800 },
  title: { fontSize: "clamp(28px, 5vw, 42px)", lineHeight: 1.08, margin: "22px 0 10px" },
  muted: { color: "#a1a1a1", lineHeight: 1.55, marginBottom: 20 },
  label: { display: "block", margin: "14px 0 7px", color: "#d8d8d8", fontWeight: 700, fontSize: 14 },
  input: { width: "100%", boxSizing: "border-box", padding: "15px 16px", borderRadius: 14, border: "1px solid #383838", background: "#181818", color: "#fff", outline: "none", fontSize: 16 },
  countrySelectWrap: { position: "relative" },
  flag: { position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)", zIndex: 1, fontSize: 22, pointerEvents: "none" },
  select: { width: "100%", boxSizing: "border-box", padding: "15px 44px 15px 16px", borderRadius: 14, border: "1px solid #383838", background: "#181818", color: "#fff", fontSize: 16, outline: "none" },
  phoneRow: { display: "grid", gridTemplateColumns: "minmax(132px, 0.42fr) 1fr", gap: 8 },
  phonePrefix: { minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "0 10px", borderRadius: 14, border: "1px solid #383838", background: "#181818", color: "#fff", fontSize: 14 },
  phoneInput: { width: "100%", boxSizing: "border-box", padding: "15px 16px", borderRadius: 14, border: "1px solid #383838", background: "#181818", color: "#fff", outline: "none", fontSize: 16 },
  passwordWrap: { display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", padding: 4, borderRadius: 14, border: "1px solid #383838", background: "#181818" },
  passwordInput: { width: "100%", boxSizing: "border-box", padding: "11px 12px", border: 0, outline: "none", background: "transparent", color: "#fff", fontSize: 16 },
  eye: { border: 0, background: "transparent", color: "#25f4ee", fontWeight: 800, padding: "10px 12px", cursor: "pointer" },
  dateWrap: { position: "relative" },
  dateInput: { width: "100%", boxSizing: "border-box", padding: "15px 48px 15px 16px", borderRadius: 14, border: "1px solid #383838", background: "#181818", color: "#fff", outline: "none", fontSize: 16, colorScheme: "dark" },
  calendarHint: { position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 20 },
  hint: { margin: "7px 0 0", color: "#777", fontSize: 12 },
  primary: { width: "100%", marginTop: 20, padding: "16px 15px", border: 0, borderRadius: 14, background: "#fe2c55", color: "#fff", fontWeight: 900, fontSize: 17, cursor: "pointer" },
  error: { color: "#ff7184", background: "rgba(254,44,85,.08)", border: "1px solid rgba(254,44,85,.25)", padding: 12, borderRadius: 12, fontSize: 13, lineHeight: 1.4 },
  bottom: { textAlign: "center", color: "#999", marginTop: 20 },
  link: { color: "#25f4ee", fontWeight: 900 }
};
