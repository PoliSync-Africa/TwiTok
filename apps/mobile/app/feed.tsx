import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Dimensions, FlatList, Image, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { getAuthToken } from "../lib/auth";
import { useLocalSearchParams } from "expo-router";
import { router } from "expo-router";

type Video = {
  id: string;
  caption: string;
  ownerId?: string;
  owner?: { username?: string; nickname?: string; countryCode?: string; isVerified?: boolean; verificationType?: string|null } | null;
  playback?: { mp4Url?: string; hlsUrl?: string } | null;
  thumbnail?: string | null;
  mediaType?: "VIDEO"|"PHOTO"|"TEXT";
  photos?: string[];
  textBody?: string;
  sound?: { id: string; title?: string; artist?: string; coverUrl?: string | null } | null;
  promoted?: boolean;
  promotionObjective?: string | null;
};

type Engagement = { likeCount:number; commentCount:number; shareCount:number; saveCount:number; repostCount:number; liked:boolean; saved:boolean; reposted:boolean };

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
const { height, width } = Dimensions.get("window");

function VideoCard({ item, active, onEvent, surface, onSurface, onNotInterested }: { item: Video; active: boolean; onEvent: (type: string, watchMs?: number) => void; surface: "FOR_YOU"|"FOLLOWING"|"AFRICA"; onSurface: (surface: "FOR_YOU"|"FOLLOWING"|"AFRICA") => void; onNotInterested: () => void }) {
  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [busy, setBusy] = useState(false);
  const [heartBurst, setHeartBurst] = useState(false);
  const lastTap = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [speedHold, setSpeedHold] = useState(false);
  const source = item.playback?.hlsUrl || item.playback?.mp4Url || null;
  const startedAt = useRef<number | null>(null);
  const player = useVideoPlayer(source, p => {
    p.loop = true;
    if (active && source) p.play();
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const r = await fetch(API + "/engagement/" + item.id, { headers: { Authorization: "Bearer " + token } });
        const d = await r.json().catch(() => ({}));
        if (alive && r.ok) setEngagement(d);
      } catch {}
    })();
    return () => { alive = false; };
  }, [item.id]);

  function handleLongPress() {
    if (!source) return;
    if (singleTapTimer.current) {
      clearTimeout(singleTapTimer.current);
      singleTapTimer.current = null;
    }
    player.playbackRate = 2;
    setSpeedHold(true);
  }

  function handleRelease() {
    if (!source) return;
    player.playbackRate = 1;
    setSpeedHold(false);
  }

  function handleTap() {
    const now = Date.now();
    if (now - lastTap.current < 320) {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
      singleTapTimer.current = null;
      lastTap.current = 0;
      setHeartBurst(true);
      void action("like");
      setTimeout(() => setHeartBurst(false), 650);
      return;
    }
    lastTap.current = now;
    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    singleTapTimer.current = setTimeout(() => {
      singleTapTimer.current = null;
      if (!source) return;
      if (player.playing) player.pause();
      else player.play();
    }, 320);
  }

  useEffect(() => () => {
    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
  }, []);

  async function action(kind: "like"|"save"|"share"|"repost") {
    const token = await getAuthToken();
    if (!token || busy) return;
    if (kind === "share") {
      try {
        await Share.share({ message: "Watch this on TwiTok: " + API.replace(/\/api\/v1$/, "") + "/video/" + item.id });
        const r = await fetch(API + "/engagement/" + item.id + "/share", { method: "POST", headers: { Authorization: "Bearer " + token } });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.engagement) setEngagement(d.engagement);
      } catch {}
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(API + "/engagement/" + item.id + "/" + kind, { method: "POST", headers: { Authorization: "Bearer " + token } });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.engagement) setEngagement(d.engagement);
    } catch {} finally { setBusy(false); }
  }

  useEffect(() => {
    if (!source) return;
    if (active) {
      startedAt.current = Date.now();
      player.play();
      onEvent("VIEW_START");
    } else {
      if (startedAt.current) {
        onEvent("VIEW_COMPLETE", Date.now() - startedAt.current);
        startedAt.current = null;
      }
      player.pause();
    }
  }, [active, player, source]);

  if (item.mediaType === "PHOTO") {
    return <View style={styles.video}>{item.photos?.[0] ? <Image source={{uri:item.photos[0]}} style={StyleSheet.absoluteFill} resizeMode="contain" /> : null}<View style={styles.photoStrip}>{(item.photos ?? []).slice(1).map((uri,i)=><Image key={uri+i} source={{uri}} style={styles.photoThumb} />)}</View><Pressable style={styles.doubleTapZone} onPress={handleTap} onLongPress={handleLongPress} onPressOut={handleRelease} delayLongPress={280} accessibilityLabel="Tap to pause, double tap to like, hold for 2x speed"><View pointerEvents="none" style={StyleSheet.absoluteFill} />{heartBurst ? <Text pointerEvents="none" style={styles.heartBurst}>♥</Text> : null}{speedHold ? <View pointerEvents="none" style={styles.speedBadge}><Text style={styles.speedBadgeText}>2×</Text></View> : null}</Pressable><Overlay item={item} engagement={engagement} surface={surface} onSurface={onSurface} onAction={action} onComments={() => router.push({ pathname:"/comments", params:{videoId:item.id} })} onNotInterested={onNotInterested} /></View>;
  }

  if (item.mediaType === "TEXT") {
    return <View style={styles.textPost}><Text style={styles.textBody}>{item.textBody || item.caption}</Text><Overlay item={item} engagement={engagement} surface={surface} onSurface={onSurface} onAction={action} onComments={() => router.push({ pathname:"/comments", params:{videoId:item.id} })} onNotInterested={onNotInterested} /></View>;
  }

  if (!source) {
    return <View style={styles.video}><Text style={styles.unavailable}>Video playback unavailable</Text><Pressable style={styles.doubleTapZone} onPress={handleTap} accessibilityLabel="Double tap to like"><View pointerEvents="none" style={StyleSheet.absoluteFill} />{heartBurst ? <Text pointerEvents="none" style={styles.heartBurst}>♥</Text> : null}</Pressable><Overlay item={item} engagement={engagement} surface={surface} onSurface={onSurface} onAction={action} onComments={() => router.push({ pathname: "/comments", params: { videoId: item.id } })} onNotInterested={onNotInterested} /></View>;
  }

  return (
    <View style={styles.video}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      <Overlay item={item} engagement={engagement} surface={surface} onSurface={onSurface} onAction={action} onComments={() => router.push({ pathname: "/comments", params: { videoId: item.id } })} onNotInterested={onNotInterested} />
    </View>
  );
}

