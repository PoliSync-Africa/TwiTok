"use client";

import { FormEvent, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TWITOK_COUNTRIES, type TwiTokCountry } from "@twitok/types";
import CountryCodePicker from "../../components/CountryCodePicker";

const API = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "https://twitok-api-sfig.onrender.com/api/v1";

type Method = "phone" | "email" | "username";
type Step = "contact" | "details" | "verify";

export default function RegisterPage() {
  const router = useRouter();
  const [method, setMethod] = useState<Method>("phone");
  const [step, setStep] = useState<Step>("contact");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [dob, setDob] = useState("");
  const [countryCode, setCountryCode] = useState("GH");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const selectedCountry: TwiTokCountry | undefined = useMemo(() => TWITOK_COUNTRIES.find(country => country.alpha2 === countryCode), [countryCode]);
  const maxDob = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const contact = method === "phone"
    ? [selectedCountry?.dialCode, phone.trim()].filter(Boolean).join(" ")
    : method === "email" ? email.trim() : `@${username.trim()}`;

  function continueFromContact(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (method === "phone" && (!selectedCountry || !phone.trim())) return setError("Select your country and enter your phone number.");
    if (method === "email" && !email.trim()) return setError("Enter your email address.");
    if (method === "username" && !/^[a-z0-9._]{3,24}$/.test(username.trim().toLowerCase())) return setError("Username must be 3-24 characters and use letters, numbers, dots or underscores.");
    setStep("details");
  }

  async function createAccount(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must contain at least 8 characters.");
    if (password !== confirmPassword) return setError("Passwords do not match.");
    if (!dob) return setError("Select your date of birth.");
    if (method === "username") return setError("Username signup requires a phone number or email for account verification. Choose Phone or Email to continue.");

    setBusy(true);
    try {
      const normalizedPhone = method === "phone"
        ? [selectedCountry?.dialCode, phone.replace(/\D/g, "").replace(/^0+/, "")].filter(Boolean).join("")
        : undefined;

      if (method === "phone" && !/^\+[0-9]{7,15}$/.test(normalizedPhone ?? "")) {
        setError("Enter a valid phone number for the selected country.");
        setBusy(false);
        return;
      }

      const response = await fetch(API + "/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: method === "email" ? email.trim() : undefined,
          phone: normalizedPhone,
          password,
          dateOfBirth: dob,
          countryCode: selectedCountry?.alpha2 ?? countryCode
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token) throw new Error(data.error ?? "Unable to create account");
      localStorage.setItem("twitok_user_token", data.token);

      const verificationResponse = await fetch(API + "/auth/verification/send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + data.token },
        body: JSON.stringify({ channel: method })
      });

      const verificationData = await verificationResponse.json().catch(() => ({}));
      if (!verificationResponse.ok) throw new Error(verificationData.error ?? "Verification delivery is temporarily unavailable.");
      setStep("verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create account");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit verification code.");

    setBusy(true);
    try {
      const token = localStorage.getItem("twitok_user_token");
      const response = await fetch(API + "/auth/verification/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
        body: JSON.stringify({ code })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Verification failed");
      router.replace("/profile-setup");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    setError("");
    setBusy(true);
    try {
      const token = localStorage.getItem("twitok_user_token");
      const response = await fetch(API + "/auth/verification/send", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
        body: JSON.stringify({ channel: method })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Unable to resend code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resend code");
    } finally {
      setBusy(false);
    }
  }

  const formSubmit = step === "contact" ? continueFromContact : step === "details" ? createAccount : verifyCode;

  return (
    <main style={styles.page}>
      <form onSubmit={formSubmit} style={styles.card}>
        <Link href="/" style={styles.back}>← TwiTok</Link>

        {step === "contact" ? (
          <>
            <h1 style={styles.title}>Create account</h1>
            <p style={styles.muted}>Choose how you want to create your TwiTok account.</p>

            <div style={styles.methodRow}>
              {(["phone", "email", "username"] as const).map(item => (
                <button type="button" key={item} onClick={() => { setMethod(item); setError(""); }} style={method === item ? styles.methodActive : styles.method}>
                  {item[0].toUpperCase() + item.slice(1)}
                </button>
              ))}
            </div>

            {method === "phone" ? (
              <div style={styles.phoneRow}>
                <CountryCodePicker value={countryCode} onChange={setCountryCode} />
                <input value={phone} onChange={event => setPhone(event.target.value.replace(/[^0-9+\s().-]/g, ""))} style={styles.input} placeholder="Phone number" type="tel" inputMode="tel" autoComplete="tel" autoFocus />
              </div>
            ) : method === "email" ? (
              <input value={email} onChange={event => setEmail(event.target.value)} style={styles.input} placeholder="Email address" type="email" autoCapitalize="none" autoComplete="email" autoFocus />
            ) : (
              <input value={username} onChange={event => setUsername(event.target.value.replace(/[^a-zA-Z0-9._]/g, "").toLowerCase().slice(0, 24))} style={styles.input} placeholder="Username" autoCapitalize="none" autoComplete="username" autoFocus />
            )}

            <p style={styles.privacy}>Phone or email verification is required before your account is completed.</p>
            {error ? <p role="alert" style={styles.error}>{error}</p> : null}

            <button type="submit" style={styles.continueButton}>Continue</button>

            <div style={styles.legal}>
              Continuing with an account located in {selectedCountry?.name ?? "your country"} means you agree to our <Link href="/terms" style={styles.link}>Terms of Service</Link> and acknowledge that you have read our <Link href="/privacy" style={styles.link}>Privacy Policy</Link>.
            </div>

            <div style={styles.helpRow}><Link href="/feedback" style={styles.link}>? Feedback and Help</Link></div>

            <p style={styles.bottom}>Already have an account? <Link href="/login" style={styles.link}>Sign in</Link></p>
          </>
        ) : step === "details" ? (
          <>
            <button type="button" onClick={() => setStep("contact")} style={styles.backButton}>← Back</button>
            <h1 style={styles.title}>Finish creating your account</h1>
            <p style={styles.muted}>{contact}</p>

            <label style={styles.label}>Password</label>
            <div style={styles.passwordWrap}>
              <input value={password} onChange={event => setPassword(event.target.value)} style={styles.passwordInput} placeholder="Password (minimum 8 characters)" type={showPassword ? "text" : "password"} minLength={8} required autoComplete="new-password" />
              <button type="button" onClick={() => setShowPassword(value => !value)} style={styles.eye}>{showPassword ? "Hide" : "Show"}</button>
            </div>

            <label style={styles.label}>Confirm password</label>
            <div style={styles.passwordWrap}>
              <input value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} style={styles.passwordInput} placeholder="Confirm password" type={showConfirmPassword ? "text" : "password"} minLength={8} required autoComplete="new-password" />
              <button type="button" onClick={() => setShowConfirmPassword(value => !value)} style={styles.eye}>{showConfirmPassword ? "Hide" : "Show"}</button>
            </div>

            <label style={styles.label}>Date of birth</label>
            <input value={dob} onChange={event => setDob(event.target.value)} style={styles.input} type="date" max={maxDob} required />

            {error ? <p role="alert" style={styles.error}>{error}</p> : null}

            <div className="kente-button-wrap">
              <button disabled={busy} className="auth-primary auth-signup-primary" style={{ ...styles.primary, opacity: busy ? 0.65 : 1 }}>
                {busy ? "Creating account…" : "Create account"}
              </button>
            </div>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setStep("details")} style={styles.backButton}>← Back</button>
            <h1 style={styles.title}>Enter code</h1>
            <p style={styles.muted}>Your code was sent to <strong style={{ color: "#fff" }}>{contact}</strong>.</p>
            <input value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} style={styles.codeInput} placeholder="000000" inputMode="numeric" autoComplete="one-time-code" autoFocus />
            {error ? <p role="alert" style={styles.error}>{error}</p> : null}
            <button disabled={busy} type="submit" style={styles.continueButton}>{busy ? "Verifying…" : "Verify contact"}</button>
            <p style={styles.resend}>Didn't get a code? <button type="button" disabled={busy} style={styles.linkButton} onClick={resendCode}>Resend code</button></p>
          </>
        )}
      </form>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#000", color: "#fff", display: "grid", placeItems: "center", padding: "24px 16px" },
  card: { width: "100%", maxWidth: 520, boxSizing: "border-box", background: "#111", border: "1px solid #292929", borderRadius: 24, padding: "30px 28px", boxShadow: "0 18px 60px rgba(0,0,0,.35)" },
  back: { color: "#25f4ee", textDecoration: "none", fontWeight: 800 },
  backButton: { border: 0, background: "transparent", color: "#aaa", padding: "8px 0", cursor: "pointer", fontSize: 15 },
  title: { fontSize: "clamp(30px, 7vw, 44px)", lineHeight: 1.05, margin: "18px 0 10px" },
  muted: { color: "#a1a1a1", lineHeight: 1.55, marginBottom: 20 },
  methodRow: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 },
  method: { border: "1px solid #383838", background: "#181818", color: "#aaa", padding: 13, borderRadius: 13, fontWeight: 800, cursor: "pointer" },
  methodActive: { border: "1px solid #fff", background: "#fff", color: "#000", padding: 13, borderRadius: 13, fontWeight: 900, cursor: "pointer" },
  phoneRow: { display: "grid", gridTemplateColumns: "132px 1fr", gap: 8 },
  input: { width: "100%", boxSizing: "border-box", padding: "15px 16px", borderRadius: 14, border: "1px solid #383838", background: "#181818", color: "#fff", outline: "none", fontSize: 16 },
  label: { display: "block", margin: "14px 0 7px", color: "#d8d8d8", fontWeight: 700, fontSize: 14 },
  passwordWrap: { display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", padding: 4, borderRadius: 14, border: "1px solid #383838", background: "#181818" },
  passwordInput: { width: "100%", boxSizing: "border-box", padding: "11px 12px", border: 0, outline: "none", background: "transparent", color: "#fff", fontSize: 16 },
  eye: { border: 0, background: "transparent", color: "#25f4ee", fontWeight: 800, padding: "10px 12px", cursor: "pointer" },
  privacy: { color: "#777", fontSize: 13, lineHeight: 1.45, marginTop: 12 },
  error: { color: "#ff7184", background: "rgba(254,44,85,.08)", border: "1px solid rgba(254,44,85,.25)", padding: 12, borderRadius: 12, fontSize: 13, lineHeight: 1.4 },
  continueButton: { width: "100%", marginTop: 18, padding: "15px", border: 0, borderRadius: 999, background: "#25f4ee", color: "#000", fontWeight: 900, fontSize: 17, cursor: "pointer" },
  primary: { width: "100%", padding: "16px 15px", border: 0, borderRadius: 14, background: "#25f4ee", color: "#000", fontWeight: 900, fontSize: 17, cursor: "pointer" },
  bottom: { textAlign: "center", color: "#999", marginTop: 20 },
  link: { color: "#25f4ee", fontWeight: 900 },
  codeInput: { width: "100%", boxSizing: "border-box", padding: "18px 14px", borderRadius: 14, border: "1px solid #383838", background: "#181818", color: "#fff", outline: "none", fontSize: 30, letterSpacing: 8, textAlign: "center" },
  resend: { color: "#999", textAlign: "center", marginTop: 18 },
  linkButton: { border: 0, background: "transparent", color: "#25f4ee", fontWeight: 800, cursor: "pointer", padding: 0 },
  legal: { color: "#777", fontSize: 12, lineHeight: 1.55, textAlign: "center", marginTop: 18 },
  helpRow: { textAlign: "center", marginTop: 16 }
};