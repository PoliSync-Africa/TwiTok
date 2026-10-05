import * as SecureStore from "expo-secure-store";
import { Alert } from "react-native";
import { router } from "expo-router";

const TOKEN_KEY = "twitok_auth_token";

export async function saveAuthToken(token: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getAuthToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearAuthToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function requireAuth(): Promise<string | null> {
  const token = await getAuthToken();
  if (token) return token;
  Alert.alert(
    "Sign in required",
    "Please sign in or create a TwiTok account to continue.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Sign up", onPress: () => router.push("/register") },
      { text: "Sign in", onPress: () => router.push("/login") },
    ],
  );
  return null;
}
