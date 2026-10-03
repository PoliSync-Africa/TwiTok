import { useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Typography, Colors } from "../theme/typography";
import { saveAuthToken } from "../lib/auth";
import { DEFAULT_COUNTRY, type Country } from "../lib/countries";
import { CountryPicker } from "../components/CountryPicker";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
type LoginMethod = "phone" | "email" | "username";

export default function LoginScreen() {
  const [method, setMethod] = useState<LoginMethod>("phone");
  const [identifier, setIdentifier] = useState("");
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function selectMethod(next: LoginMethod) {
    setMethod(next);
    setIdentifier("");
    setError("");
  }

  async function login() {
    const value = identifier.trim();
    if (!value || !password) {
      setError("Enter your login information and password.");
      return;
    }
    if (method === "email" && !/^\S+@\S+\.\S+$/.test(value)) {
      setError("Enter a valid email address.");
      return;
    }
    if (method === "username" && !/^[a-z0-9._]{3,24}$/i.test(value)) {
      setError("Enter a valid username.");
      return;
    }
    if (method === "phone" && value.replace(/\D/g, "").length < 7) {
      setError("Enter a valid phone number.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch(API + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: value, password, countryCode: country.iso })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token) throw new Error(data.error ?? "Unable to log in");
      await saveAuthToken(data.token);
      router.replace(data.verificationRequired ? "/verify-account" : data.user?.profileSetupComplete === false ? "/profile-setup" : "/feed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to log in");
    } finally {
      setBusy(false);
    }
  }

  const placeholder = method === "phone" ? "Phone number" : method === "email" ? "Email address" : "Username";

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Pressable style={styles.close} onPress={() => router.back()} accessibilityLabel="Close login">
          <Text style={styles.closeText}>×</Text>
        </Pressable>
        <Image source={require("../assets/images/twitok-logo.png")} style={styles.logo} resizeMode="contain" accessibilityLabel="TwiTok official logo" />
        <Text style={styles.title}>Log in to TwiTok</Text>
        <Text style={styles.subtitle}>Use your phone, email, or username to continue.</Text>

        <View style={styles.methodRow}>
          {(["phone", "email", "username"] as LoginMethod[]).map(item => (
            <Pressable key={item} onPress={() => selectMethod(item)} style={[styles.method, method === item && styles.methodActive]} accessibilityRole="tab" accessibilityState={{ selected: method === item }}>
              <Text style={[styles.methodText, method === item && styles.methodTextActive]}>
                {item === "phone" ? "Phone" : item === "email" ? "Email" : "Username"}
              </Text>
            </Pressable>
          ))}
        </View>

        {method === "phone" ? (
          <View style={styles.phoneRow}>
            <CountryPicker value={country} onChange={setCountry} />
            <TextInput value={identifier} onChangeText={setIdentifier} placeholder={placeholder} placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" autoComplete="tel" style={styles.identifierInput} accessibilityLabel="Phone number" />
          </View>
        ) : (
          <TextInput value={identifier} onChangeText={setIdentifier} placeholder={placeholder} placeholderTextColor={Colors.textMuted} autoCapitalize="none" autoCorrect={false} keyboardType={method === "email" ? "email-address" : "default"} autoComplete={method === "email" ? "email" : "username"} style={styles.input} accessibilityLabel={placeholder} />
        )}

        <View style={styles.passwordRow}>
          <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={Colors.textMuted} secureTextEntry={!showPassword} autoCapitalize="none" autoComplete="password" style={styles.passwordInput} accessibilityLabel="Password" />
          <Pressable onPress={() => setShowPassword(value => !value)} style={styles.showButton} accessibilityRole="button">
            <Text style={styles.showText}>{showPassword ? "Hide" : "Show"}</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={login} disabled={busy} accessibilityRole="button">
          {busy ? <ActivityIndicator color={Colors.text} /> : <Text style={styles.buttonText}>Log in</Text>}
        </Pressable>

        <Text style={styles.legal}>By continuing, you agree to TwiTok's Terms of Service and acknowledge the Privacy Policy.</Text>

        <View style={styles.signupRow}>
          <Text style={styles.signupPrompt}>Don't have an account?</Text>
          <Pressable onPress={() => router.replace("/register")}>
            <Text style={styles.signupLink}> Sign up</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  container: { flexGrow: 1, backgroundColor: Colors.background, paddingHorizontal: 24, paddingTop: 58, paddingBottom: 36, justifyContent: "center" },
  close: { position: "absolute", top: 18, left: 18, width: 40, height: 40, alignItems: "center", justifyContent: "center", zIndex: 2 },
  closeText: { color: Colors.text, fontSize: 32, lineHeight: 34, fontWeight: "300" },
  logo: { width: 86, height: 86, alignSelf: "center", marginBottom: 18 },
  title: { color: Colors.text, ...Typography.title, textAlign: "center" },
  subtitle: { color: Colors.textSecondary, ...Typography.caption, textAlign: "center", marginTop: 8, marginBottom: 22 },
  methodRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: 16 },
  method: { flex: 1, alignItems: "center", paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  methodActive: { borderBottomColor: Colors.text },
  methodText: { color: Colors.textMuted, ...Typography.label },
  methodTextActive: { color: Colors.text },
  phoneRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  identifierInput: { flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, color: Colors.text, paddingHorizontal: 14, paddingVertical: 14, ...Typography.body },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, color: Colors.text, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 12, ...Typography.body },
  passwordRow: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, marginBottom: 12 },
  passwordInput: { flex: 1, color: Colors.text, paddingHorizontal: 14, paddingVertical: 14, ...Typography.body },
  showButton: { paddingHorizontal: 14, paddingVertical: 12 },
  showText: { color: Colors.textSecondary, ...Typography.label },
  error: { color: Colors.danger, ...Typography.caption, textAlign: "center", marginBottom: 10 },
  button: { backgroundColor: Colors.accent, borderRadius: 10, minHeight: 48, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", marginTop: 2 },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: Colors.text, ...Typography.button },
  legal: { color: Colors.textMuted, ...Typography.caption, textAlign: "center", marginTop: 18, lineHeight: 18 },
  signupRow: { flexDirection: "row", justifyContent: "center", marginTop: 28 },
  signupPrompt: { color: Colors.textSecondary, ...Typography.caption },
  signupLink: { color: Colors.text, ...Typography.captionMedium }
});
