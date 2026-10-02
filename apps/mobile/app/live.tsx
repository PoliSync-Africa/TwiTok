import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { AudioSession, LiveKitRoom, VideoTrack, useTracks, isTrackReference } from "@livekit/react-native";
import { Track } from "livekit-client";
import { router, useLocalSearchParams } from "expo-router";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
type LiveComment = { commentId?: string; userId?: string; text: string; createdAt?: string };
type Gift = { giftId: string; name: string; coins: number; emoji: string };
type LiveSticker = { id: string; emoji: string; x: number; y: number; scale: number; rotation: number; animation?: "NONE" | "BOUNCE" | "PULSE" | "FLOAT" };
type LiveStudioOverlay = { filter?: string; stickers?: LiveSticker[] };

function normalizeLiveStickers(items: unknown): LiveSticker[] {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 32).map((item, index) => {
    if (typeof item === "string") return { id: item + "-" + index, emoji: item, x: 50, y: 30 + (index % 4) * 14, scale: 1, rotation: 0, animation: "NONE" as const };
    const value = item as Partial<LiveSticker>;
    return {
      id: String(value.id ?? value.emoji ?? "sticker-" + index),
      emoji: String(value.emoji ?? "✨").slice(0, 16),
      x: Math.min(100, Math.max(0, Number(value.x ?? 50))),
      y: Math.min(100, Math.max(0, Number(value.y ?? 35))),
      scale: Math.min(3, Math.max(.5, Number(value.scale ?? 1))),
      rotation: Math.min(180, Math.max(-180, Number(value.rotation ?? 0))),
      animation: value.animation === "BOUNCE" || value.animation === "PULSE" || value.animation === "FLOAT" ? value.animation : "NONE"
    };
  }).filter(item => item.emoji);
}
const GIFTS: Gift[] = [
  { giftId:"rose",name:"Rose",coins:3,emoji:"🌹" },
  { giftId:"heart",name:"Heart",coins:4,emoji:"❤️" },
  { giftId:"clap",name:"Clap",coins:8,emoji:"👏" },
  { giftId:"kente",name:"Kente",coins:24,emoji:"🧵" },
  { giftId:"gold_drum",name:"Golden Drum",coins:80,emoji:"🥁" },
  { giftId:"royal_crown",name:"Royal Crown",coins:240,emoji:"👑" }
];