function Overlay({ item, engagement, surface, onSurface, onAction, onComments, onNotInterested }: { item: Video; engagement: Engagement | null; surface: "FOR_YOU"|"FOLLOWING"|"AFRICA"; onSurface: (surface: "FOR_YOU"|"FOLLOWING"|"AFRICA") => void; onAction: (kind: "like"|"save"|"share"|"repost") => void; onComments: () => void; onNotInterested: () => void }) {
  return (
    <>
      <View style={styles.scrim} />
      <View style={styles.rightRail}>
        <Pressable style={styles.action} onPress={() => onAction("like")}><Text style={[styles.actionIcon, engagement?.liked && styles.activeIcon]}>♥</Text><Text style={styles.actionLabel}>{engagement?.likeCount ?? 0}</Text></Pressable>
        <Pressable style={styles.action} onPress={onComments}><Text style={styles.actionIcon}>○</Text><Text style={styles.actionLabel}>{engagement?.commentCount ?? 0}</Text></Pressable>
        <Pressable style={styles.action} onPress={() => onAction("save")}><Text style={[styles.actionIcon, engagement?.saved && styles.activeIcon]}>▱</Text><Text style={styles.actionLabel}>{engagement?.saveCount ?? 0}</Text></Pressable>
        <Pressable style={styles.action} onPress={() => onAction("repost")}><Text style={[styles.actionIcon, engagement?.reposted && styles.activeIcon]}>↻</Text><Text style={styles.actionLabel}>{engagement?.repostCount ?? 0}</Text></Pressable>
        <Pressable style={styles.action} onPress={() => router.push({ pathname: "/sounds", params: { videoId: item.id } })}><Text style={styles.actionIcon}>♫</Text><Text style={styles.actionLabel}>Sound</Text></Pressable>
        <Pressable style={styles.action} onPress={() => onAction("share")}><Text style={styles.actionIcon}>↗</Text><Text style={styles.actionLabel}>{engagement?.shareCount ?? 0}</Text></Pressable>
        <Pressable style={styles.action} onPress={onNotInterested}><Text style={styles.actionIcon}>⋯</Text><Text style={styles.actionLabel}>More</Text></Pressable>
      </View>
      <View style={styles.meta}>
        {item.promoted ? <View style={styles.promotedBadge}><Text style={styles.promotedText}>Sponsored · Promoted</Text></View> : null}
        <Pressable onPress={() => item.owner?.username && router.push({ pathname: "/profile", params: { username: item.owner.username } })}><View style={styles.usernameRow}><Text style={styles.username}>@{item.owner?.username || "twitok"}</Text>{item.owner?.isVerified&&<View style={styles.feedVerified}><Text style={styles.feedVerifiedCheck}>✓</Text></View>}</View></Pressable>
        <Text style={styles.caption} numberOfLines={4}>{item.caption || "TwiTok video"}</Text>
        {item.sound ? <Pressable style={styles.soundMeta} onPress={() => router.push({ pathname: "/sounds", params: { videoId: item.id } })}><Text style={styles.soundDisc}>♫</Text><Text style={styles.soundText} numberOfLines={1}>{item.sound.title || "Original sound"}{item.sound.artist ? " · " + item.sound.artist : ""}</Text></Pressable> : null}
      </View>
      <View style={styles.bottomTabs}><Pressable style={styles.createButton} onPress={() => router.push("/create")}><Text style={styles.createPlus}>＋</Text></Pressable><Pressable onPress={() => onSurface("FOR_YOU")}><Text style={surface==="FOR_YOU"?styles.tabActive:styles.tab}>You</Text></Pressable><Pressable onPress={() => onSurface("FOLLOWING")}><Text style={surface==="FOLLOWING"?styles.tabActive:styles.tab}>Following</Text></Pressable><Pressable onPress={() => onSurface("AFRICA")}><Text style={surface==="AFRICA"?styles.tabActive:styles.tab}>Explore Africa</Text></Pressable></View>
    </>
  );
}

