import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

type Channel = "email" | "phone";

export default function ForgotPasswordScreen() {
  const [identifier, setIdentifier] = useState("");
  const [channel, setChannel] = useState<Channel>("email");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState<"request" | "reset">("request");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function requestCode() {
    const value = identifier.trim();
    if (!value) {
      setError("Enter your username, email or phone number.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(API + "/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: value, channel })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Unable to request a recovery code");
      setMessage(data.message ?? "If the account exists, a recovery code has been sent to its verified contact.");
      setStep("reset");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to request a recovery code");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit recovery code.");
      return;
    }
    if (newPassword.length < 12) {
      setError("Your new password must contain at least 12 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(API + "/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: identifier.trim(),
          channel,
          code: code.trim(),
          newPassword
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Unable to reset your password");
      setMessage("Password reset successfully. You can now sign in with your new password.");
      setCode("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => router.replace("/login"), 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to reset your password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>TwiTok</Text>
      <Text style={styles.title}>Reset your password</Text>
      <Text style={styles.subtitle}>
        {step === "request"
          ? "We'll send a recovery code to your verified contact."
          : "Enter the code you received and choose a new password."}
      </Text>

      <TextInput
        value={identifier}
        onChangeText={setIdentifier}
        placeholder="Username, email or phone"
        placeholderTextColor="#777"
        autoCapitalize="none"
        autoCorrect={false}
        editable={step === "request"}
        style={[styles.input, step !== "request" && styles.disabledInput]}
      />

      {step === "request" ? (
        <>
          <Text style={styles.label}>Send recovery code by</Text>
          <View style={styles.channelRow}>
            {(["email", "phone"] as Channel[]).map((item) => (
              <Pressable
                key={item}
                onPress={() => setChannel(item)}
                style={[styles.channel, channel === item && styles.channelActive]}
              >
                <Text style={[styles.channelText, channel === item && styles.channelTextActive]}>
                  {item === "email" ? "Email" : "Phone"}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.button} onPress={requestCode} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send recovery code</Text>}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.label}>Recovery code</Text>
          <TextInput
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit code"
            placeholderTextColor="#777"
            keyboardType="number-pad"
            maxLength={6}
            style={styles.input}
          />
          <TextInput
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="New password (12+ characters)"
            placeholderTextColor="#777"
            secureTextEntry
            style={styles.input}
          />
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm new password"
            placeholderTextColor="#777"
            secureTextEntry
            style={styles.input}
          />
          <Pressable style={styles.button} onPress={resetPassword} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Reset password</Text>}
          </Pressable>
          <Pressable onPress={() => { setStep("request"); setError(""); setMessage(""); }}>
            <Text style={styles.secondary}>Choose another delivery method</Text>
          </Pressable>
        </>
      )}

      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable onPress={() => router.replace("/login")}>
        <Text style={styles.back}>Back to sign in</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", padding: 24, justifyContent: "center" },
  logo: { color: "#fff", fontSize: 42, fontWeight: "900", textAlign: "center", marginBottom: 28 },
  title: { color: "#fff", fontSize: 26, fontWeight: "800", textAlign: "center" },
  subtitle: { color: "#999", textAlign: "center", marginTop: 8, marginBottom: 24, lineHeight: 20 },
  label: { color: "#bbb", fontSize: 13, fontWeight: "700", marginBottom: 8, marginTop: 4 },
  input: { backgroundColor: "#171717", borderWidth: 1, borderColor: "#2d2d2d", borderRadius: 12, color: "#fff", paddingHorizontal: 16, paddingVertical: 14, marginBottom: 12, fontSize: 16 },
  disabledInput: { opacity: 0.65 },
  channelRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  channel: { flex: 1, borderWidth: 1, borderColor: "#333", borderRadius: 12, padding: 13, alignItems: "center", backgroundColor: "#111" },
  channelActive: { borderColor: "#ff2d55", backgroundColor: "#241018" },
  channelText: { color: "#aaa", fontWeight: "700" },
  channelTextActive: { color: "#fff" },
  button: { backgroundColor: "#ff2d55", borderRadius: 12, padding: 15, alignItems: "center", marginTop: 4 },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  secondary: { color: "#bbb", textAlign: "center", marginTop: 18, fontSize: 14 },
  success: { color: "#78e08f", textAlign: "center", marginTop: 14, lineHeight: 20 },
  error: { color: "#ff7188", textAlign: "center", marginTop: 14, lineHeight: 20 },
  back: { color: "#aaa", textAlign: "center", marginTop: 22, fontSize: 15 }
});
