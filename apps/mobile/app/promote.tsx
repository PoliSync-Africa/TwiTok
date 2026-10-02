import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { DimensionValue } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
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
  const [durationDays, setDurationDays] = useState(7);
  const [audienceScope, setAudienceScope] = useState("GLOBAL");
  const [locationLoading, setLocationLoading] = useState(false);
  const [packages, setPackages] = useState<any[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<string | null>("VIEWS_800");
  const [objectivePackages, setObjectivePackages] = useState<any[]>([]);
  const [partnershipPackages, setPartnershipPackages] = useState<any[]>([]);
  const [subscriberReachPackages, setSubscriberReachPackages] = useState<any[]>([]);
  const [countries, setCountries] = useState("");
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
    try { const data = await request("/promotions/packages"); setPackages(data.packages ?? []); setObjectivePackages(data.objectivePackages ?? []); setPartnershipPackages(data.partnershipPackages ?? []); setSubscriberReachPackages(data.subscriberReachPackages ?? []); }
    catch (e) { Alert.alert("Promotions", e instanceof Error ? e.message : "Unable to load promotion packages"); }
  }

  useEffect(() => { loadCampaigns(); loadPackages(); }, []);

  function selectedDurationOption() {
    const source = objective === "MORE_VIEWS" ? packages : objectivePackages;
    const pack = source.find(p => p.id === selectedPackage);
    return pack?.durationOptions?.find((option: any) => Number(option.days) === durationDays) ?? null;
  }

  async function useMyLocation() {
    setLocationLoading(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        return Alert.alert("Location permission", "Allow TwiTok to use your location to add your country to the audience. You can continue with Global audience without sharing location.");
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const places = await Location.reverseGeocodeAsync(position.coords);
      const code = places[0]?.isoCountryCode?.toUpperCase();
      if (!code) throw new Error("Unable to determine your country");
      setCountries(code);
      setAudienceScope("COUNTRIES");
      Alert.alert("Audience location", "Your current country was added. You can still change the countries manually.");
    } catch (e) {
      Alert.alert("Location", e instanceof Error ? e.message : "Unable to use your location");
    } finally { setLocationLoading(false); }
  }

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
      const selected = objective === "MORE_VIEWS" ? packages.find(p => p.id === selectedPackage) : objectivePackages.find(p => p.id === selectedPackage);
      const durationOption = selected?.durationOptions?.find((option: any) => Number(option.days) === durationDays);
      const selectedPrice = durationOption?.price ?? selected?.price;
      const campaign = await request("/promotions", { method: "POST", body: JSON.stringify({
        videoId: videoId.trim(), objective, currency, budget: selected ? (durationOption?.price ?? selected.price) : budget, packageId: selected?.id ?? undefined, durationDays,
        target: { countryCodes: audienceScope === "GLOBAL" ? [] : countries.split(",").map(x => x.trim().toUpperCase()).filter(Boolean), interests: interests.split(",").map(x => x.trim()).filter(Boolean) }
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
    <Text style={styles.subtitle}>Promote real content, reach relevant audiences, and build paid brand partnerships on TwiTok.</Text>
    <View style={styles.partnerBanner}>
      <Text style={styles.partnerTitle}>🤝 Paid Partnerships</Text>
      <Text style={styles.partnerText}>Brands can sponsor creator content and receive campaign distribution with clear deliverables.</Text>
      <View style={styles.partnerships}>{partnershipPackages.map((pack) => <View key={pack.id} style={styles.partnershipCard}>
        <Text style={styles.packageViews}>{pack.id.replaceAll("_"," ")}</Text>
        <Text style={styles.partnerText}>{pack.deliverables}</Text>
        <Text style={styles.packagePrice}>$ {Number(pack.price).toFixed(2)}</Text>
        <Text style={styles.packageDiscount}>{pack.durationDays} days • 8% discount</Text>
      </View>)}</View>
    </View>
    <View style={styles.partnerBanner}>
      <Text style={styles.partnerTitle}>📣 Reach Subscribed Audiences</Text>
      <Text style={styles.partnerText}>Paid campaigns can target eligible subscribed audiences by approved interests and geography. Audience reach is an estimate, not a guaranteed result.</Text>
      <View style={styles.partnerships}>{subscriberReachPackages.map((pack) => <View key={pack.id} style={styles.partnershipCard}>
        <Text style={styles.packageViews}>{Number(pack.audience).toLocaleString()} audience reach</Text>
        <Text style={styles.packagePrice}>$ {Number(pack.price).toFixed(2)}</Text>
        <Text style={styles.packageDiscount}>{pack.durationDays} day{pack.durationDays === 1 ? "" : "s"} • 8% discount</Text>
      </View>)}</View>
    </View>
    <TextInput style={styles.input} placeholder="Video ID" value={videoId} onChangeText={setVideoId} autoCapitalize="none" />
    <Text style={styles.label}>Goal</Text>
    <View style={styles.row}>{["MORE_VIEWS","MORE_FOLLOWERS","WEBSITE_TRAFFIC","LIVE_AUDIENCE"].map(x => <Pressable key={x} onPress={() => { setObjective(x); const first = x === "MORE_VIEWS" ? packages[0] : objectivePackages[0]; if (first) { setSelectedPackage(first.id); setBudget(String(first.price)); setCurrency("USD"); } }} style={[styles.choice, objective === x && styles.active]}><Text>{x.replaceAll("_"," ")}</Text></Pressable>)}</View>
    <Text style={styles.label}>Currency</Text>
    <View style={styles.row}>{["GHS","USD"].map(x => <Pressable key={x} onPress={() => setCurrency(x)} style={[styles.choice, currency === x && styles.active]}><Text>{x}</Text></Pressable>)}</View>
    <Text style={styles.label}>Audience</Text>
    <View style={styles.row}>
      <Pressable onPress={() => { setAudienceScope("GLOBAL"); setCountries(""); }} style={[styles.choice, audienceScope === "GLOBAL" && styles.active]}><Text>🌍 Global (default)</Text></Pressable>
      <Pressable onPress={() => setAudienceScope("COUNTRIES")} style={[styles.choice, audienceScope === "COUNTRIES" && styles.active]}><Text>🌎 Choose countries</Text></Pressable>
      <Pressable disabled={locationLoading} onPress={useMyLocation} style={styles.choice}><Text>{locationLoading ? "Finding location..." : "📍 Use my location"}</Text></Pressable>
    </View>
    <Text style={styles.locationHint}>Global reaches eligible audiences worldwide. Choose countries or allow location access to add your current country.</Text>
    <Text style={styles.label}>Promotion duration</Text>
    <View style={styles.row}>{[7,14,30,60].map(days => { const option = (objective === "MORE_VIEWS" ? packages : objectivePackages).find(p => p.id === selectedPackage)?.durationOptions?.find((x:any) => Number(x.days) === days); return <Pressable key={days} onPress={() => { setDurationDays(days); if (option) setBudget(String(option.price)); }} style={[styles.choice, durationDays === days && styles.active]}><Text>{days} day{days === 1 ? "" : "s"}</Text></Pressable>; })}</View>
    {selectedDurationOption() ? <Text style={styles.durationInfo}>Total price +{selectedDurationOption().cumulativePriceIncreasePercent ?? selectedDurationOption().priceIncreasePercent}% vs 7-day base • estimated audience +{selectedDurationOption().audienceIncreasePercent}%</Text> : null}
    <Text style={styles.label}>Promotion package</Text>
    <Text style={styles.discount}>8% DISCOUNT APPLIED</Text>
    <View style={styles.packages}>{(objective === "MORE_VIEWS" ? packages : objectivePackages).map((pack) => <Pressable key={pack.id} onPress={() => { setSelectedPackage(pack.id); setBudget(String(pack.price)); setCurrency("USD"); }} style={[styles.package, selectedPackage === pack.id && styles.packageActive]}>
      <Text style={styles.packageViews}>{objective === "MORE_VIEWS" ? `${Number(pack.views).toLocaleString()}+ estimated views` : `${String(objective).replaceAll("_"," ")} • budget tier`}</Text>
      <Text style={styles.packagePrice}><Text style={styles.oldPrice}>$ {Number(pack.benchmarkPrice).toFixed(2)}</Text>  $ {Number(pack.price).toFixed(2)}</Text>
      <Text style={styles.packageDiscount}>8% DISCOUNT APPLIED • {pack.durationDays} day{pack.durationDays === 1 ? "" : "s"}{objective !== "MORE_VIEWS" ? " • results not guaranteed" : ""}</Text>
    </Pressable>)}</View>
    <Text style={styles.label}>Custom budget</Text>
    <TextInput style={styles.input} keyboardType="decimal-pad" value={budget} onChangeText={(value) => { setBudget(value); setSelectedPackage(null); }} />
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
        {campaign.targetViews ? <Text style={styles.packageInfo}>🎯 {Number(campaign.targetViews).toLocaleString()}+ estimated views • {campaign.durationDays ?? 7} day • {campaign.discountPercent ?? 0}% discount</Text> : null}
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
  partnerBanner:{borderWidth:1,borderColor:"#ddd",borderRadius:18,padding:15,gap:10,backgroundColor:"#f7f7f7"},
  partnerTitle:{fontSize:19,fontWeight:"900"},
  partnerText:{fontSize:13,lineHeight:19},
  partnerships:{gap:8},
  partnershipCard:{borderWidth:1,borderColor:"#ddd",borderRadius:12,padding:12,gap:4,backgroundColor:"#fff"},
  note:{fontSize:12,color:"#666",lineHeight:18,marginTop:8},
  locationHint:{fontSize:12,color:"#666",lineHeight:18},
  durationInfo:{fontSize:13,fontWeight:"800"}
});
