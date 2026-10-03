import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <View style={styles.content}>
        <Image
          source={require("../assets/twitok-logo.jpg")}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="TwiTok"
        />

        <Text style={styles.tagline}>Connecting Africa</Text>
        <Text style={styles.description}>
          Discover creators, share your voice, and experience Africa through video.
        </Text>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create a TwiTok account"
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            onPress={() => router.push("/register")}
          >
            <Text style={styles.primaryText}>Create account</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign in to TwiTok"
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
            onPress={() => router.push("/login")}
          >
            <Text style={styles.secondaryText}>Log in</Text>
          </Pressable>
        </View>

        <Text style={styles.footer}>TwiTok • Africa's social video platform</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  content: {
    width: "100%",
    maxWidth: 430,
    alignItems: "center",
    paddingHorizontal: 28
  },
  logo: {
    width: 300,
    height: 300,
    marginBottom: -22
  },
  tagline: {
    color: "#F7C842",
    fontSize: 21,
    fontWeight: "700",
    letterSpacing: 2.4,
    marginBottom: 12
  },
  description: {
    color: "#B9B9B9",
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
    maxWidth: 330
  },
  actions: {
    width: "100%",
    marginTop: 34,
    gap: 12
  },
  primary: {
    minHeight: 54,
    borderRadius: 15,
    backgroundColor: "#F7C842",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#F7C842",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6
  },
  primaryText: {
    color: "#080808",
    fontSize: 16,
    fontWeight: "900"
  },
  secondary: {
    minHeight: 54,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#4A3A12",
    backgroundColor: "#0D0D0D",
    alignItems: "center",
    justifyContent: "center"
  },
  secondaryText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "800"
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }]
  },
  footer: {
    color: "#666",
    fontSize: 12,
    marginTop: 32,
    letterSpacing: 0.4
  },
  glowTop: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 280,
    backgroundColor: "#3A2700",
    opacity: 0.18,
    top: -170,
    right: -90
  },
  glowBottom: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 320,
    backgroundColor: "#3A2700",
    opacity: 0.14,
    bottom: -210,
    left: -130
  }
});
