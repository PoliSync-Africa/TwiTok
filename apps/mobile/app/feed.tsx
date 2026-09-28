import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Dimensions, FlatList, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { getAuthToken } from "../lib/auth";
import { router } from "expo-router";

type Video = {
  id: string;
  caption: string;
  ownerId?: string;
  owner?: { username?: string; nickname?: string; countryCode?: string } | null;
  playback?: { mp4Url?: string; hlsUrl?: string } | null;
  thumbnail?: string | null;
};

type Engagement = { likeCount:number; commentCount:number; shareCount:number; saveCount:number; repostCount:number; liked:boolean; saved:boolean; reposted:boolean };

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
const { height, width } = Dimensions.get("window");

function VideoCard({ item, active, onEvent }: { item: Video; active: boolean; onEvent: (type: string, watchMs?: number) => void; surface: "FOR_YOU"|"FOLLOWING"|"AFRICA"; onSurface: (surface: "FOR_YOU"|"FOLLOWING"|"AFRICA") => void }) {
  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [busy, setBusy] = useState(false);
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

  if (!source) {
    return <View style={styles.video}><Text style={styles.unavailable}>Video playback unavailable</Text><Overlay item={item} engagement={engagement} surface={surface} onSurface={onSurface} onAction={action} onComments={() => router.push({ pathname: "/comments", params: { videoId: item.id } })} /></View>;
  }

  return (
    <View style={styles.video}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      <Overlay item={item} engagement={engagement} onAction={action} onComments={() => router.push({ pathname: "/comments", params: { videoId: item.id } })} />
    </View>
  );
}

function Overlay({ item, engagement, surface, onSurface, onAction, onComments }: { item: Video; engagement: Engagement | null; surface: "FOR_YOU"|"FOLLOWING"|"AFRICA"; onSurface: (surface: "FOR_YOU"|"FOLLOWING"|"AFRICA") => void; onAction: (kind: "like"|"save"|"share"|"repost") => void; onComments: () => void }) {
  return (
    <>
      <View style={styles.scrim} />
      <View style={styles.rightRail}>
        <Pressable style={styles.action} onPress={() => onAction("like")}><Text style={[styles.actionIcon, engagement?.liked && styles.activeIcon]}>♥</Text><Text style={styles.actionLabel}>{engagement?.likeCount ?? 0}</Text></Pressable>
        <Pressable style={styles.action} onPress={onComments}><Text style={styles.actionIcon}>○</Text><Text style={styles.actionLabel}>{engagement?.commentCount ?? 0}</Text></Pressable>
        <Pressable style={styles.action} onPress={() => onAction("save")}><Text style={[styles.actionIcon, engagement?.saved && styles.activeIcon]}>▱</Text><Text style={styles.actionLabel}>{engagement?.saveCount ?? 0}</Text></Pressable>
        <Pressable style={styles.action} onPress={() => onAction("repost")}><Text style={[styles.actionIcon, engagement?.reposted && styles.activeIcon]}>↻</Text><Text style={styles.actionLabel}>{engagement?.repostCount ?? 0}</Text></Pressable>
        <Pressable style={styles.action} onPress={() => onAction("share")}><Text style={styles.actionIcon}>↗</Text><Text style={styles.actionLabel}>{engagement?.shareCount ?? 0}</Text></Pressable>
      </View>
      <View style={styles.meta}>
        <Pressable onPress={() => item.owner?.username && router.push({ pathname: "/profile", params: { username: item.owner.username } })}><Text style={styles.username}>@{item.owner?.username || "twitok"}</Text></Pressable>
        <Text style={styles.caption} numberOfLines={4}>{item.caption || "TwiTok video"}</Text>
      </View>
      <View style={styles.bottomTabs}><Pressable onPress={() => onSurface("FOR_YOU")}><Text style={surface==="FOR_YOU"?styles.tabActive:styles.tab}>You</Text></Pressable><Pressable onPress={() => onSurface("FOLLOWING")}><Text style={surface==="FOLLOWING"?styles.tabActive:styles.tab}>Following</Text></Pressable><Pressable onPress={() => onSurface("AFRICA")}><Text style={surface==="AFRICA"?styles.tabActive:styles.tab}>Explore Africa</Text></Pressable></View>
    </>
  );
}

export default function FeedScreen() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [surface, setSurface] = useState<"FOR_YOU"|"FOLLOWING"|"AFRICA">("FOR_YOU");
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setActiveIndex(0);
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token) throw new Error("Sign in to view your feed.");
        const r = await fetch(API + "/feed/" + surface + "?limit=10", { headers: { Authorization: `Bearer ${token}` } });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error ?? "Feed unavailable");
        if (active) setVideos(data.videos ?? data.items ?? []);
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
        body: JSON.stringify({ videoId, type, watchMs, sessionId: `mobile-${Date.now()}` })
      });
    } catch {}
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color="#fff" /><Text style={styles.muted}>Loading For You…</Text></View>;

  if (error) return <View style={styles.center}><Text style={styles.error}>{error}</Text><Text style={styles.muted}>Return to the home screen and sign in to continue.</Text></View>;

  return (
    <FlatList
      data={videos}
      keyExtractor={item => item.id}
      pagingEnabled
      showsVerticalScrollIndicator={false}
      onMomentumScrollEnd={event => setActiveIndex(Math.round(event.nativeEvent.contentOffset.y / height))}
      renderItem={({ item, index }) => <VideoCard item={item} active={index === activeIndex} surface={surface} onSurface={setSurface} onEvent={(type, watchMs) => recordEvent(item.id, type, watchMs)} />}
      getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
      ListEmptyComponent={<View style={styles.center}><Text style={styles.muted}>No videos available yet.</Text></View>}
    />
  );
}

const styles = StyleSheet.create({
  video: { height, width, backgroundColor: "#050505", justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.18)" },
  rightRail: { position: "absolute", right: 14, bottom: 105, alignItems: "center", gap: 18 },
  action: { alignItems: "center", minWidth: 52 },
  actionIcon: { color: "#fff", fontSize: 34, fontWeight: "300", textShadowColor: "#000", textShadowRadius: 4 },
  actionLabel: { color: "#fff", fontSize: 11, marginTop: 2, textShadowColor: "#000", textShadowRadius: 4 },
  activeIcon: { color: "#ff2d55" },
  meta: { position: "absolute", left: 16, right: 82, bottom: 92 },
  username: { color: "#fff", fontSize: 16, fontWeight: "800", marginBottom: 7 },
  caption: { color: "#fff", fontSize: 15, lineHeight: 21 },
  unavailable: { color: "#aaa", textAlign: "center", marginBottom: height * 0.45 },
  bottomTabs: { position: "absolute", bottom: 20, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 30 },
  tabActive: { color: "#fff", fontWeight: "800", fontSize: 13 },
  tab: { color: "#aaa", fontSize: 13 },
  center: { flex: 1, minHeight: height, backgroundColor: "#000", alignItems: "center", justifyContent: "center", padding: 24, gap: 10 },
  muted: { color: "#aaa", textAlign: "center" },
  error: { color: "#ff5b6e", textAlign: "center", fontSize: 16, fontWeight: "700" }
});
