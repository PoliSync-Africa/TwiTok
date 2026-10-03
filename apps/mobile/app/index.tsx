import { useEffect, useRef } from "react";
import { Animated, Image, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Typography, Colors } from "../theme/typography";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

export default function SplashScreen() {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    Animated.timing(progress, { toValue: 1, duration: 1700, useNativeDriver: false }).start();

    const finish = async () => {
      const token = await getAuthToken();
      let destination = "/welcome";
      if (token) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 1200);
          const response = await fetch(API + "/auth/me", { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
          clearTimeout(timeout);
          const data = await response.json().catch(() => ({}));
          if (response.ok) destination = data.user?.profileSetupComplete === false ? "/profile-setup" : "/feed";
        } catch {}
      }
      await new Promise(resolve => setTimeout(resolve, 1750));
      if (!cancelled) router.replace(destination as never);
    };

    void finish();
    return () => { cancelled = true; };
  }, [progress]);

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 210] });

  return (
    <View style={styles.container} accessibilityLabel="TwiTok loading">
      <Image source={require("../assets/images/twitok-logo.png")} style={styles.logo} resizeMode="contain" accessibilityLabel="TwiTok official logo" />
      <Animated.View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width }]} />
      </Animated.View>
      <Text style={styles.loading}>Loading…</Text>
      <Text style={styles.tagline}>Connecting Africa</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  logo: { width: 190, height: 190, marginBottom: 24 },
  progressTrack: { width: 210, height: 4, borderRadius: 999, overflow: "hidden", backgroundColor: "#1f1f1f", borderWidth: 1, borderColor: "#7a5a00" },
  progressFill: { height: "100%", borderRadius: 999, backgroundColor: "#ffd21f" },
  loading: { color: Colors.text, ...Typography.captionMedium, marginTop: 12 },
  tagline: { position: "absolute", bottom: 56, color: Colors.text, ...Typography.captionMedium, letterSpacing: 3 }
});