import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { AudioSession, LiveKitRoom, VideoTrack, useTracks } from "@livekit/react-native";
import { Track } from "livekit-client";
import { router, useLocalSearchParams } from "expo-router";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
type LiveComment = { commentId?: string; userId?: string; text: string; createdAt?: string };
type Gift = { giftId: string; name: string; coins: number; emoji: string };
const GIFTS: Gift[] = [
  { giftId:"rose",name:"Rose",coins:3,emoji:"🌹" },
  { giftId:"heart",name:"Heart",coins:4,emoji:"❤️" },
  { giftId:"clap",name:"Clap",coins:8,emoji:"👏" },
  { giftId:"kente",name:"Kente",coins:24,emoji:"🧵" },
  { giftId:"gold_drum",name:"Golden Drum",coins:80,emoji:"🥁" },
  { giftId:"royal_crown",name:"Royal Crown",coins:240,emoji:"👑" }
];

function LiveKitVideoSurface() {
  const tracks = useTracks([Track.Source.Camera]);
  const camera = tracks.find(t => t.source === Track.Source.Camera);
  if (!camera) return <View style={styles.center}><ActivityIndicator color="#fff"/><Text style={styles.message}>Connecting to LIVE video…</Text></View>;
  return <VideoTrack trackRef={camera} style={StyleSheet.absoluteFill} objectFit="cover" />;
}

