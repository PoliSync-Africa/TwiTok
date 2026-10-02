import { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { saveAuthToken } from "../lib/auth";
import { COUNTRIES, CountryOption } from "../lib/countries";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

type SignupMethod = "phone" | "email";

function isValidDob(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const dob = new Date(value + "T00:00:00Z");
  if (Number.isNaN(dob.getTime()) || dob >= new Date()) return false;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const month = now.getUTCMonth() - dob.getUTCMonth();
  if (month < 0 || (month === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age >= 13;
}

export default function RegisterScreen() {
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<SignupMethod | null>(null);
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<CountryOption | null>(null);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const filteredCountries = useMemo(() => {
    const query = countrySearch.trim().toLowerCase();
    if (!query) return COUNTRIES;
    return COUNTRIES.filter(item => item.name.toLowerCase().includes(query) || item.code.toLowerCase() === query);
  }, [countrySearch]);

  function next() {
    setError("");
    if (step === 0) {
      if (!firstName.trim()) {
        setError("Enter your first name.");
        return;
      }
      if (firstName.trim().length > 50) {
        setError("First name must be 50 characters or less.");
        return;
      }
      if (!method) {
        setError("Choose how you want to sign up.");
        return;
      }
      setStep(1);
      return;
    }
    if (step === 1) {
      if (!country) {
        setError("Select your country.");
        return;
      }
      if (method === "email") {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
          setError("Enter a valid email address.");
          return;
        }
      } else if (phone.replace(/\D/g, "").length < 7) {
        setError("Enter a valid phone number.");
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!isValidDob(dateOfBirth.trim())) {
        setError("Enter a valid date of birth in YYYY-MM-DD format. You must be at least 13.");
        return;
      }
      setStep(3);
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
    register();
  }

  function back() {
    setError("");
    if (step === 0) {
      router.replace("/");
      return;
    }
    setStep(step - 1);
  }

  async function register() {
    if (!method || !country) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(API + "/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          email: method === "email" ? email.trim().toLowerCase() : undefined,
          phone: method === "phone" ? phone.trim() : undefined,
          password,
          dateOfBirth: dateOfBirth.trim(),
          countryCode: country.code
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token) throw new Error(data.error ?? "Unable to create account");
      await saveAuthToken(data.token);
      const verification = await fetch(API + "/auth/verification/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${data.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ channel: method })
      });
      const verificationData = await verification.json().catch(() => ({}));
      if (!verification.ok) throw new Error(verificationData.error ?? "Unable to send verification code");
      router.replace({ pathname: "/verify-otp", params: { channel: method } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create account");
    } finally {
      setBusy(false);
    }
  }

  const titles = ["Create your account", method === "phone" ? "Enter your phone" : "Enter your email", "Your birthday", "Create a password"];
  const subtitles = [
    "Enter your first name, then choose how you want to sign up.",
    "Choose your country first. TwiTok never assumes a default country.",
    "Your date of birth helps us apply age and safety requirements.",
    "Use a password with at least 8 characters."
  ];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={back} style={styles.backButton}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <Text style={styles.logo}>TwiTok</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${((step + 1) / 4) * 100}%` }]} />
        </View>
        <Text style={styles.stepText}>Step {step + 1} of 4</Text>

        <Text style={styles.title}>{titles[step]}</Text>
        <Text style={styles.subtitle}>{subtitles[step]}</Text>

        {step === 0 ? (
          <View>
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First name"
              placeholderTextColor="#777"
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={50}
              autoFocus
            />
            <Pressable accessibilityRole="button" accessibilityState={{ selected: method === "phone" }} style={[styles.methodCard, method === "phone" && styles.methodCardActive]} onPress={() => { setMethod("phone"); setError(""); }}>
              <View style={styles.methodIcon}><Text style={styles.methodIconText}>☎</Text></View>
              <View style={styles.methodCopy}><Text style={styles.methodTitle}>Use phone</Text><Text style={styles.methodHint}>Sign up with your mobile number</Text></View>
              <Text style={styles.radio}>{method === "phone" ? "●" : "○"}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: method === "email" }} style={[styles.methodCard, method === "email" && styles.methodCardActive]} onPress={() => { setMethod("email"); setError(""); }}>
              <View style={styles.methodIcon}><Text style={styles.methodIconText}>@</Text></View>
              <View style={styles.methodCopy}><Text style={styles.methodTitle}>Use email</Text><Text style={styles.methodHint}>Sign up with your email address</Text></View>
              <Text style={styles.radio}>{method === "email" ? "●" : "○"}</Text>
            </Pressable>
            <Text style={styles.helper}>You can add or change account details later in Settings.</Text>
          </View>
        ) : null}

        {step === 1 ? (
          <View>
            <Pressable style={styles.countryButton} onPress={() => { setCountryOpen(true); setCountrySearch(""); setError(""); }}>
              <View style={styles.countryButtonMain}>
                <Text style={styles.countryLabel}>Country</Text>
                <Text style={[styles.countryValue, !country && styles.countryPlaceholder]}>
                  {country ? `🌍 ${country.name}` : "Select your country"}
                </Text>
              </View>
              <Text style={styles.chevron}>⌄</Text>
            </Pressable>
            <TextInput
              style={styles.input}
              value={method === "phone" ? phone : email}
              onChangeText={method === "phone" ? setPhone : setEmail}
              placeholder={method === "phone" ? "Phone number" : "Email address"}
              placeholderTextColor="#777"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={method === "phone" ? "phone-pad" : "email-address"}
              autoFocus
            />
            <Text style={styles.helper}>Your country is used for regional account and safety features. It is never preselected.</Text>
          </View>
        ) : null}

        {step === 2 ? (
          <View>
            <TextInput
              style={styles.input}
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#777"
              keyboardType="numbers-and-punctuation"
              autoFocus
              maxLength={10}
            />
            <Text style={styles.helper}>You must meet TwiTok's minimum age requirement to create an account.</Text>
          </View>
        ) : null}

        {step === 3 ? (
          <View>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor="#777"
              secureTextEntry
              autoFocus
            />
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm password"
              placeholderTextColor="#777"
              secureTextEntry
            />
            <Text style={styles.helper}>At least 8 characters. After registration, you will set your profile photo, nickname, username and privacy settings.</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={[styles.button, (!method && step === 0) && styles.buttonDisabled]} onPress={next} disabled={busy}>
          {busy ? <ActivityIndicator color="#111" /> : <Text style={styles.buttonText}>{step === 3 ? "Create account" : "Continue"}</Text>}
        </Pressable>

        <Pressable onPress={() => router.replace("/login")}>
          <Text style={styles.signIn}>Already have an account? <Text style={styles.signInStrong}>Log in</Text></Text>
        </Pressable>
      </ScrollView>

      <Modal visible={countryOpen} transparent animationType="slide" onRequestClose={() => setCountryOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select your country</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close country selector" onPress={() => setCountryOpen(false)}>
                <Text style={styles.close}>✕</Text>
              </Pressable>
            </View>
            <TextInput value={countrySearch} onChangeText={setCountrySearch} placeholder="Search country or code" placeholderTextColor="#777" autoCapitalize="none" style={styles.search} autoFocus />
            <ScrollView keyboardShouldPersistTaps="handled">
              {filteredCountries.map(item => (
                <Pressable key={item.code} style={styles.countryRow} onPress={() => { setCountry(item); setCountryOpen(false); }}>
                  <Text style={styles.countryName}>{item.name}</Text>
                  <Text style={styles.countryCode}>{item.code}</Text>
                </Pressable>
              ))}
              {filteredCountries.length === 0 ? <Text style={styles.noResults}>No country found</Text> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  container: { flexGrow: 1, backgroundColor: "#000", padding: 24, paddingTop: 42, paddingBottom: 32 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  backButton: { width: 40, height: 40, alignItems: "flex-start", justifyContent: "center" },
  backIcon: { color: "#fff", fontSize: 36, lineHeight: 40, fontWeight: "300" },
  logo: { color: "#fff", fontSize: 28, fontWeight: "900" },
  headerSpacer: { width: 40 },
  progressTrack: { height: 4, backgroundColor: "#262626", borderRadius: 4, overflow: "hidden", marginBottom: 8 },
  progressFill: { height: 4, backgroundColor: "#F7C842", borderRadius: 4 },
  stepText: { color: "#777", fontSize: 12, marginBottom: 30 },
  title: { color: "#fff", fontSize: 28, fontWeight: "900", marginBottom: 8 },
  subtitle: { color: "#999", fontSize: 14, lineHeight: 20, marginBottom: 24 },
  methodCard: { backgroundColor: "#171717", borderWidth: 1, borderColor: "#2d2d2d", borderRadius: 14, minHeight: 76, padding: 14, flexDirection: "row", alignItems: "center", marginBottom: 12 },
  methodCardActive: { borderColor: "#F7C842", backgroundColor: "#1d1a0d" },
  methodIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#242424", alignItems: "center", justifyContent: "center", marginRight: 12 },
  methodIconText: { color: "#F7C842", fontSize: 18, fontWeight: "900" },
  methodCopy: { flex: 1 },
  methodTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  methodHint: { color: "#888", fontSize: 13, marginTop: 3 },
  radio: { color: "#F7C842", fontSize: 21, fontWeight: "900" },
  input: { backgroundColor: "#171717", borderWidth: 1, borderColor: "#2d2d2d", borderRadius: 12, color: "#fff", paddingHorizontal: 16, paddingVertical: 15, marginBottom: 12, fontSize: 16 },
  countryButton: { backgroundColor: "#171717", borderWidth: 1, borderColor: "#2d2d2d", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  countryButtonMain: { flex: 1 },
  countryLabel: { color: "#777", fontSize: 11, marginBottom: 3 },
  countryValue: { color: "#fff", fontSize: 16, fontWeight: "600" },
  countryPlaceholder: { color: "#999", fontWeight: "500" },
  chevron: { color: "#F7C842", fontSize: 24 },
  helper: { color: "#777", fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 8 },
  button: { backgroundColor: "#F7C842", borderRadius: 12, padding: 15, alignItems: "center", marginTop: 16 },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: "#111", fontWeight: "900", fontSize: 16 },
  signIn: { color: "#999", textAlign: "center", marginTop: 20, fontSize: 14 },
  signInStrong: { color: "#F7C842", fontWeight: "800" },
  error: { color: "#ff7188", textAlign: "center", marginTop: 6 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.72)", justifyContent: "flex-end" },
  modal: { height: "82%", backgroundColor: "#101010", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  modalTitle: { color: "#fff", fontSize: 21, fontWeight: "900" },
  close: { color: "#fff", fontSize: 20 },
  search: { backgroundColor: "#1A1A1A", borderWidth: 1, borderColor: "#303030", borderRadius: 12, color: "#fff", paddingHorizontal: 14, paddingVertical: 13, marginBottom: 10, fontSize: 16 },
  countryRow: { minHeight: 50, borderBottomWidth: 1, borderBottomColor: "#202020", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  countryName: { color: "#fff", fontSize: 15 },
  countryCode: { color: "#999", fontSize: 13, fontWeight: "700" },
  noResults: { color: "#888", textAlign: "center", padding: 30 }
});
