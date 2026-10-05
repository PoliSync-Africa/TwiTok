import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { getAuthToken } from "../lib/auth";

const API =
  process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

const PROFILE_ICONS: Record<string, { ios: string; android: string; web: string }> = {
  back: { ios: "chevron.left", android: "arrow_back", web: "arrow_back" },
  share: { ios: "square.and.arrow.up", android: "share", web: "share" },
  verify: { ios: "checkmark.seal.fill", android: "verified", web: "verified" },
  settings: { ios: "gearshape.fill", android: "settings", web: "settings" },
  add: { ios: "person.badge.plus", android: "person_add", web: "person_add" },
  message: { ios: "message.fill", android: "chat_bubble", web: "chat_bubble" },
  live: { ios: "dot.radiowaves.left.and.right", android: "live_tv", web: "live_tv" },
};

function ProfileIcon({ name, size = 22, color = "#fff" }: { name: string; size?: number; color?: string }) {
  return <SymbolView name={(PROFILE_ICONS[name] ?? PROFILE_ICONS.settings) as any} tintColor={color} size={size} fallback={<Text style={{ color, fontSize: size }}>•</Text>} />;
}

type Video = {
  id: string;
  thumbnail?: string | null;
  playback?: string | null;
  caption?: string;
  status?: string;
};

type Profile = {
  id: string;
  username: string;
  nickname?: string;
  bio?: string;
  countryCode?: string;
  followers: number;
  following: number;
  likes: number;
  isFollowing: boolean;
  followPending: boolean;
  isPrivate: boolean;
  isVerified?: boolean;
  verificationType?: string | null;
  profilePhotoUrl?: string | null;
};

type Tab = "videos" | "reposts" | "liked" | "saved" | "drafts";

