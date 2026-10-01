import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

export default function LiveHostScreen() {
  const { streamId } = useLocalSearchParams<{ streamId?: string }>();
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCamera] = useCameraPermissions();
  const [micPermission, requestMic] = useMicrophonePermissions();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("General");
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [facing, setFacing] = useState<"front"|"back">("front");
  const [message, setMessage] = useState("");
  const [streamKey, setStreamKey] = useState<string | null>(null);
  const [ingestUrl, setIngestUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!streamId) return;
    const load = async () => {
      const token = await getAuthToken();
      const res = await fetch(API + "/live/streams/" + encodeURIComponent(String(streamId)), {
        headers: token ? { Authorization: "Bearer " + token } : {}
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setTitle(String(data.stream?.title ?? ""));
        setCategory(String(data.stream?.category ?? "General"));
        setStarted(data.stream?.status === "LIVE");
      } else setMessage(data.error || "Unable to load LIVE.");
    };
    void load();
  }, [streamId]);

  const start = async () => {
    if (!streamId || busy) return;
    setBusy(true); setMessage("");
    try {
      const token = await getAuthToken();
      const headers: Record<string,string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = "Bearer " + token;
      if (!cameraPermission?.granted) await requestCamera();
      if (!micPermission?.granted) await requestMic();
      const ingest = await fetch(API + "/live/streams/" + encodeURIComponent(String(streamId)) + "/ingest/session", { method: "POST", headers });
      const idata = await ingest.json().catch(() => ({}));
      if (!ingest.ok) throw new Error(idata.error || "Unable to create secure ingest session.");
      const status = await fetch(API + "/live/streams/" + encodeURIComponent(String(streamId)) + "/status", {
        method: "POST", headers, body: JSON.stringify({ status: "LIVE" })
      });
      const sdata = await status.json().catch(() => ({}));
      if (!status.ok) throw new Error(sdata.error || "Unable to start LIVE.");
      setStreamKey(String(idata.streamKey));
      setIngestUrl(idata.ingestUrl ? String(idata.ingestUrl) : null);
      setStarted(true);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to start LIVE.");
    } finally { setBusy(false); }
  };

  const stop = async () => {
    if (!streamId || busy) return;
    setBusy(true);
    try {
      const token = await getAuthToken();
      const headers: Record<string,string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = "Bearer " + token;
      await fetch(API + "/live/streams/" + encodeURIComponent(String(streamId)) + "/status", {
        method: "POST", headers, body: JSON.stringify({ status: "ENDED" })
      });
      router.back();
    } finally { setBusy(false); }
  };

  if (!streamId) return <View style={styles.center}><Text style={styles.error}>LIVE session not found.</Text></View>;
  if (!cameraPermission?.granted || !micPermission?.granted) return <View style={styles.center}>
    <Text style={styles.title}>Camera & microphone needed</Text>
    <Text style={styles.muted}>TwiTok needs both to broadcast LIVE.</Text>
    <Pressable style={styles.primary} onPress={async()=>{await requestCamera();await requestMic();}}><Text style={styles.primaryText}>Allow camera & microphone</Text></Pressable>
  </View>;

  return <View style={styles.root}>
    <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} mode="video" />
    <View style={styles.scrim}/>
    <View style={styles.top}>
      <Pressable onPress={() => router.back()}><Text style={styles.close}>×</Text></Pressable>
      <View style={styles.badge}><Text style={styles.badgeText}>{started ? "● LIVE" : "LIVE PREVIEW"}</Text></View>
      <Pressable onPress={() => setFacing(f => f === "front" ? "back" : "front")}><Text style={styles.flip}>↻</Text></Pressable>
    </View>
    {!started && <View style={styles.form}>
      <TextInput value={title} onChangeText={setTitle} placeholder="LIVE title" placeholderTextColor="#999" style={styles.input}/>
      <TextInput value={category} onChangeText={setCategory} placeholder="Category" placeholderTextColor="#999" style={styles.input}/>
    </View>}
    {message ? <Text style={styles.message}>{message}</Text> : null}
    {started && <View style={styles.ingest}><Text style={styles.ingestTitle}>Secure ingest ready</Text><Text style={styles.muted}>{ingestUrl || "Connect your configured broadcaster to the ingest endpoint."}</Text><Text style={styles.key}>Stream key: {streamKey ? "••••••••••••" : "secured"}</Text></View>}
    <View style={styles.bottom}>
      {!started ? <Pressable style={styles.go} disabled={busy} onPress={() => void start()}><Text style={styles.goText}>{busy ? "Starting…" : "Go LIVE"}</Text></Pressable> :
      <Pressable style={styles.stop} disabled={busy} onPress={() => void stop()}><Text style={styles.stopText}>{busy ? "Ending…" : "End LIVE"}</Text></Pressable>}
    </View>
  </View>;
}

const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:"#000"},
 scrim:{...StyleSheet.absoluteFillObject,backgroundColor:"rgba(0,0,0,.18)"},
 center:{flex:1,backgroundColor:"#000",alignItems:"center",justifyContent:"center",padding:25},
 title:{color:"#fff",fontSize:20,fontWeight:"900",textAlign:"center"},
 error:{color:"#fff",fontSize:16,fontWeight:"800"},
 muted:{color:"#aaa",fontSize:12,textAlign:"center",marginTop:8},
 top:{position:"absolute",top:52,left:14,right:14,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
 close:{color:"#fff",fontSize:36,textShadowColor:"#000",textShadowRadius:6},
 flip:{color:"#fff",fontSize:30,textShadowColor:"#000",textShadowRadius:6},
 badge:{backgroundColor:"rgba(0,0,0,.55)",borderRadius:18,paddingHorizontal:14,paddingVertical:8},
 badgeText:{color:"#fff",fontWeight:"900",fontSize:12},
 form:{position:"absolute",left:16,right:16,bottom:140,gap:10},
 input:{backgroundColor:"rgba(0,0,0,.65)",borderRadius:12,color:"#fff",padding:13,borderWidth:1,borderColor:"#555"},
 message:{position:"absolute",left:20,right:20,bottom:115,color:"#ffb3c1",textAlign:"center",fontSize:12,fontWeight:"800"},
 ingest:{position:"absolute",left:16,right:16,bottom:130,backgroundColor:"rgba(0,0,0,.65)",borderRadius:14,padding:12},
 ingestTitle:{color:"#fff",fontWeight:"900",fontSize:13,textAlign:"center"},
 key:{color:"#fff",fontSize:11,textAlign:"center",marginTop:5},
 bottom:{position:"absolute",left:20,right:20,bottom:32},
 go:{backgroundColor:"#ff2d55",borderRadius:28,paddingVertical:16,alignItems:"center"},
 goText:{color:"#fff",fontSize:17,fontWeight:"900"},
 stop:{backgroundColor:"#fff",borderRadius:28,paddingVertical:16,alignItems:"center"},
 stopText:{color:"#000",fontSize:16,fontWeight:"900"},
 primary:{backgroundColor:"#ff2d55",borderRadius:12,paddingHorizontal:20,paddingVertical:13,marginTop:18},
 primaryText:{color:"#fff",fontWeight:"900"}
});
