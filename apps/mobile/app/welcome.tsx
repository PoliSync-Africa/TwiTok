import { Link, router } from "expo-router";
import { Typography, Colors } from "../theme/typography";
import { StyleSheet, Text, View, Pressable, Image } from "react-native";

export default function WelcomeScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.brand}>
        <Image source={require("../assets/images/twitok-logo.png")} style={styles.logo} resizeMode="contain" accessibilityLabel="TwiTok official logo" />
        <Text style={styles.subtitle}>Africa's short-video platform</Text>
      </View>
      <Pressable style={styles.button} onPress={() => router.push("/login")}><Text style={styles.buttonText}>Open For You</Text></Pressable>
      <Link href="/register" asChild><Pressable style={styles.secondary}><Text style={styles.secondaryText}>Create account</Text></Pressable></Link>
      <Link href="/feed" asChild><Pressable style={styles.secondary}><Text style={styles.secondaryText}>Continue to feed</Text></Pressable></Link>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", padding: 24 },
  brand: { alignItems: "center", marginBottom: 40 },
  logo: { width: 150, height: 150, marginBottom: 12 },
  subtitle: { color: Colors.textSecondary, marginTop: 2, ...Typography.body },
  button: { width: "100%", maxWidth: 340, padding: 16, borderRadius: 14, backgroundColor: "#ff2d55", alignItems: "center", marginBottom: 12 },
  buttonText: { color: Colors.text, ...Typography.button },
  secondary: { width: "100%", maxWidth: 340, padding: 15, borderRadius: 14, borderWidth: 1, borderColor: "#333", alignItems: "center", marginBottom: 10 },
  secondaryText: { color: Colors.text, ...Typography.bodySemibold }
});