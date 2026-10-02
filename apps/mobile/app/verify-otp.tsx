import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

export default function VerifyOtpScreen() {
  const params = useLocalSearchParams<{ channel?: string }>();
  const channel = params.channel === "phone" ? "phone" : "email";
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(60);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setInterval(() => setSeconds(value => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [seconds]);

  async function verify() {
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit verification code.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Your session has expired. Please sign in again.");
      const response = await fetch(API + "/auth/verification/verify", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ channel, code })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Unable to verify code");
      router.replace("/profile-setup");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to verify code");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (seconds > 0 || resending) return;
    setResending(true);
    setError("");
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Your session has expired. Please sign in again.");
      const response = await fetch(API + "/auth/verification/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ channel })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Unable to resend code");
      setCode("");
      setSeconds(Number(data.retryAfterSeconds ?? 60));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to resend code");
    } finally {
      setResending(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>TwiTok</Text>
      <Text style={styles.title}>Verify your {channel}</Text>
      <Text style={styles.subtitle}>Enter the 6-digit code we sent to your {channel}.</Text>
      <TextInput
        value={code}
        onChangeText={value => { setCode(value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
        placeholder="000000"
        placeholderTextColor="#666"
        style={styles.code}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.button} onPress={verify} disabled={busy}>
        {busy ? <ActivityIndicator color="#111" /> : <Text style={styles.buttonText}>Verify</Text>}
      </Pressable>
      <Pressable onPress={resend} disabled={seconds > 0 || resending}>
        <Text style={[styles.resend, seconds > 0 && styles.disabled]}>
          {resending ? "Sending..." : seconds > 0 ? `Resend code in ${seconds}s` : "Resend code"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", padding: 24, justifyContent: "center" },
  logo: { color: "#F7C842", fontSize: 42, fontWeight: "900", textAlign: "center", marginBottom: 24 },
  title: { color: "#fff", fontSize: 28, fontWeight: "900", textAlign: "center" },
  subtitle: { color: "#999", fontSize: 15, lineHeight: 21, textAlign: "center", marginTop: 10, marginBottom: 28 },
  code: { backgroundColor: "#171717", borderWidth: 1, borderColor: "#333", borderRadius: 14, color: "#fff", fontSize: 28, fontWeight: "800", letterSpacing: 8, textAlign: "center", paddingVertical: 16 },
  button: { backgroundColor: "#F7C842", borderRadius: 12, padding: 15, alignItems: "center", marginTop: 16 },
  buttonText: { color: "#111", fontWeight: "900", fontSize: 16 },
  resend: { color: "#F7C842", textAlign: "center", marginTop: 22, fontWeight: "700" },
  disabled: { color: "#666" },
  error: { color: "#ff7188", textAlign: "center", marginTop: 12 }
});