function LiveKitVideoSurface() {
  const tracks = useTracks([Track.Source.Camera]).filter(isTrackReference).slice(0, 16);
  if (!tracks.length) return <View style={styles.center}><ActivityIndicator color="#fff"/><Text style={styles.message}>Connecting to LIVE video…</Text></View>;
  return <View style={styles.trackGrid}>
    {tracks.map((trackRef, index) => <View key={trackRef.publication.trackSid ?? trackRef.participant.identity + "-" + index} style={tracks.length === 1 ? styles.trackSolo : styles.trackTile}>
      <VideoTrack trackRef={trackRef} style={StyleSheet.absoluteFill} objectFit="cover" />
      {tracks.length > 1 && <View style={styles.participantBadge}><Text style={styles.participantBadgeText}>{trackRef.participant.name || trackRef.participant.identity.slice(-6)}</Text></View>}
    </View>)}
  </View>;
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
  const [studioOverlay, setStudioOverlay] = useState<LiveStudioOverlay>({ filter: "NONE", stickers: [] });
  const stickerMotion = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(stickerMotion, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(stickerMotion, { toValue: 0, duration: 900, useNativeDriver: true })
    ]));
    loop.start();
    return () => loop.stop();
  }, [stickerMotion]);

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
        setStudioOverlay({
          filter: String(data.stream?.studio?.filter ?? "NONE"),
          stickers: normalizeLiveStickers(data.stream?.studio?.stickers)
        });
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
      void getAuthToken().then(token => {
        if (!token) return null;
        return fetch(API + "/live/streams/" + encodeURIComponent(String(streamId)) + "/viewer", {
          method: "DELETE", headers: { Authorization: "Bearer " + token }
        });
      }).catch(() => {});
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
    {studioOverlay.filter && studioOverlay.filter !== "NONE" && <View pointerEvents="none" style={[styles.filterOverlay, (styles as unknown as Record<string, object>)["filter_" + studioOverlay.filter] ?? styles.filterDefault]} />}
    {studioOverlay.stickers?.length ? <View pointerEvents="none" style={styles.liveStickers}>{studioOverlay.stickers.map((sticker, index) => {
      const bounce = sticker.animation === "BOUNCE" ? stickerMotion.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) : 0;
      const pulse = sticker.animation === "PULSE" ? stickerMotion.interpolate({ inputRange: [0, 1], outputRange: [sticker.scale, sticker.scale * 1.18] }) : sticker.scale;
      const float = sticker.animation === "FLOAT" ? stickerMotion.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) : 0;
      return <Animated.Text key={sticker.id + index} style={[styles.liveSticker, { left: sticker.x + "%", top: sticker.y + "%", transform: [{ translateX: -16 }, { translateY: bounce }, { translateY: float }, { scale: pulse }, { rotate: sticker.rotation + "deg" }] }]}>{sticker.emoji}</Animated.Text>;
    })}</View> : null}
    <View style={styles.top}>
      <Pressable onPress={() => router.back()}><Text style={styles.close}>×</Text></Pressable>
      <View><Text style={styles.live}>● LIVE</Text><Text style={styles.viewers}>{viewerCount.toLocaleString()} viewers</Text></View>
      {isHost && <Pressable style={styles.studioButton} onPress={() => router.push({ pathname:"/live-studio", params:{ streamId:String(streamId) } })}><Text style={styles.studioButtonText}>Studio</Text></Pressable>}
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
 filterOverlay:{position:"absolute",top:0,right:0,bottom:0,left:0,zIndex:2,pointerEvents:"none"},
 filterDefault:{backgroundColor:"rgba(255,45,85,.06)"},
 filter_CINEMATIC:{backgroundColor:"rgba(255,170,90,.10)"},filter_VINTAGE:{backgroundColor:"rgba(190,145,95,.13)"},filter_DREAM:{backgroundColor:"rgba(210,170,255,.10)"},filter_FADE:{backgroundColor:"rgba(220,220,220,.10)"},filter_SUNNY:{backgroundColor:"rgba(255,220,80,.10)"},filter_DUSK:{backgroundColor:"rgba(80,90,180,.12)"},filter_POP:{backgroundColor:"rgba(255,30,120,.10)"},filter_FILM:{backgroundColor:"rgba(40,40,40,.12)"},filter_NOIR:{backgroundColor:"rgba(0,0,0,.22)"},filter_GLOW:{backgroundColor:"rgba(255,255,210,.12)"},filter_SHARP:{backgroundColor:"rgba(255,255,255,.05)"},filter_SOFT:{backgroundColor:"rgba(230,210,255,.09)"},filter_PORTRAIT:{backgroundColor:"rgba(255,180,160,.08)"},filter_PARTY:{backgroundColor:"rgba(255,80,180,.10)"},filter_FESTIVAL:{backgroundColor:"rgba(255,210,80,.10)"},filter_GOLDEN:{backgroundColor:"rgba(255,190,70,.12)"},filter_TEAL:{backgroundColor:"rgba(0,190,180,.10)"},filter_ROSE:{backgroundColor:"rgba(255,90,130,.10)"},
 liveStickers:{position:"absolute",zIndex:3,top:0,left:0,right:0,bottom:0,pointerEvents:"none"},
 liveSticker:{position:"absolute",fontSize:30,textShadowColor:"#000",textShadowOffset:{width:1,height:1},textShadowRadius:4},
 center:{flex:1,backgroundColor:"#000",alignItems:"center",justifyContent:"center",padding:25},
 trackGrid:{flex:1,flexDirection:"row",flexWrap:"wrap",backgroundColor:"#000"},
 trackSolo:{flex:1,backgroundColor:"#000",overflow:"hidden"},
 trackTile:{width:"50%",height:"50%",backgroundColor:"#111",overflow:"hidden",borderWidth:1,borderColor:"#222"},
 participantBadge:{position:"absolute",left:7,bottom:7,backgroundColor:"rgba(0,0,0,.65)",paddingHorizontal:8,paddingVertical:4,borderRadius:10},
 participantBadgeText:{color:"#fff",fontSize:9,fontWeight:"900"},
 message:{color:"#aaa",fontSize:13,marginTop:12,textAlign:"center"},
 error:{color:"#fff",fontSize:16,fontWeight:"800"},
 top:{position:"absolute",top:48,left:12,right:12,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
 close:{color:"#fff",fontSize:34,textShadowColor:"#000",textShadowRadius:5},
 live:{color:"#ff2d55",fontWeight:"900",fontSize:13,textShadowColor:"#000",textShadowRadius:5},
 viewers:{color:"#fff",fontSize:11,textShadowColor:"#000",textShadowRadius:5},
 studioButton:{backgroundColor:"rgba(0,0,0,.62)",borderColor:"#fff",borderWidth:1,borderRadius:18,paddingHorizontal:12,paddingVertical:7},
 studioButtonText:{color:"#fff",fontWeight:"900",fontSize:11},
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
