import { Link } from "expo-router";
import { StyleSheet, Text, View, Pressable } from "react-native";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.brand}>
        <Text style={styles.logo}>TwiTok</Text>
        <Text style={styles.subtitle}>Africa's short-video platform</Text>
      </View>
      <Pressable style={styles.button} onPress={() => router.push("/login")}>
        <Text style={styles.buttonText}>Open For You</Text>
      </Pressable>
      <Link href="/register" asChild>
        <Pressable style={styles.secondary}>
          <Text style={styles.secondaryText}>Create account</Text>
        </Pressable>
      </Link>
      <Link href="/feed" asChild>
        <Pressable style={styles.secondary}>
          <Text style={styles.secondaryText}>Continue to feed</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", padding: 24 },
  brand: { alignItems: "center", marginBottom: 40 },
  logo: { color: "#fff", fontSize: 42, fontWeight: "800" },
  subtitle: { color: "#aaa", marginTop: 8, fontSize: 15 },
  button: { width: "100%", maxWidth: 340, padding: 16, borderRadius: 14, backgroundColor: "#ff2d55", alignItems: "center", marginBottom: 12 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondary: { width: "100%", maxWidth: 340, padding: 15, borderRadius: 14, borderWidth: 1, borderColor: "#333", alignItems: "center" },
  secondaryText: { color: "#fff", fontSize: 16, fontWeight: "600" }
});