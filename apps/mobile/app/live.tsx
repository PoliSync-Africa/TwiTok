import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LiveKitRoom, VideoTrack, useRoomContext, useTracks } from "@livekit/react-native";
import { Track } from "livekit-client";
import { getAuthToken } from "../lib/auth";
import { Colors, Typography } from "../theme/typography";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
type TokenPayload = { serverUrl: string; participantToken: string; roomName: string; streamId: string };
type Stream = { streamId: string; title: string; status: "SCHEDULED"|"LIVE"|"ENDED"; viewerCount?: number };

export default function LiveScreen() {
  const insets = useSafeAreaInsets();
  const [token, setToken] = useState<TokenPayload | null>(null);
  const [stream, setStream] = useState<Stream | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("LIVE on TwiTok");

  async function request(path: string, init: RequestInit = {}) {
    const auth = await getAuthToken();
    if (!auth) throw new Error("Sign in required");
    const r = await fetch(API + path, {
      ...init,
      headers: { Authorization: "Bearer " + auth, "Content-Type": "application/json", ...(init.headers || {}) },
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error ?? "LIVE request failed");
    return d;
  }

  async function openLive() {
    setBusy(true); setError("");
    try {
      const created = await request("/live/streams", { method: "POST", body: JSON.stringify({ title: title.trim() || "LIVE on TwiTok" }) });
      setStream(created);
      const credentials = await request("/live/streams/" + encodeURIComponent(created.streamId) + "/token", { method: "POST" });
      setToken(credentials);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to open LIVE camera.");
    } finally { setBusy(false); }
  }

  useEffect(() => { void openLive(); }, []);

  async function endLive() {
    if (!stream) { router.back(); return; }
    setBusy(true);
    try { await request("/live/streams/" + encodeURIComponent(stream.streamId) + "/status", { method: "POST", body: JSON.stringify({ status: "ENDED" }) }); }
    catch {}
    finally { setBusy(false); router.back(); }
  }

  if (busy && !token) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#fff" /><Text style={styles.loadingText}>Opening LIVE camera…</Text><Text style={styles.loadingHint}>Camera and microphone permissions will be requested automatically.</Text></View>;
  }

  if (error || !token) {
    return <View style={styles.loading}><Text style={styles.errorTitle}>LIVE unavailable</Text><Text style={styles.error}>{error || "Unable to initialize LIVE."}</Text><Pressable style={styles.primary} onPress={() => void openLive()}><Text style={styles.primaryText}>Try again</Text></Pressable><Pressable onPress={() => router.back()}><Text style={styles.cancel}>Close</Text></Pressable></View>;
  }

  return (
    <LiveKitRoom
      serverUrl={token.serverUrl}
      token={token.participantToken}
      connect
      audio
      video
      options={{ adaptiveStream: { pixelDensity: "screen" }, dynacast: true }}
      onConnected={() => {
        void request("/live/streams/" + encodeURIComponent(token.streamId) + "/status", { method: "POST", body: JSON.stringify({ status: "LIVE" }) })
          .then(setStream)
          .catch(e => setError(e instanceof Error ? e.message : "Unable to start LIVE."));
      }}
      onDisconnected={() => { if (stream?.status === "LIVE") void request("/live/streams/" + encodeURIComponent(stream.streamId) + "/status", { method: "POST", body: JSON.stringify({ status: "ENDED" }) }).catch(() => undefined); }}
    >
      <LiveBroadcastView stream={stream} onEnd={endLive} error={error} setError={setError} />
    </LiveKitRoom>
  );
}

