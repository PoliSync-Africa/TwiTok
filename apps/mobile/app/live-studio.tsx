import { useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

type Studio = {
  background: string;
  backgroundUrl: string | null;
  effect: string;
  filter: string;
  stickers: string[];
  beauty: number;
  layout: string;
  guestLimit: number;
  commentsFilterEnabled: boolean;
  autoCaptions: boolean;
  giftAlerts: boolean;
  lowLatency: boolean;
  recordingEnabled: boolean;
  screenShareEnabled: boolean;
};

const DEFAULTS: Studio = {
  background: "NONE", backgroundUrl: null, effect: "NONE", filter: "NONE", stickers: [], beauty: 0, layout: "SOLO",
  guestLimit: 15, commentsFilterEnabled: true, autoCaptions: true, giftAlerts: true,
  lowLatency: true, recordingEnabled: false, screenShareEnabled: false
};

const BACKGROUNDS = [
  ["NONE","No background","○"],["BLUR","Soft blur","◌"],["STUDIO","Creator Studio","▣"],["SUNSET","Sunset","☀"],
  ["CITY","City lights","⌂"],["GOLD","Gold","◆"],["KENTE","Kente","▦"],["NIGHT","Night","☾"],
  ["NEON","Neon room","✦"],["BEACH","Beach","⌁"],["FOREST","Forest","♣"],["MOUNTAINS","Mountains","▲"],
  ["SPACE","Space","✧"],["GALAXY","Galaxy","✦"],["AURORA","Aurora","≋"],["CLOUDS","Clouds","☁"],
  ["CHERRY","Cherry","●"],["SAKURA","Sakura","✿"],["TROPICAL","Tropical","🌴"],["OCEAN","Ocean","≈"],
  ["DESERT","Desert","◇"],["LUXURY","Luxury","♛"],["CONCERT","Concert","♫"],["SPORTS","Sports","★"],
  ["NEWS","Newsroom","▤"],["OFFICE","Office","▥"],["CLASSROOM","Classroom","▧"],["CAFE","Cafe","☕"],
  ["STAGE","Stage","◉"],["FIRE","Fire","♨"],["RAIN","Rain","☂"],["HEARTS","Hearts","♥"],
  ["PRIDE","Pride","🏳️‍🌈"],["GHANA","Ghana","★"],["AFRICA","Africa","◆"],["CUSTOM","My photo","＋"]
] as const;
const FILTERS = ["NONE","BEAUTY","VIVID","WARM","COOL","MONO","CINEMATIC","VINTAGE","DREAM","FADE","SUNNY","DUSK","POP","FILM","NOIR","GLOW","SHARP","SOFT","PORTRAIT","PARTY","FESTIVAL","GOLDEN","TEAL","ROSE"];
const STICKERS = ["❤️","😂","🔥","👏","😍","🥳","✨","⭐","💯","🎉","🎁","🎵","🎤","👑","💎","🌟","💫","🌈","☀️","🌙","☁️","⚡","🌸","🌺","🌴","🦋","🐝","🍀","🍕","🍔","🍹","⚽","🏆","🎮","📸","🎬","🇬🇭","🇳🇬","🇰🇪","🇿🇦","🇺🇸","🇬🇧"];
const LAYOUTS = ["SOLO","DUO","TRIO","GRID","PANEL","PIP"];

export default function LiveStudioScreen() {
  const { streamId } = useLocalSearchParams<{ streamId?: string }>();
  const [studio, setStudio] = useState<Studio>(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [customPreview, setCustomPreview] = useState<string | null>(null);

  const headers = async (json = false) => {
    const token = await getAuthToken();
    return { ...(json ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: "Bearer " + token } : {}) };
  };

  const load = async () => {
    if (!streamId) return;
    const res = await fetch(API + "/live/streams/" + encodeURIComponent(String(streamId)) + "/studio", { headers: await headers() });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setStudio({ ...DEFAULTS, ...(data.studio ?? {}) });
    else setMessage(data.error || "Unable to load LIVE Studio.");
  };

  useEffect(() => { void load(); }, [streamId]);

  const save = async (patch: Partial<Studio>) => {
    if (!streamId || busy) return;
    setBusy(true); setMessage("");
    try {
      const next = { ...studio, ...patch };
      const res = await fetch(API + "/live/streams/" + encodeURIComponent(String(streamId)) + "/studio", {
        method: "PATCH", headers: await headers(true), body: JSON.stringify(patch)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save LIVE Studio settings");
      setStudio({ ...next, ...(data.studio ?? {}) });
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save LIVE Studio settings"); }
    finally { setBusy(false); }
  };

  const uploadBackground = async () => {
    if (!streamId || busy) return;
    const pick = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 1
    });
    if (pick.canceled || !pick.assets[0]?.uri) return;
    const asset = pick.assets[0];
    setBusy(true); setMessage("");
    try {
      const mimeType = asset.mimeType && /^image\/(jpeg|png|webp)$/i.test(asset.mimeType) ? asset.mimeType : "image/jpeg";
      const sign = await fetch(API + "/live/streams/" + encodeURIComponent(String(streamId)) + "/studio/background-upload-url", {
        method: "POST", headers: await headers(true), body: JSON.stringify({ mimeType })
      });
      const signed = await sign.json().catch(() => ({}));
      if (!sign.ok) throw new Error(signed.error || "Unable to prepare background upload");
      const blob = await (await fetch(asset.uri)).blob();
      const upload = await fetch(String(signed.uploadUrl), { method: "PUT", headers: { "Content-Type": mimeType }, body: blob });
      if (!upload.ok) throw new Error("Background upload failed");
      setCustomPreview(asset.uri);
      const res = await fetch(API + "/live/streams/" + encodeURIComponent(String(streamId)) + "/studio", {
        method: "PATCH", headers: await headers(true),
        body: JSON.stringify({ background: "CUSTOM", backgroundUrl: String(signed.objectKey) })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save custom background");
      setStudio(old => ({ ...old, ...(data.studio ?? {}), background: "CUSTOM", backgroundUrl: String(signed.objectKey) }));
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not set custom background"); }
    finally { setBusy(false); }
  };

  const backgroundLabel = useMemo(() => BACKGROUNDS.find(x => x[0] === studio.background)?.[1] ?? studio.background, [studio.background]);

  if (!streamId) return <View style={styles.center}><Text style={styles.title}>LIVE Studio session not found.</Text></View>;

  return <View style={styles.root}>
    <View style={styles.header}>
      <Pressable onPress={() => router.back()}><Text style={styles.back}>‹</Text></Pressable>
      <View><Text style={styles.headerTitle}>LIVE Studio</Text><Text style={styles.headerSub}>Advanced creator controls</Text></View>
      <Text style={styles.liveDot}>●</Text>
    </View>

    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        {customPreview && studio.background === "CUSTOM" ? <Image source={{ uri: customPreview }} style={StyleSheet.absoluteFill} /> : <View style={styles.sceneFill}><Text style={styles.sceneIcon}>🎬</Text><Text style={styles.sceneTitle}>{backgroundLabel}</Text></View>}
        <View style={styles.sceneOverlay}><Text style={styles.sceneBadge}>9:16 LIVE SCENE</Text><Text style={styles.sceneCaption}>{studio.layout} • {studio.filter} • Beauty {studio.beauty}%</Text>{studio.stickers.length ? <Text style={styles.stickerPreview}>{studio.stickers.join(" ")}</Text> : null}</View>
      </View>

      <Section title="Background">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {BACKGROUNDS.map(([id,label]) => <Pressable key={id} style={[styles.choice, studio.background === id && styles.choiceActive]} onPress={() => id === "CUSTOM" ? void uploadBackground() : void save({ background: id })}><Text style={styles.choiceIcon}>{id === "CUSTOM" ? "＋" : id === "BLUR" ? "◌" : "✦"}</Text><Text style={styles.choiceText}>{label}</Text></Pressable>)}
        </ScrollView>
        <Text style={styles.note}>Choose a preset or upload your own photo. The selected scene is saved to this LIVE.</Text>
      </Section>

      <Section title="Filters">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {FILTERS.map(filter => <Pressable key={filter} style={[styles.pill, studio.filter === filter && styles.pillActive]} onPress={() => void save({ filter })}><Text style={styles.pillText}>{filter}</Text></Pressable>)}
        </ScrollView>
        <Text style={styles.note}>Live filters are selectable independently from beauty controls.</Text>
      </Section>

      <Section title="Stickers">
        <View style={styles.stickerGrid}>
          {STICKERS.map(sticker => {
            const selected = studio.stickers.includes(sticker);
            return <Pressable key={sticker} style={[styles.sticker, selected && styles.stickerActive]} onPress={() => {
              const next = selected ? studio.stickers.filter(item => item !== sticker) : [...studio.stickers, sticker].slice(0, 32);
              void save({ stickers: next });
            }}><Text style={styles.stickerText}>{sticker}</Text></Pressable>;
          })}
        </View>
        <Text style={styles.note}>{studio.stickers.length}/32 stickers selected. Tap again to remove.</Text>
      </Section>

      <Section title="Effects & beauty">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {EFFECTS.map(effect => <Pressable key={effect} style={[styles.pill, studio.effect === effect && styles.pillActive]} onPress={() => void save({ effect })}><Text style={styles.pillText}>{effect}</Text></Pressable>)}
        </ScrollView>
        <View style={styles.sliderRow}><Text style={styles.label}>Beauty</Text><TextInput keyboardType="number-pad" value={String(studio.beauty)} onChangeText={v => setStudio(s => ({ ...s, beauty: Math.min(100, Math.max(0, Number(v.replace(/[^0-9]/g, "" ) || 0))) }))} onBlur={() => void save({ beauty: studio.beauty })} style={styles.number}/><Text style={styles.percent}>%</Text></View>
      </Section>

      <Section title="Scene layout">
        <View style={styles.wrap}>{LAYOUTS.map(layout => <Pressable key={layout} style={[styles.pill, studio.layout === layout && styles.pillActive]} onPress={() => void save({ layout })}><Text style={styles.pillText}>{layout}</Text></Pressable>)}</View>
      </Section>

      <Section title="Guests & interaction">
        <View style={styles.sliderRow}><Text style={styles.label}>Maximum guest slots</Text><TextInput keyboardType="number-pad" value={String(studio.guestLimit)} onChangeText={v => setStudio(s => ({ ...s, guestLimit: Math.min(15, Math.max(1, Number(v.replace(/[^0-9]/g, "" ) || 1))) }))} onBlur={() => void save({ guestLimit: studio.guestLimit })} style={styles.number}/></View>
        <Toggle label="Comment filtering" value={studio.commentsFilterEnabled} onChange={commentsFilterEnabled => void save({ commentsFilterEnabled })}/>
        <Toggle label="Auto captions" value={studio.autoCaptions} onChange={autoCaptions => void save({ autoCaptions })}/>
        <Toggle label="Gift alerts" value={studio.giftAlerts} onChange={giftAlerts => void save({ giftAlerts })}/>
      </Section>

      <Section title="Broadcast">
        <Toggle label="Low-latency mode" value={studio.lowLatency} onChange={lowLatency => void save({ lowLatency })}/>
        <Toggle label="Record LIVE" value={studio.recordingEnabled} onChange={recordingEnabled => void save({ recordingEnabled })}/>
        <Toggle label="Screen share ready" value={studio.screenShareEnabled} onChange={screenShareEnabled => void save({ screenShareEnabled })}/>
      </Section>

      {message ? <Text style={styles.error}>{message}</Text> : null}
      <Pressable style={styles.go} disabled={busy} onPress={() => router.replace({ pathname: "/live-host", params: { streamId: String(streamId), studioReady: "1" } })}><Text style={styles.goText}>{busy ? "Saving…" : "Continue to LIVE preview"}</Text></Pressable>
      <Text style={styles.footer}>TwiTok LIVE Studio • up to 15 guests • scenes • effects • moderation • gifts</Text>
    </ScrollView>
  </View>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <View style={styles.toggle}><Text style={styles.label}>{label}</Text><Switch value={value} onValueChange={onChange} /></View>;
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:"#070707"}, center:{flex:1,backgroundColor:"#070707",alignItems:"center",justifyContent:"center",padding:24},
  header:{paddingTop:54,paddingHorizontal:16,paddingBottom:12,flexDirection:"row",alignItems:"center",gap:12,borderBottomWidth:1,borderBottomColor:"#202020"},
  title:{color:"#fff",fontSize:20,fontWeight:"900",textAlign:"center"},
  back:{color:"#fff",fontSize:36,lineHeight:36},headerTitle:{color:"#fff",fontSize:20,fontWeight:"900"},headerSub:{color:"#888",fontSize:11,marginTop:2},liveDot:{color:"#ff2d55",fontSize:18,marginLeft:"auto"},
  content:{padding:14,paddingBottom:35},hero:{height:310,borderRadius:22,overflow:"hidden",backgroundColor:"#171717",borderWidth:1,borderColor:"#2b2b2b",marginBottom:16},
  sceneFill:{flex:1,alignItems:"center",justifyContent:"center",backgroundColor:"#1c1c2c"},sceneIcon:{fontSize:48},sceneTitle:{color:"#fff",fontSize:19,fontWeight:"900",marginTop:8},
  sceneOverlay:{position:"absolute",left:12,right:12,bottom:12,backgroundColor:"rgba(0,0,0,.62)",borderRadius:14,padding:10},
  stickerPreview:{color:"#fff",fontSize:22,marginTop:5},sceneBadge:{color:"#ff6b87",fontSize:10,fontWeight:"900"},sceneCaption:{color:"#fff",fontSize:11,marginTop:4},
  section:{backgroundColor:"#111",borderRadius:18,padding:14,marginBottom:12,borderWidth:1,borderColor:"#242424"},sectionTitle:{color:"#fff",fontSize:15,fontWeight:"900",marginBottom:11},
  row:{gap:8},choice:{width:100,height:82,borderRadius:14,backgroundColor:"#1b1b1b",borderWidth:1,borderColor:"#303030",alignItems:"center",justifyContent:"center"},choiceActive:{borderColor:"#ff2d55",backgroundColor:"#241116"},choiceIcon:{color:"#fff",fontSize:22},choiceText:{color:"#ddd",fontSize:10,fontWeight:"800",marginTop:6,textAlign:"center"},note:{color:"#777",fontSize:10,lineHeight:15,marginTop:10},
  pill:{paddingHorizontal:13,paddingVertical:9,borderRadius:20,backgroundColor:"#1d1d1d",borderWidth:1,borderColor:"#303030",marginRight:7,marginBottom:7},pillActive:{backgroundColor:"#ff2d55",borderColor:"#ff2d55"},pillText:{color:"#fff",fontSize:11,fontWeight:"900"},
  wrap:{flexDirection:"row",flexWrap:"wrap"},
  stickerGrid:{flexDirection:"row",flexWrap:"wrap",gap:7},sticker:{width:42,height:42,borderRadius:13,backgroundColor:"#1d1d1d",borderWidth:1,borderColor:"#303030",alignItems:"center",justifyContent:"center"},stickerActive:{borderColor:"#ff2d55",backgroundColor:"#241116"},stickerText:{fontSize:21},sliderRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingVertical:9},label:{color:"#fff",fontSize:12,fontWeight:"800"},number:{width:70,backgroundColor:"#1d1d1d",borderRadius:10,color:"#fff",paddingVertical:8,paddingHorizontal:10,textAlign:"center",borderWidth:1,borderColor:"#333"},percent:{color:"#888",marginLeft:-36,marginRight:12},toggle:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingVertical:7},
  error:{color:"#ff91a8",fontSize:12,fontWeight:"800",marginBottom:10},go:{backgroundColor:"#ff2d55",borderRadius:26,paddingVertical:16,alignItems:"center"},goText:{color:"#fff",fontSize:15,fontWeight:"900"},footer:{color:"#666",fontSize:10,textAlign:"center",marginTop:12}
});
