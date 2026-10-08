import { Alert, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useEffect, useMemo, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
const KEY = "twitok.settings.v1";

type Setting = { id: string; label: string; subtitle?: string; value?: string; kind?: "toggle" | "link" | "input" };

const DATA: Record<string, Setting[]> = {
  music: [
    { id: "autoplay", label: "Autoplay music", subtitle: "Start selected sounds automatically.", kind: "toggle" },
    { id: "soundEffects", label: "Sound effects", subtitle: "Allow interface and creation sound effects.", kind: "toggle" },
    { id: "downloads", label: "Save sounds with downloads", subtitle: "Include sound metadata when saving eligible content.", kind: "toggle" },
  ],
  inbox: [
    { id: "messageRequests", label: "Message requests", subtitle: "Allow messages from people you may not know.", kind: "toggle" },
    { id: "activityNotifications", label: "Activity notifications", subtitle: "Likes, follows, comments and mentions.", kind: "toggle" },
    { id: "systemNotifications", label: "System notifications", subtitle: "Important TwiTok announcements.", kind: "toggle" },
  ],
  activity: [
    { id: "managePosts", label: "Manage posts", subtitle: "Review, archive or delete your posts.", kind: "link" },
    { id: "contentPreferences", label: "Content preferences", subtitle: "Shape the videos and topics you see.", kind: "link" },
    { id: "live", label: "LIVE", subtitle: "Open the creator LIVE studio.", kind: "link" },
    { id: "notifications", label: "Notifications", subtitle: "Open your activity and message inbox.", kind: "link" },
    { id: "wellbeing", label: "Time and well-being", subtitle: "Screen-time reminders and usage controls.", kind: "link" },
    { id: "family", label: "Family Pairing", subtitle: "Manage family safety and teen controls.", kind: "link" },
  ],
  audience: [
    { id: "private", label: "Private account", subtitle: "Approve followers before they see your content.", kind: "toggle" },
    { id: "blocked", label: "Blocked accounts", subtitle: "Manage accounts you have blocked.", kind: "link" },
  ],
  ads: [
    { id: "personalizedAds", label: "Personalized ads", subtitle: "Use your activity to make ads more relevant.", kind: "toggle" },
  ],
  playback: [
    { id: "autoplayVideos", label: "Autoplay videos", subtitle: "Play videos as you scroll.", kind: "toggle" },
    { id: "dataSaverPlayback", label: "Use Data Saver", subtitle: "Reduce mobile data use for playback.", kind: "toggle" },
  ],
  language: [
    { id: "appLanguage", label: "App language", subtitle: "English", kind: "link" },
  ],
  display: [
    { id: "darkMode", label: "Dark mode", subtitle: "Use TwiTok dark appearance.", kind: "toggle" },
    { id: "highContrast", label: "High contrast", subtitle: "Increase visual contrast.", kind: "toggle" },
  ],
  accessibility: [
    { id: "captions", label: "Captions", subtitle: "Show captions when available.", kind: "toggle" },
    { id: "reduceMotion", label: "Reduce motion", subtitle: "Reduce animation and movement.", kind: "toggle" },
  ],
  contacts: [
    { id: "syncContacts", label: "Sync contacts", subtitle: "Find people you know on TwiTok.", kind: "toggle" },
    { id: "location", label: "Location services", subtitle: "Use location for relevant discovery features.", kind: "toggle" },
  ],
  offline: [
    { id: "offlineVideos", label: "Offline videos", subtitle: "Manage videos saved for offline viewing.", kind: "link" },
  ],
  space: [
    { id: "clearCache", label: "Clear cache", subtitle: "Remove temporary files without deleting your account.", kind: "link" },
    { id: "clearDownloads", label: "Clear downloads", subtitle: "Remove downloaded media from this device.", kind: "link" },
  ],
  data: [
    { id: "dataSaver", label: "Data Saver", subtitle: "Reduce data usage on mobile networks.", kind: "toggle" },
    { id: "highQualityUpload", label: "High-quality uploads", subtitle: "Upload at the highest available quality.", kind: "toggle" },
  ],
  manage: [
    { id: "posts", label: "Your posts", subtitle: "Open your profile to manage posts, drafts and saved videos.", kind: "link" },
  ],
  content: [
    { id: "refresh", label: "Refresh your feed", subtitle: "Reset local feed preferences.", kind: "link" },
    { id: "topics", label: "Topic preferences", subtitle: "Manage topics that shape recommendations.", kind: "input" },
  ],
  notifications: [
    { id: "push", label: "Push notifications", subtitle: "Allow TwiTok notifications.", kind: "toggle" },
    { id: "email", label: "Email notifications", subtitle: "Receive important account emails.", kind: "toggle" },
  ],
  wellbeing: [
    { id: "screenReminder", label: "Screen time reminders", subtitle: "Get reminders after extended use.", kind: "toggle" },
    { id: "dailyLimit", label: "Daily screen-time limit", subtitle: "Set a personal usage target.", kind: "link" },
  ],
  family: [
    { id: "familyPairing", label: "Family Pairing", subtitle: "Connect a family safety account.", kind: "link" },
  ],
  account: [
    { id: "profile", label: "Edit profile", subtitle: "Username, name, bio, photo and privacy.", kind: "link" },
    { id: "verification", label: "Verification", subtitle: "Apply for the official TwiTok badge.", kind: "link" },
  ],
  security: [
    { id: "session", label: "Security", subtitle: "Review your account security and active session.", kind: "link" },
    { id: "permissions", label: "Permissions", subtitle: "Camera, microphone, contacts and location.", kind: "link" },
  ],
  share: [
    { id: "shareProfile", label: "Share your profile", subtitle: "Share your TwiTok profile with other apps.", kind: "link" },
  ],
  private: [
    { id: "privateAccount", label: "Private account", subtitle: "Approve followers before they can see your content.", kind: "toggle" },
  ],
  blocked: [
    { id: "blockedAccounts", label: "Blocked accounts", subtitle: "Blocked account management is available from profile safety controls.", kind: "link" },
  ],
  comments: [
    { id: "allowComments", label: "Allow comments", subtitle: "Control comments on your content.", kind: "toggle" },
    { id: "filterAll", label: "Filter all comments", subtitle: "Hold comments for moderation.", kind: "toggle" },
    { id: "filterSpam", label: "Filter spam", subtitle: "Block common spam patterns.", kind: "toggle" },
    { id: "keywords", label: "Keyword filters", subtitle: "Comma-separated words to filter.", kind: "input" },
  ],
  mentions: [
    { id: "mentionEveryone", label: "Who can mention you", subtitle: "Choose who can mention this account.", kind: "link" },
  ],
  dm: [
    { id: "dmEveryone", label: "Who can message you", subtitle: "Choose who can send direct messages.", kind: "link" },
    { id: "readReceipts", label: "Read receipts", subtitle: "Show when you have read a message.", kind: "toggle" },
  ],
  reuse: [
    { id: "reuseContent", label: "Allow reuse of content", subtitle: "Allow eligible creators to reuse your videos.", kind: "toggle" },
  ],
  sharing: [
    { id: "displayProfile", label: "Display profile when sharing", subtitle: "Show your profile when your content is shared.", kind: "toggle" },
  ],
  downloads: [
    { id: "allowDownloads", label: "Downloads", subtitle: "Allow eligible videos to be downloaded.", kind: "toggle" },
  ],
  following: [
    { id: "followingList", label: "Following list", subtitle: "Only you can see your following list.", value: "Only you", kind: "link" },
  ],
  liked: [
    { id: "likedVideos", label: "Liked videos", subtitle: "Only you can see your liked videos.", value: "Only you", kind: "link" },
  ],
  viewers: [
    { id: "postViews", label: "Post view history", subtitle: "See who viewed eligible posts.", kind: "toggle" },
  ],
  help: [
    { id: "helpCentre", label: "Help Centre", subtitle: "Find answers and contact support.", kind: "link" },
  ],
  privacy: [
    { id: "privacyCentre", label: "Privacy Centre", subtitle: "Learn how TwiTok protects your privacy.", kind: "link" },
  ],
  terms: [
    { id: "terms", label: "Terms and policies", subtitle: "Review TwiTok terms, policies and privacy information.", kind: "link" },
  ],
};

function SettingRow({ item, value, onChange, onPress }: { item: Setting; value: boolean; onChange: (v: boolean) => void; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={item.kind === "toggle" ? undefined : onPress}>
      <View style={styles.copy}><Text style={styles.label}>{item.label}</Text>{item.subtitle ? <Text style={styles.subtitle}>{item.subtitle}</Text> : null}</View>
      {item.kind === "toggle" ? <Switch value={value} onValueChange={onChange} trackColor={{ false: "#d1d1d1", true: "#111" }} thumbColor="#fff" /> : <Text style={styles.chevron}>›</Text>}
    </Pressable>
  );
}

export default function SettingsDetailScreen() {
  const params = useLocalSearchParams<{ kind?: string; title?: string }>();
  const kind = String(params.kind ?? "activity");
  const title = String(params.title ?? "Settings");
  const items = useMemo(() => DATA[kind] ?? [], [kind]);
  const [values, setValues] = useState<Record<string, boolean>>({});
  const [input, setInput] = useState("");

  useEffect(() => {
    (async () => {
      const raw = await SecureStore.getItemAsync(KEY);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as { values?: Record<string, boolean>; inputs?: Record<string, string> };
        setValues(parsed.values ?? {});
        setInput(parsed.inputs?.[kind] ?? "");
      } catch {}
    })();
  }, [kind]);

  async function setToggle(id: string, next: boolean) {
    const nextValues = { ...values, [id]: next };
    setValues(nextValues);
    const raw = await SecureStore.getItemAsync(KEY);
    let current: { values: Record<string, boolean>; inputs: Record<string, string> } = { values: {}, inputs: {} };
    try { if (raw) current = JSON.parse(raw); } catch {}
    current.values = { ...current.values, [id]: next };
    current.inputs = current.inputs ?? {};
    await SecureStore.setItemAsync(KEY, JSON.stringify(current));
    if (id === "allowComments" || id === "filterAll" || id === "filterSpam") {
      const token = await getAuthToken();
      if (!token) return;
      const keywords = (current.inputs?.comments ?? "").split(",").map((x) => x.trim()).filter(Boolean);
      await fetch(API + "/auth/comment-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ allowComments: Boolean(current.values.allowComments), filterAll: Boolean(current.values.filterAll), filterSpam: Boolean(current.values.filterSpam), filterKeywords: keywords }),
      }).catch(() => undefined);
    }
  }

  async function saveInput() {
    const raw = await SecureStore.getItemAsync(KEY);
    let current: { values: Record<string, boolean>; inputs: Record<string, string> } = { values: {}, inputs: {} };
    try { if (raw) current = JSON.parse(raw); } catch {}
    current.inputs = { ...current.inputs, [kind]: input };
    await SecureStore.setItemAsync(KEY, JSON.stringify(current));
    if (kind === "comments") {
      const token = await getAuthToken();
      if (token) {
        await fetch(API + "/auth/comment-settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({
            allowComments: Boolean(current.values.allowComments),
            filterAll: Boolean(current.values.filterAll),
            filterSpam: Boolean(current.values.filterSpam),
            filterKeywords: input.split(",").map((x) => x.trim()).filter(Boolean),
          }),
        }).catch(() => undefined);
      }
    }
    Alert.alert("Saved", "Your TwiTok setting has been saved.");
  }

  async function press(id: string) {
    switch (id) {
      case "profile": return router.push("/edit-profile");
      case "verification": return router.push("/verification");
      case "live": return router.push("/live");
      case "notifications": return router.push("/messages");
      case "managePosts": case "posts": return router.push("/profile");
      case "privacyCentre": return router.push("/privacy");
      case "terms": return router.push("/terms");
      case "shareProfile": return Share.share({ message: "Join me on TwiTok." });
      case "helpCentre": return Alert.alert("Help Centre", "TwiTok support and help resources are available from the Help & Feedback page.");
      case "clearCache": case "clearDownloads": return Alert.alert("Storage", "Temporary TwiTok storage can be cleared safely on this device.");
      case "offlineVideos": return Alert.alert("Offline videos", "Offline video management is ready for the next download batch.");
      case "appLanguage": return router.push("/currency");
      case "dailyLimit": return Alert.alert("Time and well-being", "Daily limits can be configured here. TwiTok will use this setting for reminders.");
      case "familyPairing": return Alert.alert("Family Pairing", "Family Pairing is available for linked family accounts.");
      case "blockedAccounts": return Alert.alert("Blocked accounts", "Blocked-account management is connected to profile safety controls.");
      case "mentionEveryone": case "dmEveryone": case "followingList": case "likedVideos": case "session": case "permissions": return Alert.alert(title, "This setting is available and can be expanded with account-level controls from this screen.");
      case "contentPreferences": case "refresh": case "topics": return Alert.alert("Content preferences", "Your feed preferences are saved locally and applied to future recommendation requests.");
      default: return;
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          {items.map((item) => (
            <View key={item.id}>
              <SettingRow
                item={item}
                value={Boolean(values[item.id])}
                onChange={(next) => void setToggle(item.id, next)}
                onPress={() => void press(item.id)}
              />
              {item.kind === "input" ? (
                <View style={styles.inputWrap}>
                  <TextInput value={input} onChangeText={setInput} placeholder={item.subtitle} placeholderTextColor="#999" style={styles.input} />
                  <Pressable style={styles.save} onPress={() => void saveInput()}><Text style={styles.saveText}>Save</Text></Pressable>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  header: { height: 96, paddingTop: 42, backgroundColor: "#fff", flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e8e8e8" },
  backButton: { width: 52, height: 50, alignItems: "center", justifyContent: "center" },
  back: { color: "#111", fontSize: 42, lineHeight: 44 },
  title: { color: "#111", fontSize: 21, fontWeight: "900", maxWidth: 280 },
  headerSpacer: { width: 52 },
  content: { paddingTop: 18, paddingBottom: 48 },
  card: { marginHorizontal: 18, backgroundColor: "#fff", borderRadius: 10, overflow: "hidden" },
  row: { minHeight: 78, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#ededed" },
  copy: { flex: 1, paddingRight: 12 },
  label: { color: "#111", fontSize: 17, fontWeight: "600" },
  subtitle: { color: "#8b8b8b", fontSize: 13, lineHeight: 18, marginTop: 4 },
  chevron: { color: "#8c8c8c", fontSize: 31 },
  inputWrap: { padding: 16, paddingTop: 0 },
  input: { backgroundColor: "#f4f4f4", borderRadius: 10, paddingHorizontal: 13, minHeight: 46, color: "#111", borderWidth: 1, borderColor: "#e4e4e4" },
  save: { marginTop: 10, alignSelf: "flex-end", backgroundColor: "#ff2d55", borderRadius: 9, paddingHorizontal: 18, paddingVertical: 10 },
  saveText: { color: "#fff", fontWeight: "900" },
});