function LiveBroadcastView({ stream, onEnd, error, setError }: { stream: Stream | null; onEnd: () => void; error: string; setError: (v: string) => void }) {
  const insets = useSafeAreaInsets();
  const room = useRoomContext();
  const tracks = useTracks([Track.Source.Camera]);
  const localCamera = useMemo(() => tracks.find(t => t.participant.identity === room.localParticipant.identity), [tracks, room.localParticipant.identity]);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [facing, setFacing] = useState<"user"|"environment">("user");
  const [beauty, setBeauty] = useState(true);
  const [filter, setFilter] = useState(0);
  const [comments, setComments] = useState(true);
  const [guestPanel, setGuestPanel] = useState(false);
  const [title, setTitle] = useState(stream?.title ?? "LIVE on TwiTok");
  const [commentText, setCommentText] = useState("");
  const filters = ["Normal", "Vivid", "Warm", "Cool", "Noir"];

  async function flip() {
    try {
      const publication = room.localParticipant.getTrackPublication(Track.Source.Camera);
      if (publication?.videoTrack) {
        const next = facing === "user" ? "environment" : "user";
        await publication.videoTrack.restartTrack({ facingMode: next });
        setFacing(next);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to switch camera."); }
  }

  async function toggleMic() {
    try { await room.localParticipant.setMicrophoneEnabled(muted); setMuted(v => !v); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to change microphone."); }
  }

  async function toggleCamera() {
    try { await room.localParticipant.setCameraEnabled(cameraOff); setCameraOff(v => !v); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to change camera."); }
  }

  function sendComment() {
    if (!commentText.trim()) return;
    setCommentText("");
  }

  return (
    <View style={styles.root}>
      {localCamera ? <VideoTrack trackRef={localCamera} style={styles.video} /> : <View style={styles.videoFallback}><ActivityIndicator color="#fff" /><Text style={styles.fallbackText}>{cameraOff ? "Camera off" : "Starting camera…"}</Text></View>}
      {beauty ? <View pointerEvents="none" style={styles.beautyOverlay} /> : null}
      {filter !== 0 ? <View pointerEvents="none" style={[styles.filterOverlay, { opacity: filter === 4 ? .42 : .12 }]} /> : null}

      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={onEnd} style={styles.round}><Text style={styles.roundText}>×</Text></Pressable>
        <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE</Text><Text style={styles.viewerText}>{stream?.viewerCount ?? 0}</Text></View>
        <Pressable onPress={() => Alert.alert("LIVE settings", "LIVE controls are active. Camera, microphone, beauty, filters, guests and comments can be managed while broadcasting.")} style={styles.round}><Text style={styles.more}>•••</Text></Pressable>
      </View>

      <View style={styles.sideRail}>
        <Tool label="Flip" icon="↻" onPress={() => void flip()} />
        <Tool label={muted ? "Unmute" : "Mute"} icon={muted ? "🔇" : "🎙"} onPress={() => void toggleMic()} />
        <Tool label={beauty ? "Beauty on" : "Beauty"} icon="✦" onPress={() => setBeauty(v => !v)} />
        <Tool label={filters[filter]} icon="◉" onPress={() => setFilter(v => (v + 1) % filters.length)} />
        <Tool label="Guests" icon="♙" onPress={() => setGuestPanel(v => !v)} />
        <Tool label="Share" icon="↗" onPress={() => Alert.alert("Share LIVE", "Use your device share sheet to invite viewers.")} />
      </View>

      {guestPanel ? <View style={styles.panel}><Text style={styles.panelTitle}>LIVE guests</Text><Text style={styles.panelText}>Guest invitations are managed from the LIVE session.</Text><Pressable onPress={() => setGuestPanel(false)}><Text style={styles.panelClose}>Close</Text></Pressable></View> : null}

      {error ? <View style={[styles.errorBox, { top: insets.top + 70 }]}><Text style={styles.error}>{error}</Text></View> : null}

      <View style={styles.bottom}>
        <View style={styles.titleRow}><TextInput value={title} onChangeText={setTitle} style={styles.titleInput} placeholder="LIVE title" placeholderTextColor="#aaa" maxLength={80} /><Text style={styles.charCount}>{title.length}/80</Text></View>
        {comments ? <View style={styles.commentBox}><Text style={styles.commentPlaceholder}>Comments appear here during LIVE</Text></View> : null}
        <View style={styles.controlRow}>
          <Pressable style={styles.smallControl} onPress={() => setComments(v => !v)}><Text style={styles.controlIcon}>💬</Text><Text style={styles.controlText}>{comments ? "Comments" : "Hidden"}</Text></Pressable>
          <Pressable style={[styles.goLive, { backgroundColor: "#fe2c55" }]} onPress={onEnd}><Text style={styles.goLiveText}>End LIVE</Text></Pressable>
          <Pressable style={styles.smallControl} onPress={() => void toggleCamera()}><Text style={styles.controlIcon}>{cameraOff ? "📷" : "🚫"}</Text><Text style={styles.controlText}>{cameraOff ? "Camera" : "Hide"}</Text></Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {filters.map((name, i) => <Pressable key={name} onPress={() => setFilter(i)} style={[styles.filterChip, filter === i && styles.filterChipActive]}><Text style={filter === i ? styles.filterActiveText : styles.filterText}>{name}</Text></Pressable>)}
        </ScrollView>
        <View style={styles.chatRow}>
          <TextInput value={commentText} onChangeText={setCommentText} placeholder="Say something…" placeholderTextColor="#aaa" style={styles.chatInput} onSubmitEditing={sendComment} returnKeyType="send" />
          <Pressable onPress={sendComment} style={styles.send}><Text style={styles.sendText}>Send</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

function Tool({ label, icon, onPress }: { label: string; icon: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.tool}><View style={styles.toolIcon}><Text style={styles.toolIconText}>{icon}</Text></View><Text style={styles.toolLabel}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:"#000"},
  video:{...StyleSheet.absoluteFillObject},
  videoFallback:{...StyleSheet.absoluteFillObject,backgroundColor:"#090909",alignItems:"center",justifyContent:"center",gap:10},
  fallbackText:{color:"#fff",fontWeight:"800"},
  beautyOverlay:{...StyleSheet.absoluteFillObject,backgroundColor:"rgba(255,235,220,.035)"},
  filterOverlay:{...StyleSheet.absoluteFillObject,backgroundColor:"#8b6f62"},
  loading:{flex:1,backgroundColor:"#000",alignItems:"center",justifyContent:"center",padding:28},
  loadingText:{color:"#fff",fontSize:22,fontWeight:"900",marginTop:16},
  loadingHint:{color:"#aaa",textAlign:"center",marginTop:8,maxWidth:320},
  errorTitle:{color:"#fff",fontSize:25,fontWeight:"900",marginBottom:10},
  error:{color:"#ff8da2",textAlign:"center"},
  primary:{marginTop:20,paddingHorizontal:28,paddingVertical:14,borderRadius:24,backgroundColor:"#fff"},
  primaryText:{color:"#111",fontWeight:"900"},
  cancel:{color:"#fff",marginTop:18,fontWeight:"800"},
  top:{position:"absolute",left:14,right:14,flexDirection:"row",justifyContent:"space-between",alignItems:"center",zIndex:10},
  round:{width:42,height:42,borderRadius:21,backgroundColor:"rgba(0,0,0,.38)",alignItems:"center",justifyContent:"center"},
  roundText:{color:"#fff",fontSize:32,lineHeight:34},
  more:{color:"#fff",fontSize:17,fontWeight:"900",letterSpacing:2},
  livePill:{flexDirection:"row",alignItems:"center",gap:7,paddingHorizontal:13,paddingVertical:8,borderRadius:20,backgroundColor:"rgba(0,0,0,.5)"},
  liveDot:{width:8,height:8,borderRadius:4,backgroundColor:"#fe2c55"},
  liveText:{color:"#fff",fontWeight:"900"},
  viewerText:{color:"#ddd",fontWeight:"800"},
  sideRail:{position:"absolute",right:10,top:150,gap:15,zIndex:10},
  tool:{alignItems:"center",width:66},
  toolIcon:{width:45,height:45,borderRadius:23,backgroundColor:"rgba(0,0,0,.42)",alignItems:"center",justifyContent:"center"},
  toolIconText:{color:"#fff",fontSize:21},
  toolLabel:{color:"#fff",fontSize:10,fontWeight:"900",marginTop:3,textShadowColor:"#000",textShadowRadius:4},
  panel:{position:"absolute",right:76,top:170,width:230,padding:18,borderRadius:18,backgroundColor:"rgba(20,20,20,.94)",zIndex:20},
  panelTitle:{color:"#fff",fontSize:18,fontWeight:"900"},
  panelText:{color:"#aaa",marginTop:8,lineHeight:20},
  panelClose:{color:"#fff",fontWeight:"900",marginTop:14},
  errorBox:{position:"absolute",left:16,right:16,padding:10,borderRadius:12,backgroundColor:"rgba(70,0,10,.86)",zIndex:30},
  bottom:{position:"absolute",left:0,right:0,bottom:0,padding:12,paddingBottom:24,backgroundColor:"rgba(0,0,0,.55)",zIndex:10},
  titleRow:{flexDirection:"row",alignItems:"center"},
  titleInput:{flex:1,color:"#fff",fontWeight:"800",backgroundColor:"rgba(0,0,0,.42)",borderRadius:12,paddingHorizontal:12,paddingVertical:10},
  charCount:{color:"#aaa",fontSize:10,marginLeft:8},
  commentBox:{height:58,justifyContent:"center"},
  commentPlaceholder:{color:"rgba(255,255,255,.7)",fontSize:12},
  controlRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  smallControl:{width:82,alignItems:"center"},
  controlIcon:{fontSize:19},
  controlText:{color:"#fff",fontSize:10,fontWeight:"800",marginTop:3},
  goLive:{paddingHorizontal:30,paddingVertical:14,borderRadius:24},
  goLiveText:{color:"#fff",fontWeight:"900"},
  filterRow:{gap:8,paddingVertical:10},
  filterChip:{paddingHorizontal:13,paddingVertical:8,borderRadius:18,backgroundColor:"rgba(255,255,255,.12)"},
  filterChipActive:{backgroundColor:"#fff"},
  filterText:{color:"#fff",fontSize:11,fontWeight:"800"},
  filterActiveText:{color:"#111",fontSize:11,fontWeight:"900"},
  chatRow:{flexDirection:"row",gap:8},
  chatInput:{flex:1,color:"#fff",backgroundColor:"rgba(255,255,255,.12)",borderRadius:18,paddingHorizontal:14,paddingVertical:9},
  send:{paddingHorizontal:16,borderRadius:18,backgroundColor:"#fff",justifyContent:"center"},
  sendText:{color:"#111",fontWeight:"900"}
});
