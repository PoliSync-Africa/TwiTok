import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { saveAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

export default function LoginScreen() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function login() {
    if (!identifier.trim() || !password) {
      setError("Enter your username or email and password.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(API + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), password })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token) throw new Error(data.error ?? "Unable to sign in");
      await saveAuthToken(data.token);
      if (data.verificationRequired) { router.replace({ pathname: "/verify-otp", params: { channel: data.channel === "phone" ? "phone" : "email" } }); return; }
      router.replace("/feed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>TwiTok</Text>
      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.subtitle}>Sign in to your TwiTok account</Text>
      <TextInput value={identifier} onChangeText={setIdentifier} placeholder="Username or email" placeholderTextColor="#777" autoCapitalize="none" style={styles.input} />
      <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor="#777" secureTextEntry style={styles.input} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.button} onPress={login} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
      </Pressable>
      <Pressable onPress={() => router.back()}><Text style={styles.back}>Back</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", padding: 24, justifyContent: "center" },
  logo: { color: "#fff", fontSize: 42, fontWeight: "900", textAlign: "center", marginBottom: 32 },
  title: { color: "#fff", fontSize: 26, fontWeight: "800", textAlign: "center" },
  subtitle: { color: "#999", textAlign: "center", marginTop: 8, marginBottom: 28 },
  input: { backgroundColor: "#171717", borderWidth: 1, borderColor: "#2d2d2d", borderRadius: 12, color: "#fff", paddingHorizontal: 16, paddingVertical: 14, marginBottom: 12, fontSize: 16 },
  button: { backgroundColor: "#ff2d55", borderRadius: 12, padding: 15, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  error: { color: "#ff7188", marginBottom: 8, textAlign: "center" },
  back: { color: "#aaa", textAlign: "center", marginTop: 20, fontSize: 15 }
});