export default function LiveViewerScreen() {
  const { streamId, mode } = useLocalSearchParams<{ streamId?: string; mode?: string }>();
  const isHost = mode === "host";
  const [manifest, setManifest] = useState<string | null>(null);
  const [liveKitToken, setLiveKitToken] = useState<string | null>(null);
  const [liveKitUrl, setLiveKitUrl] = useState<string | null>(null);
  const [canPublish, setCanPublish] = useState(false);
  const [status, setStatus] = useState<"loading"|"live"|"waiting"|"error">("loading");
  const [message, setMessage] = useState("");
  const [viewerCount, setViewerCount] = useState(0);
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [busy, setBusy] = useState(false);
  const [giftBusy, setGiftBusy] = useState(false);
  const [giftSummary, setGiftSummary] = useState({ gifts: 0, coinsSpent: 0 });
  const [reactionSummary, setReactionSummary] = useState<Record<string, number>>({});

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
        if (!playback.ok) { setStatus("waiting"); setMessage(pd.error || "Waiting for LIVE playback…"); return; }
        setManifest(String(pd.manifestUrl));
        const room = await fetch(API + "/live/streams/" + encodeURIComponent(String(streamId)) + "/room-token", { headers });
        const roomData = await room.json().catch(() => ({}));
        if (room.ok && roomData.participantToken && roomData.serverUrl) {
          setLiveKitToken(String(roomData.participantToken));
          setLiveKitUrl(String(roomData.serverUrl));
          setCanPublish(Boolean(roomData.canPublish));
        }
        setStatus("live"); setMessage("");
      } catch (e) {
        if (alive) { setStatus("error"); setMessage(e instanceof Error ? e.message : "Unable to load LIVE"); }
      }
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [streamId]);

  useEffect(() => {
    if (!streamId || !manifest) return;
    let alive = true;
    const tokenPromise = getAuthToken();
    const refresh = async () => {
      try {
        const token = await tokenPromise;
        const headers: Record<string,string> = token ? { Authorization: "Bearer " + token } : {};
        const [commentsRes, giftsRes, reactionsRes] = await Promise.all([
          fetch(API + "/live/streams/" + encodeURIComponent(String(streamId)) + "/comments?limit=25"),
          fetch(API + "/live/streams/" + encodeURIComponent(String(streamId)) + "/gifts?limit=10"),
          fetch(API + "/live/streams/" + encodeURIComponent(String(streamId)) + "/reactions")
        ]);
        const [cd, gd, rd] = await Promise.all([
          commentsRes.json().catch(() => ({})), giftsRes.json().catch(() => ({})), reactionsRes.json().catch(() => ({}))
        ]);
        if (!alive) return;
        if (commentsRes.ok) setComments(Array.isArray(cd.comments) ? cd.comments : []);
        if (giftsRes.ok) setGiftSummary({ gifts: Number(gd.summary?.gifts ?? 0), coinsSpent: Number(gd.summary?.coinsSpent ?? 0) });
        if (reactionsRes.ok) setReactionSummary(rd.reactions ?? {});
      } catch {}
    };
    void refresh();
    const timer = setInterval(refresh, 4000);
    return () => { alive = false; clearInterval(timer); };
  }, [streamId, manifest]);

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
    void heartbeat(); timer = setInterval(heartbeat, 30000);
    return () => {
      if (timer) clearInterval(timer);
      void getAuthToken().then(token => token && fetch(API + "/live/streams/" + encodeURIComponent(String(streamId)) + "/viewer", {
        method: "DELETE", headers: { Authorization: "Bearer " + token }
      })).catch(() => {});
    };
  }, [streamId, manifest, isHost]);

  const player = useVideoPlayer(manifest, p => { p.loop = false; p.play(); });

  useEffect(() => {
    if (!liveKitToken) return;
    void AudioSession.startAudioSession();
    return () => { void AudioSession.stopAudioSession(); };
  }, [liveKitToken]);

  async function postComment() {
    const text = commentText.trim();
    if (!streamId || !text || busy) return;
    const token = await getAuthToken();
    if (!token) { Alert.alert("Sign in required", "Sign in to comment on LIVE."); return; }
    setBusy(true);
    try {
      const res = await fetch(API + "/live/streams/" + encodeURIComponent(String(streamId)) + "/comments", {
        method:"POST", headers:{ "Content-Type":"application/json", Authorization:"Bearer "+token },
        body:JSON.stringify({ text })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not post comment");
      if (data.comment) setComments(items => [...items, data.comment].slice(-25));
      setCommentText("");
    } catch (e) { Alert.alert("LIVE comment", e instanceof Error ? e.message : "Could not post comment."); }
    finally { setBusy(false); }
  }

  async function react(reaction: string) {
    if (!streamId) return;
    const token = await getAuthToken();
    if (!token) { Alert.alert("Sign in required", "Sign in to react."); return; }
    try {
      const res = await fetch(API + "/live/streams/" + encodeURIComponent(String(streamId)) + "/reaction", {
        method:"POST", headers:{ "Content-Type":"application/json", Authorization:"Bearer "+token },
        body:JSON.stringify({ reaction })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not send reaction");
      const summaryResponse = await fetch(API + "/live/streams/" + encodeURIComponent(String(streamId)) + "/reactions");
      const summaryData = await summaryResponse.json().catch(() => ({}));
      if (summaryResponse.ok) setReactionSummary(summaryData.reactions ?? {});
    } catch (e) { Alert.alert("LIVE reaction", e instanceof Error ? e.message : "Could not send reaction."); }
  }

  async function sendLiveGift(gift: Gift) {
    if (!streamId || giftBusy) return;
    const token = await getAuthToken();
    if (!token) { Alert.alert("Sign in required", "Sign in to send gifts."); return; }
    setGiftBusy(true);
    try {
      const res = await fetch(API + "/live/streams/" + encodeURIComponent(String(streamId)) + "/gifts", {
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:"Bearer "+token, "Idempotency-Key":"live-"+String(streamId)+"-"+gift.giftId+"-"+Date.now() },
        body:JSON.stringify({ giftId:gift.giftId, quantity:1 })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Gift could not be sent. Check your coin balance.");
      setGiftSummary(old => ({ ...old, gifts:old.gifts+1, coinsSpent:old.coinsSpent+Number(data.coinsSpent ?? gift.coins) }));
      Alert.alert("Gift sent", gift.emoji+" "+gift.name+" sent to the LIVE host.");
    } catch (e) { Alert.alert("LIVE gifts", e instanceof Error ? e.message : "Gift could not be sent."); }
    finally { setGiftBusy(false); }
  }

  if (!streamId) return <View style={styles.center}><Text style={styles.error}>LIVE session not found.</Text></View>;

  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    {liveKitToken && liveKitUrl && status === "live" ? <LiveKitRoom serverUrl={liveKitUrl} token={liveKitToken} connect={true} audio={canPublish} video={canPublish} options={{ adaptiveStream: true, dynacast: true }}><LiveKitVideoSurface /></LiveKitRoom> : manifest && status === "live" ? <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls={false} contentFit="cover" /> : <View style={styles.center}><ActivityIndicator color="#fff"/><Text style={styles.message}>{message || "Connecting to LIVE…"}</Text></View>}
    <View style={styles.top}>
      <Pressable onPress={() => router.back()}><Text style={styles.close}>×</Text></Pressable>
      <View><Text style={styles.live}>● LIVE</Text><Text style={styles.viewers}>{viewerCount.toLocaleString()} viewers</Text></View>
      <Pressable style={styles.shop} onPress={() => router.push({ pathname:"/live-shop", params:{ streamId:String(streamId), mode:isHost?"host":"viewer" } })}><Text style={styles.shopText}>Shop</Text></Pressable>
    </View>
    <View style={styles.overlay}>
      <View style={styles.commentList}>
        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
          {comments.slice(-8).map((c,i)=><View key={c.commentId ?? String(c.createdAt ?? i)+i} style={styles.comment}><Text style={styles.commentUser}>{(c.userId ?? "Viewer").slice(-6)}</Text><Text style={styles.commentText}>{c.text}</Text></View>)}
          {!comments.length && <Text style={styles.hint}>Join the conversation…</Text>}
        </ScrollView>
      </View>
      <View style={styles.giftStats}><Text style={styles.giftStat}>🎁 {giftSummary.gifts} gifts</Text><Text style={styles.giftStat}>🪙 {giftSummary.coinsSpent} coins</Text></View>
      <View style={styles.actions}>
        <Pressable style={styles.reaction} onPress={() => void react("LIKE")}><Text style={styles.actionText}>❤️ {Number(reactionSummary.LIKE ?? 0)}</Text></Pressable>
        <Pressable style={styles.reaction} onPress={() => void react("LOVE")}><Text style={styles.actionText}>😍</Text></Pressable>
        <Pressable style={styles.reaction} onPress={() => void react("LAUGH")}><Text style={styles.actionText}>😂</Text></Pressable>
        <Pressable style={styles.reaction} onPress={() => void react("CELEBRATE")}><Text style={styles.actionText}>🎉</Text></Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gifts}>
        {GIFTS.map(g=><Pressable key={g.giftId} style={styles.gift} disabled={giftBusy} onPress={() => void sendLiveGift(g)}><Text style={styles.giftEmoji}>{g.emoji}</Text><Text style={styles.giftName}>{g.name}</Text><Text style={styles.giftCoins}>{g.coins} coins</Text></Pressable>)}
      </ScrollView>
      <View style={styles.composer}><TextInput value={commentText} onChangeText={setCommentText} placeholder="Say something…" placeholderTextColor="#aaa" maxLength={300} style={styles.input} onSubmitEditing={() => void postComment()} returnKeyType="send"/><Pressable disabled={busy || !commentText.trim()} onPress={() => void postComment()} style={styles.send}><Text style={styles.sendText}>{busy ? "…" : "Send"}</Text></Pressable></View>
      <Text style={styles.status}>{status === "live" ? "LIVE video" : status === "waiting" ? "Waiting for broadcast" : status === "error" ? message : "Connecting…"}</Text>
    </View>
  </KeyboardAvoidingView>;
}

const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:"#000"},
 center:{flex:1,backgroundColor:"#000",alignItems:"center",justifyContent:"center",padding:25},
 message:{color:"#aaa",fontSize:13,marginTop:12,textAlign:"center"},
 error:{color:"#fff",fontSize:16,fontWeight:"800"},
 top:{position:"absolute",top:48,left:12,right:12,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
 close:{color:"#fff",fontSize:34,textShadowColor:"#000",textShadowRadius:5},
 live:{color:"#ff2d55",fontWeight:"900",fontSize:13,textShadowColor:"#000",textShadowRadius:5},
 viewers:{color:"#fff",fontSize:11,textShadowColor:"#000",textShadowRadius:5},
 shop:{backgroundColor:"rgba(255,45,85,.92)",borderRadius:18,paddingHorizontal:15,paddingVertical:8},
 shopText:{color:"#fff",fontWeight:"900",fontSize:12},
 overlay:{position:"absolute",left:12,right:12,bottom:18},
 commentList:{height:180,maxWidth:"85%",marginBottom:8,justifyContent:"flex-end"},
 comment:{alignSelf:"flex-start",backgroundColor:"rgba(0,0,0,.42)",borderRadius:12,paddingHorizontal:10,paddingVertical:6,marginTop:5,maxWidth:"100%"},
 commentUser:{color:"#ffd0da",fontSize:10,fontWeight:"900"},
 commentText:{color:"#fff",fontSize:12,marginTop:2},
 hint:{color:"#ddd",fontSize:12,marginTop:10},
 giftStats:{flexDirection:"row",gap:12,marginBottom:8},
 giftStat:{color:"#fff",fontSize:10,fontWeight:"800",backgroundColor:"rgba(0,0,0,.4)",paddingHorizontal:9,paddingVertical:5,borderRadius:12},
 actions:{flexDirection:"row",gap:8,marginBottom:9},
 reaction:{backgroundColor:"rgba(0,0,0,.55)",borderRadius:20,paddingHorizontal:11,paddingVertical:8},
 actionText:{color:"#fff",fontWeight:"900",fontSize:12},
 gifts:{gap:8,paddingVertical:4,marginBottom:7},
 gift:{alignItems:"center",justifyContent:"center",minWidth:67,backgroundColor:"rgba(20,20,20,.85)",borderColor:"#444",borderWidth:1,borderRadius:12,padding:7},
 giftEmoji:{fontSize:22},
 giftName:{color:"#fff",fontSize:9,fontWeight:"800",marginTop:3},
 giftCoins:{color:"#ffd0da",fontSize:9,marginTop:2},
 composer:{flexDirection:"row",gap:7,alignItems:"center"},
 input:{flex:1,backgroundColor:"rgba(0,0,0,.68)",borderColor:"#555",borderWidth:1,borderRadius:24,color:"#fff",paddingHorizontal:14,paddingVertical:10,fontSize:13},
 send:{backgroundColor:"#ff2d55",borderRadius:22,paddingHorizontal:15,paddingVertical:11},
 sendText:{color:"#fff",fontSize:12,fontWeight:"900"},
 status:{color:"#ddd",fontSize:10,marginTop:6,textShadowColor:"#000",textShadowRadius:5}
});