export default function FeedScreen() {
  const { videoId: requestedVideoId } = useLocalSearchParams<{ videoId?: string }>();
  const [videos, setVideos] = useState<Video[]>([]);
  const [surface, setSurface] = useState<"FOR_YOU"|"FOLLOWING"|"AFRICA">("FOR_YOU");
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setActiveIndex(0); setNextCursor(null);
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token) throw new Error("Sign in to view your feed.");
        const r = await fetch(API + "/feed/" + surface + "?limit=10", { headers: { Authorization: `Bearer ${token}` } });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error ?? "Feed unavailable");
        if (active) {
          const nextVideos = data.videos ?? data.items ?? [];
          setVideos(nextVideos);
          const requestedIndex = requestedVideoId ? nextVideos.findIndex((video: Video) => video.id === String(requestedVideoId)) : -1;
          setActiveIndex(requestedIndex >= 0 ? requestedIndex : 0);
          setNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Feed unavailable");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [surface]);

  const recordEvent = async (videoId: string, type: string, watchMs?: number) => {
    try {
      const token = await getAuthToken();
      if (!token) return;
      await fetch(API + "/feed/events", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ videoId, type, watchMs, sessionId: `mobile-${Date.now()}`, source: surface })
      });
    } catch {}
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color="#fff" /><Text style={styles.muted}>Loading For You…</Text></View>;

  if (error) return <View style={styles.center}><Text style={styles.error}>{error}</Text><Text style={styles.muted}>Return to the home screen and sign in to continue.</Text></View>;

  async function loadMore() {
    if (loading || loadingMore || !nextCursor) return;
    setLoadingMore(true);
    try {
      const token = await getAuthToken();
      if (!token) return;
      const r = await fetch(API + "/feed/" + surface + "?limit=10&cursor=" + encodeURIComponent(nextCursor), { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return;
      setVideos(current => {
        const existing = new Set(current.map(item => item.id));
        return [...current, ...(data.videos ?? data.items ?? []).filter((item: Video) => !existing.has(item.id))];
      });
      setNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <FlatList
      data={videos}
      keyExtractor={item => item.id}
      pagingEnabled
      showsVerticalScrollIndicator={false}
      onMomentumScrollEnd={event => setActiveIndex(Math.round(event.nativeEvent.contentOffset.y / height))}
      onEndReached={loadMore}
      onEndReachedThreshold={0.7}
      ListFooterComponent={loadingMore ? <View style={styles.feedFooter}><ActivityIndicator color="#fff" /><Text style={styles.muted}>Loading more…</Text></View> : null}
      renderItem={({ item, index }) => <VideoCard item={item} active={index === activeIndex} surface={surface} onSurface={setSurface} onEvent={(type, watchMs) => recordEvent(item.id, type, watchMs)} onNotInterested={async () => { await recordEvent(item.id, "NOT_INTERESTED"); setVideos(v => v.filter(x => x.id !== item.id)); }} />}
      getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
      ListEmptyComponent={<View style={styles.center}><Text style={styles.muted}>No videos available yet.</Text></View>}
    />
  );
}

const styles = StyleSheet.create({
  video: { height, width, backgroundColor: "#050505", justifyContent: "flex-end" },
  photoStrip:{position:"absolute",top:70,left:12,right:12,flexDirection:"row",gap:6},photoThumb:{width:48,height:64,borderRadius:6},textPost:{height,width,backgroundColor:"#171717",justifyContent:"center",alignItems:"center",padding:40},textBody:{color:"#fff",fontSize:28,lineHeight:36,textAlign:"center",fontWeight:"700"} ,
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.18)" },
  doubleTapZone: { position: "absolute", left: 0, right: 82, top: 45, bottom: 125, alignItems: "center", justifyContent: "center", zIndex: 5 },
  heartBurst: { color: "#fff", fontSize: 92, fontWeight: "900", textShadowColor: "#ff2d55", textShadowRadius: 16, opacity: 0.95 },
  speedBadge: { backgroundColor: "rgba(0,0,0,0.68)", paddingHorizontal: 16, paddingVertical: 9, borderRadius: 22 },
  speedBadgeText: { color: "#fff", fontSize: 18, fontWeight: "900" },
  rightRail: { position: "absolute", right: 14, bottom: 105, alignItems: "center", gap: 18 },
  action: { alignItems: "center", minWidth: 52 },
  actionIcon: { color: "#fff", fontSize: 34, fontWeight: "300", textShadowColor: "#000", textShadowRadius: 4 },
  actionLabel: { color: "#fff", fontSize: 11, marginTop: 2, textShadowColor: "#000", textShadowRadius: 4 },
  activeIcon: { color: "#ff2d55" },
  meta: { position: "absolute", left: 16, right: 82, bottom: 92 },
  usernameRow:{flexDirection:"row",alignItems:"center",gap:5},
  feedVerified:{width:17,height:17,borderRadius:8.5,backgroundColor:"#1877F2",alignItems:"center",justifyContent:"center"},feedVerifiedCheck:{color:"#fff",fontSize:11,fontWeight:"900",lineHeight:13},
  username: { color: "#fff", fontSize: 16, fontWeight: "800", marginBottom: 7 },
  caption: { color: "#fff", fontSize: 15, lineHeight: 21 },
  soundMeta: { flexDirection: "row", alignItems: "center", marginTop: 10, maxWidth: "88%" },
  soundDisc: { color: "#fff", fontSize: 18, fontWeight: "800", marginRight: 7 },
  soundText: { color: "#fff", fontSize: 13, fontWeight: "700", flexShrink: 1 },
  unavailable: { color: "#aaa", textAlign: "center", marginBottom: height * 0.45 },
  bottomTabs: { position: "absolute", bottom: 20, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 30 },
  createButton: { position: "absolute", bottom: -6, alignSelf: "center", width: 48, height: 34, borderRadius: 9, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  createPlus: { color: "#000", fontSize: 25, lineHeight: 28, fontWeight: "700" },
  tabActive: { color: "#fff", fontWeight: "800", fontSize: 13 },
  promotedBadge:{alignSelf:"flex-start",backgroundColor:"rgba(0,0,0,0.72)",borderRadius:7,paddingHorizontal:9,paddingVertical:5,marginBottom:7},
  promotedText:{color:"#fff",fontSize:12,fontWeight:"800"},
  tab: { color: "#aaa", fontSize: 13 },
  feedFooter:{height:80,backgroundColor:"#000",alignItems:"center",justifyContent:"center",gap:6},
  center: { flex: 1, minHeight: height, backgroundColor: "#000", alignItems: "center", justifyContent: "center", padding: 24, gap: 10 },
  muted: { color: "#aaa", textAlign: "center" },
  error: { color: "#ff5b6e", textAlign: "center", fontSize: 16, fontWeight: "700" }
});
