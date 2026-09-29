import { useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

export default function PromoteScreen() {
  const { videoId: initialVideoId } = useLocalSearchParams<{ videoId?: string }>();
  const [videoId, setVideoId] = useState(initialVideoId ?? "");
  const [objective, setObjective] = useState("MORE_VIEWS");
  const [currency, setCurrency] = useState("GHS");
  const [budget, setBudget] = useState("50");
  const [countries, setCountries] = useState("GH");
  const [interests, setInterests] = useState("");
  const [busy, setBusy] = useState(false);

  async function request(path: string, options: RequestInit = {}) {
    const token = await getAuthToken();
    const response = await fetch(API + path, { ...options, headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...(options.headers ?? {}) } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }

  async function promote() {
    if (!videoId.trim()) return Alert.alert("Video required", "Enter the video ID you want to promote.");
    setBusy(true);
    try {
      const campaign = await request("/promotions", { method: "POST", body: JSON.stringify({
        videoId: videoId.trim(), objective, currency, budget,
        target: { countryCodes: countries.split(",").map(x => x.trim().toUpperCase()).filter(Boolean), interests: interests.split(",").map(x => x.trim()).filter(Boolean) }
      })});
      const payment = await request("/promotions/" + campaign.id + "/pay", { method: "POST", body: JSON.stringify({}) });
      await Linking.openURL(payment.authorizationUrl);
      Alert.alert("Payment started", "Complete the secure payment. Then return to TwiTok and verify the promotion payment.");
    } catch (e) { Alert.alert("Promotion", e instanceof Error ? e.message : "Unable to start promotion"); }
    finally { setBusy(false); }
  }

  return <ScrollView contentContainerStyle={styles.container}>
    <Text style={styles.title}>Promote on TwiTok 🚀</Text>
    <Text style={styles.subtitle}>Pay TwiTok to give your real video more opportunities to reach relevant viewers.</Text>
    <TextInput style={styles.input} placeholder="Video ID" value={videoId} onChangeText={setVideoId} autoCapitalize="none" />
    <Text style={styles.label}>Goal</Text>
    <View style={styles.row}>{["MORE_VIEWS","MORE_FOLLOWERS","WEBSITE_TRAFFIC","LIVE_AUDIENCE"].map(x => <Pressable key={x} onPress={() => setObjective(x)} style={[styles.choice, objective === x && styles.active]}><Text>{x.replaceAll("_"," ")}</Text></Pressable>)}</View>
    <Text style={styles.label}>Currency</Text>
    <View style={styles.row}>{["GHS","USD"].map(x => <Pressable key={x} onPress={() => setCurrency(x)} style={[styles.choice, currency === x && styles.active]}><Text>{x}</Text></Pressable>)}</View>
    <Text style={styles.label}>Budget</Text>
    <TextInput style={styles.input} keyboardType="decimal-pad" value={budget} onChangeText={setBudget} />
    <Text style={styles.label}>Countries</Text>
    <TextInput style={styles.input} placeholder="GH, NG, KE" value={countries} onChangeText={setCountries} autoCapitalize="characters" />
    <Text style={styles.label}>Interests</Text>
    <TextInput style={styles.input} placeholder="football, comedy, music" value={interests} onChangeText={setInterests} />
    <Pressable disabled={busy} onPress={promote} style={styles.button}><Text style={styles.buttonText}>{busy ? "Starting..." : "Pay & Promote 🚀"}</Text></Pressable>
    <Text style={styles.note}>TwiTok sells distribution, not fake views or guaranteed followers. Results depend on how viewers respond to the promoted content.</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  container:{padding:20,gap:12,backgroundColor:"#fff",minHeight:"100%"},
  title:{fontSize:28,fontWeight:"800",marginTop:30},
  subtitle:{fontSize:15,lineHeight:22},
  label:{fontWeight:"700",marginTop:8},
  input:{borderWidth:1,borderColor:"#ddd",borderRadius:12,padding:14,fontSize:16},
  row:{flexDirection:"row",flexWrap:"wrap",gap:8},
  choice:{borderWidth:1,borderColor:"#ddd",borderRadius:20,paddingHorizontal:12,paddingVertical:10},
  active:{borderColor:"#111",backgroundColor:"#eee"},
  button:{backgroundColor:"#111",padding:16,borderRadius:14,alignItems:"center",marginTop:12},
  buttonText:{color:"#fff",fontSize:17,fontWeight:"800"},
  note:{fontSize:12,color:"#666",lineHeight:18,marginTop:8}
});
