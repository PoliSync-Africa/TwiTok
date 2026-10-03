import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getAuthToken } from "../lib/auth";
import { Colors, Typography } from "../theme/typography";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

type UserResult = { id: string; username: string; nickname?: string; avatarUrl?: string | null };
type VideoResult = {
  id: string;
  caption?: string;
  hashtags?: string[];
  thumbnail?: string | null;
  playback?: { mp4Url?: string; hlsUrl?: string } | null;
  sound?: { title?: string; artist?: string } | null;
};

type Tab = "ALL" | "VIDEOS" | "USERS" | "SOUNDS" | "HASHTAGS";

const tabs: Array<{ key: Tab; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "VIDEOS", label: "Videos" },
  { key: "USERS", label: "Users" },
  { key: "SOUNDS", label: "Sounds" },
  { key: "HASHTAGS", label: "Hashtags" },
];

const categories = [
  ["🔥", "Trending in Africa"], ["♫", "African Music"], ["🌍", "Culture & Heritage"],
  ["😂", "Comedy"], ["🎓", "Education"], ["📰", "News"], ["🍲", "Food & Lifestyle"], ["✈️", "Travel & Tourism"],
] as const;

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("ALL");
  const [users, setUsers] = useState<UserResult[]>([]);
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setUsers([]);
      setVideos([]);
      setError("");
      setTab("ALL");
      return;
    }

    const timer = setTimeout(async () => {
      const token = await getAuthToken();
      if (!token) {
        setError("Sign in required");
        return;
      }
      setBusy(true);
      setError("");
      try {
        const r = await fetch(API + "/search?q=" + encodeURIComponent(q) + "&limit=30", {
          headers: { Authorization: "Bearer " + token },
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "Search failed");
        setUsers(Array.isArray(d.users) ? d.users : []);
        setVideos(Array.isArray(d.videos) ? d.videos : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed");
      } finally {
        setBusy(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [query]);

  const sounds = useMemo(() => {
    const seen = new Set<string>();
    return videos.flatMap(video => {
      const title = video.sound?.title?.trim();
      if (!title) return [];
      const key = title.toLowerCase() + "|" + (video.sound?.artist ?? "").toLowerCase();
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ title, artist: video.sound?.artist ?? "Original sound", videoId: video.id }];
    });
  }, [videos]);

  const hashtags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const video of videos) {
      for (const raw of video.hashtags ?? []) {
        const tag = raw.replace(/^#/, "").trim().toLowerCase();
        if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
  }, [videos]);

  const visibleVideos = tab === "VIDEOS" || tab === "ALL" ? videos : [];
  const showUsers = tab === "USERS" || tab === "ALL";
  const showSounds = tab === "SOUNDS" || tab === "ALL";
  const showHashtags = tab === "HASHTAGS" || tab === "ALL";

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Go back"><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.title}>Discover</Text>
        <View style={{ width: 30 }} />
      </View>

      <View style={styles.search}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search videos, creators, sounds, hashtags..."
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.searchInput}
          accessibilityLabel="Search TwiTok"
        />
      </View>

      {query.trim() ? (
        <>
          <FlatList
            horizontal
            data={tabs}
            keyExtractor={item => item.key}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabRow}
            renderItem={({ item }) => (
              <Pressable onPress={() => setTab(item.key)} style={[styles.tabPill, tab === item.key && styles.tabPillActive]}>
                <Text style={tab === item.key ? styles.tabTextActive : styles.tabText}>{item.label}</Text>
              </Pressable>
            )}
          />

          {busy ? <ActivityIndicator style={styles.loader} color={Colors.text} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <FlatList
            data={tab === "USERS" ? [] : visibleVideos}
            keyExtractor={item => item.id}
            numColumns={2}
            contentContainerStyle={styles.content}
            columnWrapperStyle={styles.columns}
            ListHeaderComponent={
              <View>
                <Text style={styles.heading}>Search results</Text>
                {showUsers && users.length > 0 ? (
                  <>
                    <Text style={styles.section}>Creators</Text>
                    {users.map(user => (
                      <Pressable key={user.id} style={styles.creator} onPress={() => router.push({ pathname: "/profile", params: { username: user.username } })}>
                        <View style={styles.avatar}>
                          {user.avatarUrl ? <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{(user.username || "U")[0].toUpperCase()}</Text>}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.creatorName}>@{user.username}</Text>
                          <Text style={styles.creatorSub}>{user.nickname || "TwiTok creator"}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </>
                ) : null}

                {showSounds && sounds.length > 0 ? (
                  <>
                    <Text style={styles.section}>Sounds</Text>
                    {sounds.slice(0, 6).map(sound => (
                      <Pressable key={sound.title + sound.artist} style={styles.listRow} onPress={() => router.push({ pathname: "/sounds", params: { videoId: sound.videoId } })}>
                        <View style={styles.soundIcon}><Text style={styles.soundGlyph}>♫</Text></View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.creatorName} numberOfLines={1}>{sound.title}</Text>
                          <Text style={styles.creatorSub} numberOfLines={1}>{sound.artist}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </>
                ) : null}

                {showHashtags && hashtags.length > 0 ? (
                  <>
                    <Text style={styles.section}>Hashtags</Text>
                    {hashtags.slice(0, 10).map(item => (
                      <Pressable key={item.tag} style={styles.listRow} onPress={() => setQuery("#" + item.tag)}>
                        <View style={styles.hashIcon}><Text style={styles.hashGlyph}>#</Text></View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.creatorName}>#{item.tag}</Text>
                          <Text style={styles.creatorSub}>{item.count} result{item.count === 1 ? "" : "s"}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </>
                ) : null}

                {tab === "USERS" && users.length === 0 && !busy ? <Text style={styles.empty}>No creators found.</Text> : null}
                {tab === "SOUNDS" && sounds.length === 0 && !busy ? <Text style={styles.empty}>No sounds found in these results.</Text> : null}
                {tab === "HASHTAGS" && hashtags.length === 0 && !busy ? <Text style={styles.empty}>No hashtags found.</Text> : null}
              </View>
            }
            renderItem={({ item }) => (
              <Pressable style={styles.video} onPress={() => router.push({ pathname: "/feed", params: { videoId: item.id } })}>
                {item.thumbnail ? <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} /> : <View style={styles.placeholder}><Text style={styles.placeholderText}>TwiTok</Text></View>}
                <Text style={styles.caption} numberOfLines={2}>{item.caption || "TwiTok video"}</Text>
                {item.hashtags?.length ? <Text style={styles.tags} numberOfLines={1}>{item.hashtags.map(t => "#" + t).join(" ")}</Text> : null}
              </Pressable>
            )}
            ListEmptyComponent={tab === "VIDEOS" || tab === "ALL" ? (!busy ? <Text style={styles.empty}>No videos found.</Text> : null) : null}
          />
        </>
      ) : (
        <FlatList
          data={categories}
          keyExtractor={item => item[1]}
          numColumns={2}
          contentContainerStyle={styles.content}
          columnWrapperStyle={styles.columns}
          ListHeaderComponent={<><Text style={styles.heading}>Explore Africa</Text><Text style={styles.subheading}>Discover creators, culture, music and stories from across Africa.</Text></>}
          renderItem={({ item }) => (
            <Pressable style={styles.category} onPress={() => setQuery(item[1])}>
              <Text style={styles.categoryIcon}>{item[0]}</Text>
              <Text style={styles.categoryText}>{item[1]}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { height: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: Colors.border },
  back: { color: Colors.text, fontSize: 34, lineHeight: 36 },
  title: { color: Colors.text, ...Typography.section },
  search: { margin: 14, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 },
  searchIcon: { color: Colors.textSecondary, fontSize: 22 },
  searchInput: { flex: 1, color: Colors.text, ...Typography.body, paddingVertical: 13, paddingHorizontal: 8 },
  tabRow: { paddingHorizontal: 14, gap: 8, paddingBottom: 4 },
  tabPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  tabPillActive: { backgroundColor: Colors.text, borderColor: Colors.text },
  tabText: { color: Colors.textSecondary, ...Typography.captionMedium },
  tabTextActive: { color: Colors.background, ...Typography.captionMedium },
  loader: { marginVertical: 8 },
  content: { padding: 14, paddingBottom: 30 },
  columns: { gap: 12 },
  heading: { color: Colors.text, ...Typography.title, marginBottom: 6 },
  subheading: { color: Colors.textSecondary, ...Typography.body, marginBottom: 18 },
  category: { flex: 1, minHeight: 104, borderRadius: 14, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 12, justifyContent: "center" },
  categoryIcon: { fontSize: 28, marginBottom: 8 },
  categoryText: { color: Colors.text, ...Typography.bodySemibold },
  section: { color: Colors.text, ...Typography.section, marginTop: 12, marginBottom: 10 },
  creator: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  listRow: { flexDirection: "row", alignItems: "center", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.border },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surfaceRaised, alignItems: "center", justifyContent: "center", overflow: "hidden", marginRight: 12 },
  avatarImage: { width: 44, height: 44 },
  avatarText: { color: Colors.text, ...Typography.bodySemibold },
  creatorName: { color: Colors.text, ...Typography.bodySemibold },
  creatorSub: { color: Colors.textSecondary, ...Typography.caption },
  soundIcon: { width: 44, height: 44, borderRadius: 10, backgroundColor: Colors.surfaceRaised, alignItems: "center", justifyContent: "center", marginRight: 12 },
  soundGlyph: { color: Colors.text, fontSize: 23 },
  hashIcon: { width: 44, height: 44, borderRadius: 10, backgroundColor: Colors.surfaceRaised, alignItems: "center", justifyContent: "center", marginRight: 12 },
  hashGlyph: { color: Colors.text, fontSize: 22, fontWeight: "800" },
  video: { flex: 1, minWidth: 0, backgroundColor: Colors.surface, borderRadius: 10, overflow: "hidden", marginBottom: 12 },
  thumbnail: { width: "100%", aspectRatio: 0.72 },
  placeholder: { aspectRatio: 0.72, alignItems: "center", justifyContent: "center", backgroundColor: Colors.surfaceRaised },
  placeholderText: { color: Colors.text, ...Typography.section },
  caption: { color: Colors.text, ...Typography.captionMedium, padding: 9, paddingBottom: 3 },
  tags: { color: Colors.textSecondary, ...Typography.caption, paddingHorizontal: 9, paddingBottom: 9 },
  empty: { color: Colors.textSecondary, ...Typography.body, textAlign: "center", padding: 30 },
  error: { color: Colors.danger, ...Typography.caption, marginVertical: 8, paddingHorizontal: 14 },
});
