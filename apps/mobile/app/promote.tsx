import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { DimensionValue } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

function getProgressWidth(spentMinor: unknown, budgetMinor: unknown): DimensionValue {
  const spent = Number(spentMinor ?? 0);
  const budget = Math.max(1, Number(budgetMinor ?? 1));
  const percent = Math.min(100, Math.round((spent / budget) * 100));
  return `${percent}%`;
}

export default function PromoteScreen() {
  const { videoId: initialVideoId } = useLocalSearchParams<{ videoId?: string }>();
  const [videoId, setVideoId] = useState(initialVideoId ?? "");
  const [objective, setObjective] = useState("MORE_VIEWS");
  const [currency, setCurrency] = useState("GHS");
  const [budget, setBudget] = useState("4.60");
  const [packages, setPackages] = useState<any[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<string | null>("VIEWS_800");
  const [countries, setCountries] = useState("GH");
  const [interests, setInterests] = useState("");
  const [busy, setBusy] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [reference, setReference] = useState("");
  const [analytics, setAnalytics] = useState<Record<string, any>>({});

  async function loadCampaigns() {
    try {
      const data = await request("/promotions/me");
      setCampaigns(data.campaigns ?? []);
    } catch (e) {
      Alert.alert("Promotions", e instanceof Error ? e.message : "Unable to load campaigns");
    }
  }

  async function loadPackages() {
    try { const data = await request("/promotions/packages"); setPackages(data.packages ?? []); }
    catch (e) { Alert.alert("Promotions", e instanceof Error ? e.message : "Unable to load promotion packages"); }
  }

  useEffect(() => { loadCampaigns(); loadPackages(); }, []);

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
      const selected = packages.find(p => p.id === selectedPackage);
      const campaign = await request("/promotions", { method: "POST", body: JSON.stringify({
        videoId: videoId.trim(), objective, currency, budget: selected ? selected.price : budget, packageId: selected?.id ?? undefined,
        target: { countryCodes: countries.split(",").map(x => x.trim().toUpperCase()).filter(Boolean), interests: interests.split(",").map(x => x.trim()).filter(Boolean) }
      })});
      const payment = await request("/promotions/" + campaign.id + "/pay", { method: "POST", body: JSON.stringify({}) });
      setReference(payment.reference);
      await Linking.openURL(payment.authorizationUrl);
      Alert.alert("Payment started", "Complete the secure payment. Then return to TwiTok and verify the promotion payment.");
    } catch (e) { Alert.alert("Promotion", e instanceof Error ? e.message : "Unable to start promotion"); }
    finally { setBusy(false); }
  }

  async function verifyPayment() {
    if (!reference) return Alert.alert("Payment", "No payment reference is waiting for verification.");
    setBusy(true);
    try {
      await request("/promotions/payments/verify", { method: "POST", body: JSON.stringify({ reference }) });
      Alert.alert("Payment confirmed", "Your promotion is now paid. Start the campaign when you are ready.");
      setReference("");
      await loadCampaigns();
    } catch (e) {
      Alert.alert("Payment", e instanceof Error ? e.message : "Payment is not confirmed yet.");
    } finally { setBusy(false); }
  }

  async function loadAnalytics(id: string) {
    try { const data = await request("/promotions/" + id + "/analytics"); setAnalytics(prev => ({ ...prev, [id]: data.analytics })); }
    catch (e) { Alert.alert("Analytics", e instanceof Error ? e.message : "Unable to load analytics"); }
  }

  async function startCampaign(id: string) {
    setBusy(true);
    try {
      await request("/promotions/" + id + "/start", { method: "POST" });
      await loadCampaigns();
      Alert.alert("Promotion active", "Your campaign is now running.");
    } catch (e) {
      Alert.alert("Promotion", e instanceof Error ? e.message : "Unable to start campaign");
    } finally { setBusy(false); }
  }

  async function pauseCampaign(id: string) {
    setBusy(true);
    try {
      await request("/promotions/" + id + "/pause", { method: "POST" });
      await loadCampaigns();
    } catch (e) {
      Alert.alert("Promotion", e instanceof Error ? e.message : "Unable to pause campaign");
    } finally { setBusy(false); }
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
    <Pressable disabled={busy} onPress={promote} style={styles.button}><Text style={styles.buttonText}>{busy ? "Working..." : "Pay & Promote 🚀"}</Text></Pressable>
    {reference ? <Pressable disabled={busy} onPress={verifyPayment} style={styles.verify}><Text style={styles.verifyText}>Verify Payment ✓</Text></Pressable> : null}
    <View style={styles.dashboardHeader}>
      <Text style={styles.dashboardTitle}>Your promotions</Text>
      <Pressable onPress={loadCampaigns}><Text style={styles.refresh}>Refresh</Text></Pressable>
    </View>
    {campaigns.length === 0 ? <Text style={styles.empty}>No promotion campaigns yet.</Text> : campaigns.map((campaign) => (
      <View key={campaign.id} style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.objective}>{String(campaign.objective).replaceAll("_"," ")}</Text>
          <Text style={styles.status}>{campaign.status}</Text>
        </View>
        {campaign.targetViews ? <Text style={styles.packageInfo}>🎯 {Number(campaign.targetViews).toLocaleString()}+ estimated views • {campaign.durationDays ?? 1} day • {campaign.discountPercent ?? 0}% discount</Text> : null}
        <Text style={styles.budget}>{campaign.currency} {(Number(campaign.spentMinor ?? 0) / 100).toFixed(2)} spent / {(Number(campaign.budgetMinor ?? 0) / 100).toFixed(2)} budget</Text>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: getProgressWidth(campaign.spentMinor, campaign.budgetMinor) }]} /></View>
        <Text style={styles.remaining}>Remaining: {campaign.currency} {Math.max(0,(Number(campaign.budgetMinor ?? 0)-Number(campaign.spentMinor ?? 0))/100).toFixed(2)}</Text>
        <View style={styles.metrics}>
          <Text>👁 {campaign.metrics?.impressions ?? 0} impressions</Text>
          <Text>▶️ {campaign.metrics?.views ?? 0} views</Text>
          <Text>👥 {campaign.metrics?.follows ?? 0} follows</Text>
        </View>
        {campaign.status === "PAID" ? <Pressable disabled={busy} onPress={() => startCampaign(campaign.id)} style={styles.smallButton}><Text style={styles.smallButtonText}>Start Campaign</Text></Pressable> : null}
        <Pressable disabled={busy} onPress={() => loadAnalytics(campaign.id)} style={styles.analyticsButton}><Text style={styles.analyticsText}>View Analytics</Text></Pressable>
        {analytics[campaign.id] ? <View style={styles.analyticsCard}><Text>Impressions: {analytics[campaign.id].impressions}</Text><Text>2s views: {analytics[campaign.id].views}</Text><Text>Completed: {analytics[campaign.id].completedViews}</Text><Text>Likes: {analytics[campaign.id].likes} • Shares: {analytics[campaign.id].shares}</Text><Text>Follows: {analytics[campaign.id].follows}</Text></View> : null}
        {campaign.status === "ACTIVE" ? <Pressable disabled={busy} onPress={() => pauseCampaign(campaign.id)} style={styles.pauseButton}><Text style={styles.pauseText}>Pause Campaign</Text></Pressable> : null}
      </View>
    ))}
    <Text style={styles.note}>TwiTok sells distribution, not fake views or guaranteed followers. Results depend on how viewers respond to the promoted content.</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  container:{padding:20,gap:12,backgroundColor:"#fff",minHeight:"100%"},
  title:{fontSize:28,fontWeight:"800",marginTop:30},
  subtitle:{fontSize:15,lineHeight:22},
  label:{fontWeight:"700",marginTop:8},
  discount:{fontSize:14,fontWeight:"900",letterSpacing:0.5},
  packages:{gap:10},
  package:{borderWidth:1,borderColor:"#ddd",borderRadius:16,padding:15,gap:5},
  packageActive:{borderColor:"#111",backgroundColor:"#f2f2f2"},
  packageViews:{fontSize:17,fontWeight:"800"},
  packagePrice:{fontSize:20,fontWeight:"900"},
  oldPrice:{textDecorationLine:"line-through",color:"#777",fontSize:14},
  packageDiscount:{fontSize:12,fontWeight:"800",color:"#555"},
  input:{borderWidth:1,borderColor:"#ddd",borderRadius:12,padding:14,fontSize:16},
  row:{flexDirection:"row",flexWrap:"wrap",gap:8},
  choice:{borderWidth:1,borderColor:"#ddd",borderRadius:20,paddingHorizontal:12,paddingVertical:10},
  active:{borderColor:"#111",backgroundColor:"#eee"},
  button:{backgroundColor:"#111",padding:16,borderRadius:14,alignItems:"center",marginTop:12},
  buttonText:{color:"#fff",fontSize:17,fontWeight:"800"},
  verify:{borderWidth:1,borderColor:"#111",padding:15,borderRadius:14,alignItems:"center"},
  verifyText:{fontSize:16,fontWeight:"800"},
  dashboardHeader:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:18},
  dashboardTitle:{fontSize:21,fontWeight:"800"},
  refresh:{fontWeight:"700"},
  empty:{color:"#666",paddingVertical:8},
  card:{borderWidth:1,borderColor:"#ddd",borderRadius:16,padding:15,gap:10,backgroundColor:"#fafafa"},
  cardTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
  objective:{fontWeight:"800"},
  status:{fontWeight:"800"},
  packageInfo:{fontSize:13,fontWeight:"800"},
  budget:{fontSize:15,fontWeight:"700"},
  progressTrack:{height:7,borderRadius:4,backgroundColor:"#e5e5e5",overflow:"hidden"},
  progressFill:{height:"100%",backgroundColor:"#111",borderRadius:4},
  remaining:{fontSize:13,color:"#666",fontWeight:"600"},
  metrics:{gap:5},
  smallButton:{backgroundColor:"#111",padding:12,borderRadius:10,alignItems:"center"},
  smallButtonText:{color:"#fff",fontWeight:"800"},
  analyticsButton:{borderWidth:1,borderColor:"#ddd",padding:12,borderRadius:10,alignItems:"center"},
  analyticsText:{fontWeight:"800"},
  analyticsCard:{backgroundColor:"#f2f2f2",borderRadius:12,padding:12,gap:4},
  pauseButton:{borderWidth:1,borderColor:"#999",padding:12,borderRadius:10,alignItems:"center"},
  pauseText:{fontWeight:"800"},
  note:{fontSize:12,color:"#666",lineHeight:18,marginTop:8}
});
