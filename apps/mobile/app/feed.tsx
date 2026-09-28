import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Dimensions, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";

type Video = {
  id: string;
  caption: string;
  ownerId?: string;
  playback?: { mp4Url?: string; hlsUrl?: string } | null;
  thumbnail?: string | null;
};

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
const TOKEN = process.env.EXPO_PUBLIC_TWITOK_AUTH_TOKEN ?? "";
const { height, width } = Dimensions.get("window");

function VideoCard({ item, active, onEvent }: { item: Video; active: boolean; onEvent: (type: string, watchMs?: number) => void }) {
  const source = item.playback?.hlsUrl || item.playback?.mp4Url || null;
  const startedAt = useRef<number | null>(null);
  const player = useVideoPlayer(source, p => {
    p.loop = true;
    if (active && source) p.play();
  });

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
    return <View style={styles.video}><Text style={styles.unavailable}>Video playback unavailable</Text><Overlay item={item} /></View>;
  }

  return (
    <View style={styles.video}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      <Overlay item={item} />
    </View>
  );
}

function Overlay({ item }: { item: Video }) {
  return (
    <>
      <View style={styles.scrim} />
      <View style={styles.rightRail}>
        <Pressable style={styles.action}><Text style={styles.actionIcon}>♡</Text><Text style={styles.actionLabel}>Like</Text></Pressable>
        <Pressable style={styles.action}><Text style={styles.actionIcon}>○</Text><Text style={styles.actionLabel}>Comment</Text></Pressable>
        <Pressable style={styles.action}><Text style={styles.actionIcon}>↗</Text><Text style={styles.actionLabel}>Share</Text></Pressable>
      </View>
      <View style={styles.meta}>
        <Text style={styles.username}>@twitok</Text>
        <Text style={styles.caption} numberOfLines={4}>{item.caption || "TwiTok video"}</Text>
      </View>
      <View style={styles.bottomTabs}><Text style={styles.tabActive}>You</Text><Text style={styles.tab}>Following</Text><Text style={styles.tab}>Explore Africa</Text></View>
    </>
  );
}

export default function FeedScreen() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const headers: Record<string, string> = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
    fetch(API + "/feed/FOR_YOU?limit=10", { headers })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error ?? "Feed unavailable");
        return data;
      })
      .then(data => { if (active) setVideos(data.videos ?? data.items ?? []); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "Feed unavailable"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const recordEvent = async (videoId: string, type: string, watchMs?: number) => {
    if (!TOKEN) return;
    try {
      await fetch(API + "/feed/events", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ videoId, type, watchMs, sessionId: `mobile-${Date.now()}` })
      });
    } catch {}
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color="#fff" /><Text style={styles.muted}>Loading For You…</Text></View>;

  if (error) return <View style={styles.center}><Text style={styles.error}>{error}</Text><Text style={styles.muted}>Set EXPO_PUBLIC_TWITOK_AUTH_TOKEN for an authenticated mobile session.</Text></View>;

  return (
    <FlatList
      data={videos}
      keyExtractor={item => item.id}
      pagingEnabled
      showsVerticalScrollIndicator={false}
      onMomentumScrollEnd={event => setActiveIndex(Math.round(event.nativeEvent.contentOffset.y / height))}
      renderItem={({ item, index }) => <VideoCard item={item} active={index === activeIndex} onEvent={(type, watchMs) => recordEvent(item.id, type, watchMs)} />}
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
