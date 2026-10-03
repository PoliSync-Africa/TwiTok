import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { registerGlobals } from "@livekit/react-native";

registerGlobals();

type SplashStage = "launch" | "loading" | "connecting";

function TwiTokSplash() {
  const [stage, setStage] = useState<SplashStage>("launch");
  const [visible, setVisible] = useState(true);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const enter = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 7,
        tension: 70,
        useNativeDriver: true
      })
    ]);
    enter.start();

    const loadingTimer = setTimeout(() => {
      setStage("loading");
      Animated.timing(progress, {
        toValue: 0.68,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false
      }).start();
    }, 700);

    const connectingTimer = setTimeout(() => {
      setStage("connecting");
      Animated.timing(progress, {
        toValue: 1,
        duration: 650,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false
      }).start();
    }, 1700);

    const exitTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 240,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(scale, {
          toValue: 1.03,
          duration: 240,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true
        })
      ]).start(({ finished }) => {
        if (finished) setVisible(false);
      });
    }, 2750);

    return () => {
      clearTimeout(loadingTimer);
      clearTimeout(connectingTimer);
      clearTimeout(exitTimer);
    };
  }, [opacity, progress, scale]);

  if (!visible) return null;

  return (
    <View style={styles.splash} pointerEvents="auto">
      {stage === "connecting" ? (
        <View pointerEvents="none" style={styles.waveLayer}>
          <View style={[styles.wave, styles.waveTop]} />
          <View style={[styles.wave, styles.waveBottom]} />
        </View>
      ) : null}

      <Animated.View style={[styles.content, { opacity, transform: [{ scale }] }]}>
        <Image
          source={require("../assets/twitok-logo.jpg")}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="TwiTok"
        />
        {stage === "loading" ? (
          <View style={styles.loadingBlock}>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, {
                width: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"]
                })
              }]} />
            </View>
            <Text style={styles.statusText}>Loading...</Text>
          </View>
        ) : null}
        {stage === "connecting" ? (
          <Text style={styles.connectingText}>Connecting you</Text>
        ) : null}
      </Animated.View>
    </View>
  );
}

export default function RootLayout() {
  useFonts({
    TikTokSans: "https://cdn.jsdelivr.net/fontsource/fonts/tiktok-sans@5.3.0/latin-400-normal.ttf",
    TikTokSansBold: "https://cdn.jsdelivr.net/fontsource/fonts/tiktok-sans@5.3.0/latin-700-normal.ttf"
  });

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#000" } }} />
      <TwiTokSplash />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  splash: {
    ...StyleSheet.absoluteFill,
    zIndex: 9999,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  content: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28
  },
  logo: {
    width: 300,
    height: 300
  },
  loadingBlock: {
    width: 250,
    marginTop: -18,
    alignItems: "center"
  },
  progressTrack: {
    width: "100%",
    height: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D99A00",
    backgroundColor: "#080808",
    overflow: "hidden"
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#FFC928"
  },
  statusText: {
    marginTop: 14,
    color: "#F5F5F5",
    fontSize: 16,
    fontFamily: "TikTokSans",
    letterSpacing: 0.2
  },
  connectingText: {
    marginTop: -18,
    color: "#F5F5F5",
    fontSize: 15,
    fontFamily: "TikTokSans",
    letterSpacing: 3.2
  },
  waveLayer: {
    ...StyleSheet.absoluteFill,
    opacity: 0.9
  },
  wave: {
    position: "absolute",
    width: "125%",
    height: 150,
    borderTopWidth: 1,
    borderColor: "#B77A00",
    borderRadius: 180,
    transform: [{ rotate: "-12deg" }]
  },
  waveTop: {
    top: -62,
    left: -35,
    borderTopWidth: 2
  },
  waveBottom: {
    bottom: -70,
    right: -35,
    transform: [{ rotate: "12deg" }],
    borderTopWidth: 2
  }
});
