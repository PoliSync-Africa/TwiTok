import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { router, useLocalSearchParams } from "expo-router";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

export default function LiveViewerScreen() {
  const { streamId, mode } = useLocalSearchParams<{ streamId?: string; mode?: string }>();
  const isHost = mode === "host";
  const [manifest, setManifest] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading"|"live"|"waiting"|"error">("loading");
  const [message, setMessage] = useState("");
  const [viewerCount, setViewerCount] = useState(0);

  useEffect(() => {
    if (!streamId) { setStatus("error"); setMessage("LIVE session not found."); return; }
    let alive = true;
    const load = async () => {
      try {
        const token = await getAuthToken();
        const headers: Record<string,string> = token ? { Authorization: "Bearer " + token } : {};
        const info = await fetch(API + "/live/streams/" + encodeURIComponent(String(streamId)), { headers });
        const data = await info.json().catch(() => ({}));
        if (!info.ok) throw new Error(data.error || "LIVE stream not found");
        if (!alive) return;
        setViewerCount(Number(data.stream?.viewerCount ?? 0));
        if (data.stream?.status !== "LIVE") {
          setStatus("waiting"); setMessage("This LIVE hasn't started yet."); return;
        }
        const playback = await fetch(API + "/live/streams/" + encodeURIComponent(String(streamId)) + "/playback");
        const pd = await playback.json().catch(() => ({}));
        if (!alive) return;
        if (!playback.ok) {
          setStatus("waiting");
          setMessage(pd.error || "Waiting for LIVE playback…");
          return;
        }
        setManifest(String(pd.manifestUrl));
        setStatus("live");
      } catch (e) {
        if (alive) { setStatus("error"); setMessage(e instanceof Error ? e.message : "Unable to load LIVE"); }
      }
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [streamId]);

  useEffect(() => {
    if (!streamId || !manifest || isHost) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const heartbeat = async () => {
      const token = await getAuthToken();
      if (!token) return;
      await fetch(API + "/live/streams/" + encodeURIComponent(String(streamId)) + "/viewer/heartbeat", {
        method: "POST", headers: { Authorization: "Bearer " + token }
      }).catch(() => {});
    };
    void heartbeat();
    timer = setInterval(heartbeat, 30000);
    return () => { if (timer) clearInterval(timer); };
  }, [streamId, manifest, isHost]);

  const player = useVideoPlayer(manifest, p => { p.loop = false; p.play(); });

  if (!streamId) return <View style={styles.center}><Text style={styles.error}>LIVE session not found.</Text></View>;

  return <View style={styles.root}>
    {manifest && status === "live" ? <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls={false} contentFit="cover" /> : <View style={styles.center}><ActivityIndicator color="#fff"/><Text style={styles.message}>{message || "Connecting to LIVE…"}</Text></View>}
    <View style={styles.top}><Pressable onPress={() => router.back()}><Text style={styles.close}>×</Text></Pressable><View><Text style={styles.live}>● LIVE</Text><Text style={styles.viewers}>{viewerCount.toLocaleString()} viewers</Text></View><View style={{width:40}}/></View>
    <View style={styles.bottom}><Text style={styles.protocol}>{status === "live" ? "LIVE video" : "Waiting for broadcast"}</Text></View>
  </View>;
}

const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:"#000"},
 center:{flex:1,backgroundColor:"#000",alignItems:"center",justifyContent:"center",padding:25},
 message:{color:"#aaa",fontSize:13,marginTop:12,textAlign:"center"},
 error:{color:"#fff",fontSize:16,fontWeight:"800"},
 top:{position:"absolute",top:52,left:12,right:12,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
 close:{color:"#fff",fontSize:34,textShadowColor:"#000",textShadowRadius:5},
 live:{color:"#ff2d55",fontWeight:"900",fontSize:13,textShadowColor:"#000",textShadowRadius:5},
 viewers:{color:"#fff",fontSize:11,textShadowColor:"#000",textShadowRadius:5},
 bottom:{position:"absolute",left:14,right:14,bottom:30},
 protocol:{color:"#fff",fontSize:11,fontWeight:"800",textShadowColor:"#000",textShadowRadius:5}
});