export default function ProfileScreen() {
  const { username: requestedUsername } =
    useLocalSearchParams<{ username?: string }>();

  const [username, setUsername] = useState<string | null>(
    requestedUsername ? String(requestedUsername) : null,
  );
  const [profile, setProfile] = useState<Profile | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [viewerId, setViewerId] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("videos");

  async function loadTabVideos(
    tab: Tab,
    targetUsername?: string,
    tokenOverride?: string | null,
  ) {
    const target = targetUsername ?? username;
    if (!target) return;

    try {
      const token =
        tokenOverride === undefined ? await getAuthToken() : tokenOverride;
      const endpoint =
        tab === "videos"
          ? "videos"
          : tab === "reposts"
            ? "reposts"
            : tab === "liked"
              ? "liked"
              : tab === "saved"
                ? "saved"
                : "drafts";

      const response = await fetch(
        API + "/profile/" + encodeURIComponent(String(target)) + "/" + endpoint,
        { headers: token ? { Authorization: "Bearer " + token } : {} },
      );
      const data = await response.json().catch(() => ({}));

      if (response.ok) setVideos(data.videos ?? []);
    } catch {
      // Keep the profile visible when a secondary tab request fails.
    }
  }

  async function loadProfile() {
    try {
      setLoading(true);
      setError("");

      const token = await getAuthToken();
      let target = username;

      if (!target) {
        if (!token) throw new Error("Sign in required");

        const meResponse = await fetch(API + "/auth/me", {
          headers: { Authorization: "Bearer " + token },
        });
        const meData = await meResponse.json().catch(() => ({}));

        target = meData.user?.username
          ? String(meData.user.username)
          : null;

        if (!target) throw new Error("Profile setup is incomplete");
        setUsername(target);
      }

      const profileResponse = await fetch(
        API + "/profile/" + encodeURIComponent(target),
        { headers: token ? { Authorization: "Bearer " + token } : {} },
      );
      const profileData = await profileResponse.json().catch(() => ({}));

      if (!profileResponse.ok) {
        throw new Error(profileData.error ?? "Profile unavailable");
      }

      setProfile(profileData.profile);

      const meResponse = await fetch(API + "/auth/me", {
        headers: token ? { Authorization: "Bearer " + token } : {},
      });
      const meData = await meResponse.json().catch(() => ({}));
      setViewerId(
        meData.user?._id?.toString?.() ||
          meData.user?.id ||
          "",
      );

      await loadTabVideos("videos", target, token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Profile unavailable");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProfile();
  }, [username]);

  async function follow() {
    if (!profile || busy) return;

    setBusy(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Sign in required");

      const method = profile.isFollowing ? "DELETE" : "POST";
      const response = await fetch(
        API + "/profile/" + encodeURIComponent(profile.username) + "/follow",
        {
          method,
          headers: { Authorization: "Bearer " + token },
        },
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to update follow");
      }

      setProfile((current) => {
        if (!current) return current;

        const followingNow = Boolean(data.following);
        const delta = followingNow
          ? 1
          : current.isFollowing
            ? -1
            : 0;

        return {
          ...current,
          isFollowing: followingNow,
          followPending: Boolean(data.pending),
          followers: Math.max(0, current.followers + delta),
        };
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update follow",
      );
    } finally {
      setBusy(false);
    }
  }

  async function publishDraft(videoId: string) {
    if (busy) return;

    setBusy(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Sign in required");

      const response = await fetch(
        API + "/video/" + encodeURIComponent(videoId) + "/publish",
        {
          method: "POST",
          headers: { Authorization: "Bearer " + token },
        },
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to publish draft");
      }

      setVideos((items) => items.filter((item) => item.id !== videoId));
      Alert.alert("Published", "Your draft is now live.");
    } catch (err) {
      Alert.alert(
        "Draft",
        err instanceof Error
          ? err.message
          : "Unable to publish this draft.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {error || "Profile unavailable"}
        </Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.linkText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const own = viewerId === profile.id;
  const tabs: Tab[] = own
    ? ["videos", "reposts", "liked", "saved", "drafts"]
    : ["videos", "reposts"];

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={styles.topIcon}
          accessibilityLabel="Go back"
        >
          <ProfileIcon name="back" size={22} />
        </Pressable>

        <Text style={styles.topTitle}>Profile</Text>

        <View style={styles.topRight}>
          <Pressable style={styles.topIcon} accessibilityLabel="Share profile">
            <ProfileIcon name="share" size={21} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.identityRow}>
          <View style={styles.identityCopy}>
            <View style={styles.nameLine}>
              <Text style={styles.nickname}>
                {profile.nickname || profile.username}
              </Text>
              {profile.isVerified ? (
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedText}>✓</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.usernameText}>@{profile.username}</Text>

            <View style={styles.statsRow}>
              <View style={styles.statBlock}>
                <Text style={styles.statValue}>{profile.following}</Text>
                <Text style={styles.statLabel}>Following</Text>
              </View>
              <View style={styles.statBlock}>
                <Text style={styles.statValue}>{profile.followers}</Text>
                <Text style={styles.statLabel}>Followers</Text>
              </View>
              <View style={styles.statBlock}>
                <Text style={styles.statValue}>{profile.likes}</Text>
                <Text style={styles.statLabel}>Likes</Text>
              </View>
            </View>
          </View>

          <View style={styles.avatar}>
            {profile.profilePhotoUrl ? (
              <Image
                source={{ uri: profile.profilePhotoUrl }}
                style={styles.avatarImage}
              />
            ) : (
              <Text style={styles.avatarText}>
                {(profile.nickname || profile.username || "?")
                  .slice(0, 1)
                  .toUpperCase()}
              </Text>
            )}
          </View>
        </View>

        {own ? (
          <View style={styles.actionRow}>
            <Pressable
              style={styles.editButton}
              onPress={() =>
                router.push({
                  pathname: "/edit-profile",
                  params: {
                    username: profile.username,
                    nickname: profile.nickname ?? "",
                    bio: profile.bio ?? "",
                    isPrivate: String(profile.isPrivate),
                  },
                })
              }
            >
              <Text style={styles.editText}>Edit profile</Text>
            </Pressable>

            <Pressable
              style={styles.iconButton}
              onPress={() => router.push("/verification")}
              accessibilityLabel="Verification"
            >
              <ProfileIcon name="verify" size={21} color="#25f4ee" />
            </Pressable>

            <Pressable
              style={styles.iconButton}
              accessibilityLabel="Settings"
            >
              <ProfileIcon name="settings" size={21} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.actionRow}>
            <Pressable
              style={styles.followButton}
              onPress={follow}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.followText}>
                  {profile.isFollowing
                    ? "Following"
                    : profile.followPending
                      ? "Requested"
                      : "Follow"}
                </Text>
              )}
            </Pressable>

            <Pressable
              style={styles.messageButton}
              onPress={() =>
                router.push({
                  pathname: "/messages",
                  params: { username: profile.username },
                })
              }
            >
              <><ProfileIcon name="message" size={17} /><Text style={styles.messageText}>Message</Text></>
            </Pressable>

            <Pressable
              style={styles.iconButton}
              accessibilityLabel="More profile actions"
            >
              <ProfileIcon name="add" size={21} />
            </Pressable>
          </View>
        )}

        {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

        <Pressable
          style={styles.livePill}
          onPress={() => router.push("/live")}
        >
          <ProfileIcon name="live" size={16} color="#fe2c55" />
          <Text style={styles.liveText}>LIVE</Text>
        </Pressable>

        <View style={styles.tabsRow}>
          {tabs.map((tab) => {
            const icon =
              tab === "videos"
                ? "▦"
                : tab === "reposts"
                  ? "↻"
                  : tab === "liked"
                    ? "♡"
                    : tab === "saved"
                      ? "▣"
                      : "✎";

            return (
              <Pressable
                key={tab}
                style={[
                  styles.tabButton,
                  activeTab === tab && styles.tabButtonActive,
                ]}
                onPress={() => {
                  setActiveTab(tab);
                  void loadTabVideos(tab);
                }}
              >
                <Text style={styles.tabIcon}>{icon}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.grid}>
          {videos.map((video) => (
            <View key={video.id} style={styles.gridItem}>
              {video.thumbnail ? (
                <Image
                  source={{ uri: video.thumbnail }}
                  style={styles.gridImage}
                />
              ) : (
                <View style={styles.gridFallback}>
                  <Text style={styles.gridFallbackText}>
                    {activeTab === "drafts" ? "✎" : "▶"}
                  </Text>
                </View>
              )}

              <Text style={styles.viewsText}>
                ▶ {video.status === "PROCESSING" ? "Processing" : "0"}
              </Text>

              {activeTab === "drafts" ? (
                <View style={styles.draftOverlay}>
                  <Text style={styles.draftStatus}>Draft</Text>
                  <Pressable
                    style={styles.publishButton}
                    onPress={() => void publishDraft(video.id)}
                    disabled={busy}
                  >
                    <Text style={styles.publishText}>Publish</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={styles.gridTap}
                  onPress={() => {
                    if (video.playback) {
                      router.push({
                        pathname: "/feed",
                        params: { videoId: video.id },
                      });
                    }
                  }}
                  accessibilityLabel="Open video"
                />
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  topBar: {
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,.08)",
  },
  topRight: { flexDirection: "row" },
  topIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  topIconText: { color: "#fff", fontSize: 25 },
  topTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  content: { paddingTop: 18, paddingBottom: 40 },
  identityRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  identityCopy: { flex: 1, paddingRight: 12 },
  nameLine: { flexDirection: "row", alignItems: "center" },
  nickname: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  verifiedBadge: {
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: "#20b2aa",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  verifiedText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  usernameText: {
    color: "rgba(255,255,255,.55)",
    fontSize: 15,
    marginTop: 3,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#1b1b1b",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,.22)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarText: { color: "#fff", fontSize: 36, fontWeight: "900" },
  statsRow: { flexDirection: "row", marginTop: 18 },
  statBlock: { marginRight: 24 },
  statValue: { color: "#fff", fontSize: 20, fontWeight: "900" },
  statLabel: { color: "rgba(255,255,255,.55)", fontSize: 13, marginTop: 2 },
  actionRow: { flexDirection: "row", marginTop: 18, paddingHorizontal: 16 },
  followButton: {
    flex: 1,
    height: 42,
    borderRadius: 8,
    backgroundColor: "#fe2c55",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  followText: { color: "#fff", fontSize: 15, fontWeight: "900" },
  messageButton: {
    flex: 1,
    height: 42,
    borderRadius: 8,
    backgroundColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  messageText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  editButton: {
    flex: 1,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.18)",
    backgroundColor: "#151515",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  editText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 9,
    backgroundColor: "#202020",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  actionIcon: { color: "#fff", fontSize: 20, fontWeight: "800" },
  bio: {
    color: "#fff",
    fontSize: 15,
    lineHeight: 21,
    paddingHorizontal: 16,
    marginTop: 14,
  },
  livePill: {
    alignSelf: "flex-start",
    marginLeft: 16,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.18)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  liveDot: { color: "#fe2c55", fontSize: 10 },
  liveText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
    marginLeft: 6,
  },
  tabsRow: {
    marginTop: 18,
    height: 48,
    flexDirection: "row",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,.08)",
  },
  tabButton: {
    width: 70,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabButtonActive: { borderBottomColor: "#fff" },
  tabIcon: { color: "rgba(255,255,255,.55)", fontSize: 23 },
  grid: { flexDirection: "row", flexWrap: "wrap", margin: 1 },
  gridItem: {
    width: "33.1%",
    aspectRatio: 0.75,
    backgroundColor: "#111",
    margin: 1,
    position: "relative",
  },
  gridImage: { width: "100%", height: "100%" },
  gridFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  gridFallbackText: { color: "#555", fontSize: 24 },
  gridTap: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  viewsText: {
    position: "absolute",
    left: 7,
    bottom: 6,
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
    textShadowColor: "#000",
    textShadowRadius: 5,
  },
  draftOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 6,
    backgroundColor: "rgba(0,0,0,.72)",
  },
  draftStatus: { color: "#fff", fontSize: 10, fontWeight: "800" },
  publishButton: {
    marginTop: 5,
    backgroundColor: "#fe2c55",
    borderRadius: 6,
    paddingVertical: 5,
    alignItems: "center",
  },
  publishText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  center: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: { color: "#ff7d96", textAlign: "center", marginBottom: 15 },
  linkText: { color: "#fff", fontWeight: "800" },
});
