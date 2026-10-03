import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";

SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ duration: 350, fade: true });

export default function RootLayout() {
  useEffect(() => {
    const frame = requestAnimationFrame(() => { void SplashScreen.hideAsync(); });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#000" } }} />
    </>
  );
}