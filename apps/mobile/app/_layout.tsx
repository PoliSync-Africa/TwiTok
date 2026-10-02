import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, View, Animated } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { registerGlobals } from "@livekit/react-native";

registerGlobals();

function TwiTokSplash() {
  const [visible, setVisible] = useState(true);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    const enter = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true })
    ]);
    enter.start();
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.04, duration: 220, useNativeDriver: true })
      ]).start(({ finished }) => {
        if (finished) setVisible(false);
      });
    }, 1050);
    return () => clearTimeout(timer);
  }, [opacity, scale]);

  if (!visible) return null;
  return (
    <View style={styles.splash} pointerEvents="auto">
      <Animated.View style={[styles.logoWrap, { opacity, transform: [{ scale }] }]}>
        <Image source={require("../assets/twitok-logo.jpg")} style={styles.logo} resizeMode="contain" />
      </Animated.View>
    </View>
  );
}

export default function RootLayout() {
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
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center"
  },
  logoWrap: {
    width: 190,
    height: 190,
    alignItems: "center",
    justifyContent: "center"
  },
  logo: {
    width: 190,
    height: 190
  }
});
