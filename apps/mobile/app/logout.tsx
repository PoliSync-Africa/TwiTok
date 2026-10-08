import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useEffect } from "react";
import { router } from "expo-router";
import { clearAuthToken } from "../lib/auth";

export default function LogoutScreen() {
  useEffect(() => {
    let mounted = true;
    void clearAuthToken().finally(() => {
      if (mounted) router.replace("/login");
    });
    return () => { mounted = false; };
  }, []);
  return <View style={styles.screen}><ActivityIndicator color="#111" /><Text style={styles.text}>Signing out…</Text></View>;
}
const styles=StyleSheet.create({
  screen:{flex:1,alignItems:"center",justifyContent:"center",backgroundColor:"#fff",gap:12},
  text:{fontSize:16,color:"#666"},
});