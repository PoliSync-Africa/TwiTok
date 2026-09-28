import { useEffect, useState } from "react";
import { ActivityIndicator, Dimensions, FlatList, StyleSheet, Text, View } from "react-native";

type Video = { id: string; caption: string; playback?: { mp4Url?: string; hlsUrl?: string } | null; thumbnail?: string | null };
const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

export default function FeedScreen() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch(API + "/feed/FOR_YOU?limit=10")
      .then(async r => {
        if (!r.ok) throw new Error("Feed unavailable");
        return r.json();
      })
      .then(data => { if (active) setVideos(data.videos ?? data.items ?? []); })
      .catch(() => { if (active) setVideos([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) return <View style={styles.center}><ActivityIndicator color="#fff" /><Text style={styles.muted}>Loading For You…</Text></View>;

  return (
    <FlatList
      data={videos}
      keyExtractor={item => item.id}
      pagingEnabled
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => (
        <View style={styles.video}>
          <View style={styles.overlay}>
            <Text style={styles.caption}>{item.caption || "TwiTok video"}</Text>
            <Text style={styles.hint}>Video playback will use the shared TwiTok media pipeline.</Text>
          </View>
        </View>
      )}
      ListEmptyComponent={<View style={styles.center}><Text style={styles.muted}>No videos available yet.</Text></View>}
    />
  );
}

const { height } = Dimensions.get("window");
const styles = StyleSheet.create({
  video: { height, backgroundColor: "#050505", justifyContent: "flex-end" },
  overlay: { padding: 24, paddingBottom: 48 },
  caption: { color: "#fff", fontSize: 17, fontWeight: "600" },
  hint: { color: "#999", marginTop: 8, fontSize: 12 },
  center: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", gap: 10 },
  muted: { color: "#aaa" }
});