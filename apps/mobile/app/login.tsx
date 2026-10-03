import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { saveAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

type LoginMode = "methods" | "credentials";

export default function LoginScreen() {
  const [mode, setMode] = useState<LoginMode>("methods");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function login() {
    if (!identifier.trim() || !password) {
      setError("Enter your email or phone number and password.");
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
      if (!response.ok || !data.token) {
        throw new Error(data.error ?? "Unable to sign in");
      }

      await saveAuthToken(data.token);

      if (data.verificationRequired) {
        router.replace({
          pathname: "/verify-otp",
          params: {
            channel: data.channel === "phone" ? "phone" : "email",
            retryAfterSeconds: String(Number(data.retryAfterSeconds ?? 60) || 60)
          }
        });
        return;
      }

      router.replace(
        data.profileSetupRequired || data.user?.profileSetupComplete === false
          ? "/profile-setup"
          : "/feed"
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }

  function unavailable(provider: string) {
    setError(provider + " sign-in is not connected yet.");
  }

  if (mode === "credentials") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.credentialScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.topBar}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                hitSlop={12}
                onPress={() => {
                  setError("");
                  setMode("methods");
                }}
                style={styles.iconButton}
              >
                <Ionicons name="chevron-back" size={28} color="#111" />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Help"
                hitSlop={12}
                onPress={() => setError("Use your TwiTok email address or phone number to sign in.")}
                style={styles.helpButton}
              >
                <Ionicons name="help-outline" size={23} color="#111" />
              </Pressable>
            </View>

            <View style={styles.credentialHeader}>
              <Image
                source={require("../assets/twitok-logo.jpg")}
                style={styles.loginLogo}
                resizeMode="cover"
                accessibilityLabel="TwiTok"
              />
              <Text style={styles.title}>Log in to TwiTok</Text>
              <Text style={styles.subtitle}>
                Use your phone number or email address.
              </Text>
            </View>

            <View style={styles.form}>
              <View style={styles.inputShell}>
                <Ionicons name="person-outline" size={21} color="#777" />
                <TextInput
                  value={identifier}
                  onChangeText={(value) => {
                    setIdentifier(value);
                    if (error) setError("");
                  }}
                  placeholder="Phone number or email"
                  placeholderTextColor="#8A8A8A"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  style={styles.input}
                  autoFocus
                  returnKeyType="next"
                />
              </View>

              <View style={styles.inputShell}>
                <Ionicons name="lock-closed-outline" size={21} color="#777" />
                <TextInput
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    if (error) setError("");
                  }}
                  placeholder="Password"
                  placeholderTextColor="#8A8A8A"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                  returnKeyType="done"
                  onSubmitEditing={login}
                />
              </View>

              <Pressable
                onPress={() => router.push("/forgot-password")}
                style={styles.forgotWrap}
              >
                <Text style={styles.forgot}>Forgot password?</Text>
              </Pressable>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                onPress={login}
                disabled={busy}
                style={({ pressed }) => [
                  styles.primaryButton,
                  busy && styles.disabled,
                  pressed && !busy && styles.pressed
                ]}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>Log in</Text>
                )}
              </Pressable>
            </View>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.or}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              style={styles.methodButton}
              onPress={() => setMode("credentials")}
            >
              <Ionicons name="person-circle-outline" size={25} color="#111" />
              <Text style={styles.methodText}>Use another account</Text>
            </Pressable>

            <Text style={styles.legal}>
              By continuing with an account located in Africa, you agree to our{" "}
              <Text style={styles.link}>Terms of Service</Text> and acknowledge that
              you have read our <Text style={styles.link}>Privacy Policy</Text>.
            </Text>
          </ScrollView>

          <View style={styles.bottomBar}>
            <Text style={styles.bottomPrompt}>Don't have an account?</Text>
            <Pressable onPress={() => router.replace("/register")}>
              <Text style={styles.bottomAction}>Sign up</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.methodsScroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
            onPress={() => router.replace("/")}
            style={styles.iconButton}
          >
            <Ionicons name="close" size={30} color="#111" />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Help"
            hitSlop={12}
            onPress={() => setError("Choose a sign-in method to continue.")}
            style={styles.helpButton}
          >
            <Ionicons name="help-outline" size={23} color="#111" />
          </Pressable>
        </View>

        <View style={styles.methodsHeader}>
          <Image
            source={require("../assets/twitok-logo.jpg")}
            style={styles.loginLogo}
            resizeMode="cover"
            accessibilityLabel="TwiTok"
          />
          <Text style={styles.title}>Log in to TwiTok</Text>
          <Text style={styles.subtitle}>Welcome back.</Text>
        </View>

        <View style={styles.methodList}>
          <Pressable
            style={({ pressed }) => [styles.methodButtonLarge, pressed && styles.pressed]}
            onPress={() => {
              setError("");
              setMode("credentials");
            }}
          >
            <View style={styles.leadingIcon}>
              <Ionicons name="person-outline" size={25} color="#111" />
            </View>
            <Text style={styles.methodTextLarge}>Use phone or email</Text>
            <Ionicons name="chevron-forward" size={20} color="#777" />
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.methodButtonLarge, pressed && styles.pressed]}
            onPress={() => unavailable("Facebook")}
          >
            <View style={styles.leadingIcon}>
              <Ionicons name="logo-facebook" size={25} color="#1877F2" />
            </View>
            <Text style={styles.methodTextLarge}>Continue with Facebook</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.methodButtonLarge, pressed && styles.pressed]}
            onPress={() => unavailable("Apple")}
          >
            <View style={styles.leadingIcon}>
              <Ionicons name="logo-apple" size={25} color="#111" />
            </View>
            <Text style={styles.methodTextLarge}>Continue with Apple</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.methodButtonLarge, pressed && styles.pressed]}
            onPress={() => unavailable("Google")}
          >
            <View style={styles.leadingIcon}>
              <Ionicons name="logo-google" size={25} color="#4285F4" />
            </View>
            <Text style={styles.methodTextLarge}>Continue with Google</Text>
          </Pressable>
        </View>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.or}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable
          style={({ pressed }) => [styles.methodButtonLarge, pressed && styles.pressed]}
          onPress={() => {
            setError("");
            setMode("credentials");
          }}
        >
          <View style={styles.leadingIcon}>
            <Ionicons name="people-outline" size={25} color="#111" />
          </View>
          <Text style={styles.methodTextLarge}>Select account to log in</Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.legal}>
          By continuing with an account located in Africa, you agree to our{" "}
          <Text style={styles.link}>Terms of Service</Text> and acknowledge that
          you have read our <Text style={styles.link}>Privacy Policy</Text>.
        </Text>
      </ScrollView>

      <View style={styles.bottomBar}>
        <Text style={styles.bottomPrompt}>Don't have an account?</Text>
        <Pressable onPress={() => router.replace("/register")}>
          <Text style={styles.bottomAction}>Sign up</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F5F5F5"
  },
  flex: {
    flex: 1
  },
  methodsScroll: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 26
  },
  credentialScroll: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 26
  },
  topBar: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "flex-start",
    justifyContent: "center"
  },
  helpButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#111"
  },
  methodsHeader: {
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 42,
    paddingBottom: 42
  },
  credentialHeader: {
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 35,
    paddingBottom: 30
  },
  loginLogo: {
    width: 64,
    height: 64,
    borderRadius: 14,
    marginBottom: 10
  },
  title: {
    color: "#111",
    fontSize: 30,
    lineHeight: 35,
    fontWeight: "700",
    fontFamily: "TikTokSansBold",
    letterSpacing: -1.1,
    textAlign: "center"
  },
  subtitle: {
    color: "#737373",
    fontSize: 14,
    lineHeight: 19,
    marginTop: 7,
    fontFamily: "TikTokSans",
    textAlign: "center"
  },
  methodList: {
    gap: 12
  },
  methodButtonLarge: {
    minHeight: 68,
    borderRadius: 14,
    backgroundColor: "#EDEDED",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    gap: 12
  },
  leadingIcon: {
    width: 32,
    alignItems: "center",
    justifyContent: "center"
  },
  methodTextLarge: {
    flex: 1,
    color: "#111",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    fontFamily: "TikTokSansBold"
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 26
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#D4D4D4"
  },
  or: {
    color: "#7A7A7A",
    fontSize: 16,
    paddingHorizontal: 15,
    fontFamily: "TikTokSans"
  },
  form: {
    gap: 12
  },
  inputShell: {
    minHeight: 58,
    borderRadius: 12,
    backgroundColor: "#EFEFEF",
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 11
  },
  input: {
    flex: 1,
    color: "#111",
    fontSize: 15,
    paddingVertical: 0,
    fontFamily: "TikTokSans"
  },
  forgotWrap: {
    alignSelf: "flex-start",
    paddingVertical: 4
  },
  forgot: {
    color: "#222",
    fontSize: 13,
    fontWeight: "700",
    fontFamily: "TikTokSansBold"
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 28,
    backgroundColor: "#FE2C55",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6
  },
  primaryText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "TikTokSansBold"
  },
  methodButton: {
    minHeight: 58,
    borderRadius: 12,
    backgroundColor: "#EDEDED",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10
  },
  methodText: {
    color: "#111",
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "TikTokSansBold"
  },
  legal: {
    color: "#818181",
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "TikTokSans",
    textAlign: "center",
    paddingHorizontal: 10,
    marginTop: 28
  },
  link: {
    color: "#2E63C7",
    fontWeight: "600"
  },
  bottomBar: {
    minHeight: 72,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#EBEBEB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 20
  },
  bottomPrompt: {
    color: "#858585",
    fontSize: 15,
    fontWeight: "400",
    fontFamily: "TikTokSans"
  },
  bottomAction: {
    color: "#FE2C55",
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "TikTokSansBold"
  },
  error: {
    color: "#C62845",
    textAlign: "center",
    marginTop: 12,
    paddingHorizontal: 8,
    fontSize: 13,
    lineHeight: 19
  },
  disabled: {
    opacity: 0.6
  },
  pressed: {
    opacity: 0.78
  }
});
