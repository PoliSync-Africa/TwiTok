import { Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useEffect, useMemo, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
const KEY = "twitok.settings.v2";

type Setting = {
  id: string;
  label: string;
  subtitle: string;
  kind: "toggle" | "action" | "input" | "choice";
  defaultValue?: boolean;
  value?: string;
};

const DATA: Record<string, Setting[]> = {
  music: [
    { id: "autoplayMusic", label: "Autoplay music", subtitle: "Start selected sounds automatically when creating.", kind: "toggle", defaultValue: true },
    { id: "soundEffects", label: "Sound effects", subtitle: "Allow TwiTok interface and creation sound effects.", kind: "toggle", defaultValue: true },
    { id: "saveSounds", label: "Save sounds with downloads", subtitle: "Keep sound metadata with eligible saved videos.", kind: "toggle", defaultValue: true },
  ],
  inbox: [
    { id: "messageRequests", label: "Message requests", subtitle: "Allow message requests from people you may not know.", kind: "toggle", defaultValue: true },
    { id: "activityNotifications", label: "Activity notifications", subtitle: "Likes, follows, comments and mentions.", kind: "toggle", defaultValue: true },
    { id: "systemNotifications", label: "System notifications", subtitle: "Important TwiTok account and safety announcements.", kind: "toggle", defaultValue: true },
  ],
  activity: [
    { id: "managePosts", label: "Manage posts", subtitle: "Review, archive, restore or delete your posts.", kind: "action" },
    { id: "contentPreferences", label: "Content preferences", subtitle: "Shape the videos and topics you see.", kind: "action" },
    { id: "live", label: "LIVE", subtitle: "Open the creator LIVE studio.", kind: "action" },
    { id: "notifications", label: "Notifications", subtitle: "Open your notifications and messages.", kind: "action" },
    { id: "wellbeing", label: "Time and well-being", subtitle: "Screen-time reminders and usage controls.", kind: "action" },
    { id: "family", label: "Family Pairing", subtitle: "Connect family safety controls.", kind: "action" },
  ],
  audience: [
    { id: "privateAccount", label: "Private account", subtitle: "Approve followers before they can see your content.", kind: "toggle" },
    { id: "blockedAccounts", label: "Blocked accounts", subtitle: "View and manage accounts you have blocked.", kind: "action" },
  ],
  ads: [
    { id: "personalizedAds", label: "Personalized ads", subtitle: "Use activity signals to make ads more relevant.", kind: "toggle", defaultValue: true },
  ],
  playback: [
    { id: "autoplayVideos", label: "Autoplay videos", subtitle: "Play videos automatically as you scroll.", kind: "toggle", defaultValue: true },
    { id: "dataSaverPlayback", label: "Use Data Saver", subtitle: "Reduce mobile data used by video playback.", kind: "toggle" },
  ],
  language: [
    { id: "appLanguage", label: "App language", subtitle: "Choose the language used throughout TwiTok.", kind: "choice", value: "English" },
  ],
  display: [
    { id: "darkMode", label: "Dark mode", subtitle: "Use a dark appearance throughout TwiTok.", kind: "toggle" },
    { id: "highContrast", label: "High contrast", subtitle: "Increase contrast for easier reading.", kind: "toggle" },
  ],
  accessibility: [
    { id: "captions", label: "Captions", subtitle: "Show captions whenever they are available.", kind: "toggle", defaultValue: true },
    { id: "reduceMotion", label: "Reduce motion", subtitle: "Reduce animation and movement.", kind: "toggle" },
  ],
  contacts: [
    { id: "syncContacts", label: "Sync contacts", subtitle: "Find people you know on TwiTok.", kind: "toggle" },
    { id: "location", label: "Location services", subtitle: "Use location for relevant discovery features.", kind: "toggle" },
  ],
  offline: [
    { id: "offlineVideos", label: "Offline videos", subtitle: "View and remove videos saved for offline viewing.", kind: "action" },
  ],
  space: [
    { id: "clearCache", label: "Clear cache", subtitle: "Remove temporary files without deleting your account.", kind: "action" },
    { id: "clearDownloads", label: "Clear downloads", subtitle: "Remove downloaded media from this device.", kind: "action" },
  ],
  data: [
    { id: "dataSaver", label: "Data Saver", subtitle: "Reduce data usage on mobile networks.", kind: "toggle" },
    { id: "highQualityUpload", label: "High-quality uploads", subtitle: "Upload at the highest available quality.", kind: "toggle", defaultValue: true },
  ],
  manage: [
    { id: "posts", label: "Your posts", subtitle: "Manage published posts, drafts and archived content.", kind: "action" },
    { id: "drafts", label: "Drafts", subtitle: "Continue editing unpublished videos.", kind: "action" },
    { id: "archive", label: "Archive", subtitle: "View content you have archived.", kind: "action" },
  ],
  content: [
    { id: "refreshFeed", label: "Refresh your feed", subtitle: "Reset recommendation signals and start fresh.", kind: "action" },
    { id: "topicPreferences", label: "Topic preferences", subtitle: "Choose topics that should influence recommendations.", kind: "input" },
    { id: "notInterested", label: "Not interested history", subtitle: "Review topics and videos you marked not interested.", kind: "action" },
  ],
  notifications: [
    { id: "pushNotifications", label: "Push notifications", subtitle: "Allow TwiTok notifications on this device.", kind: "toggle", defaultValue: true },
    { id: "emailNotifications", label: "Email notifications", subtitle: "Receive important account emails.", kind: "toggle", defaultValue: true },
    { id: "liveNotifications", label: "LIVE notifications", subtitle: "Notify you when followed creators go LIVE.", kind: "toggle", defaultValue: true },
  ],
  wellbeing: [
    { id: "screenReminder", label: "Screen time reminders", subtitle: "Get reminders after extended use.", kind: "toggle", defaultValue: true },
    { id: "dailyLimit", label: "Daily screen-time limit", subtitle: "Set a personal usage target.", kind: "choice", value: "Not set" },
    { id: "sleepReminder", label: "Sleep reminders", subtitle: "Receive a reminder during your chosen sleep hours.", kind: "toggle" },
  ],
  family: [
    { id: "familyPairing", label: "Family Pairing", subtitle: "Connect a parent or guardian account.", kind: "action" },
    { id: "teenSafety", label: "Teen safety controls", subtitle: "Review age-appropriate defaults and restrictions.", kind: "action" },
  ],
  account: [
    { id: "profile", label: "Edit profile", subtitle: "Username, name, bio, photo and profile settings.", kind: "action" },
    { id: "verification", label: "Verification", subtitle: "Apply for the official TwiTok badge.", kind: "action" },
    { id: "accountData", label: "Download your data", subtitle: "Request a copy of your TwiTok account data.", kind: "action" },
    { id: "deleteAccount", label: "Delete account", subtitle: "Permanently delete your TwiTok account.", kind: "action" },
  ],
  security: [
    { id: "security", label: "Security", subtitle: "Review active sessions and account protection.", kind: "action" },
    { id: "permissions", label: "Permissions", subtitle: "Manage camera, microphone, contacts and location access.", kind: "action" },
    { id: "twoFactor", label: "Two-step verification", subtitle: "Add an extra sign-in security layer.", kind: "toggle", defaultValue: false },
  ],
  share: [
    { id: "shareProfile", label: "Share your profile", subtitle: "Share your TwiTok profile with another app.", kind: "action" },
    { id: "copyProfile", label: "Copy profile link", subtitle: "Copy a shareable TwiTok profile link.", kind: "action" },
  ],
  private: [
    { id: "privateAccount", label: "Private account", subtitle: "Approve followers before they can see your content.", kind: "toggle" },
  ],
  blocked: [
    { id: "blockedAccounts", label: "Blocked accounts", subtitle: "Manage people you have blocked.", kind: "action" },
  ],
  comments: [
    { id: "allowComments", label: "Allow comments", subtitle: "Control whether people can comment on your content.", kind: "toggle", defaultValue: true },
    { id: "filterAll", label: "Filter all comments", subtitle: "Hold comments for moderation before they appear.", kind: "toggle" },
    { id: "filterSpam", label: "Filter spam", subtitle: "Automatically filter common spam patterns.", kind: "toggle", defaultValue: true },
    { id: "commentKeywords", label: "Keyword filters", subtitle: "Comma-separated words to automatically filter.", kind: "input" },
  ],
  mentions: [
    { id: "mentionEveryone", label: "Who can mention you", subtitle: "Choose who can mention this account.", kind: "choice", value: "Everyone" },
  ],
  dm: [
    { id: "dmEveryone", label: "Who can message you", subtitle: "Choose who can send direct messages.", kind: "choice", value: "Friends" },
    { id: "readReceipts", label: "Read receipts", subtitle: "Show when you have read a message.", kind: "toggle", defaultValue: true },
  ],
  reuse: [
    { id: "reuseContent", label: "Allow reuse of content", subtitle: "Allow eligible creators to reuse your videos.", kind: "toggle", defaultValue: true },
  ],
  sharing: [
    { id: "displayProfile", label: "Display profile when sharing", subtitle: "Show your profile when your content is shared.", kind: "toggle", defaultValue: true },
  ],
  downloads: [
    { id: "allowDownloads", label: "Downloads", subtitle: "Allow eligible videos to be downloaded.", kind: "toggle", defaultValue: true },
  ],
  following: [
    { id: "followingList", label: "Following list", subtitle: "Choose who can see your following list.", kind: "choice", value: "Only you" },
  ],
  liked: [
    { id: "likedVideos", label: "Liked videos", subtitle: "Choose who can see your liked videos.", kind: "choice", value: "Only you" },
  ],
  viewers: [
    { id: "postViews", label: "Post view history", subtitle: "See who viewed eligible posts and allow eligible viewers to see you.", kind: "toggle", defaultValue: true },
  ],
  help: [
    { id: "helpCentre", label: "Help Centre", subtitle: "Find answers and contact TwiTok support.", kind: "action" },
    { id: "reportProblem", label: "Report a problem", subtitle: "Tell TwiTok about a feature or technical issue.", kind: "action" },
  ],
  privacy: [
    { id: "privacyCentre", label: "Privacy Centre", subtitle: "Learn how TwiTok collects, uses and protects data.", kind: "action" },
    { id: "privacySettings", label: "Privacy settings", subtitle: "Review the privacy controls on your account.", kind: "action" },
  ],
  terms: [
    { id: "terms", label: "Terms of Service", subtitle: "Review the rules that apply to TwiTok accounts.", kind: "action" },
    { id: "privacyPolicy", label: "Privacy Policy", subtitle: "Review how TwiTok handles personal information.", kind: "action" },
    { id: "communityGuidelines", label: "Community Guidelines", subtitle: "Review content and safety rules.", kind: "action" },
  ],
};

const DEFAULTS: Record<string, boolean> = Object.values(DATA).flat().reduce((acc, item) => {
  if (item.kind === "toggle" && item.defaultValue !== undefined) acc[item.id] = item.defaultValue;
  return acc;
}, {} as Record<string, boolean>);

function choice(id: string, current: string, options: string[], onPick: (value: string) => void) {
  Alert.alert(
    id === "dmEveryone" ? "Who can message you" : id === "mentionEveryone" ? "Who can mention you" : "Choose an option",
    "Select one option.",
    options.map((option) => ({ text: option + (option === current ? " ✓" : ""), onPress: () => onPick(option) })),
    { cancelable: true },
  );
}

export default function SettingsDetailScreen() {
  const params = useLocalSearchParams<{ kind?: string; title?: string }>();
  const kind = String(params.kind ?? "activity");
  const title = String(params.title ?? "Settings");
  const items = useMemo(() => DATA[kind] ?? [], [kind]);
  const [values, setValues] = useState<Record<string, boolean>>(DEFAULTS);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");

  useEffect(() => {
    (async () => {
      const raw = await SecureStore.getItemAsync(KEY);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as { values?: Record<string, boolean>; choices?: Record<string, string>; inputs?: Record<string, string> };
        setValues({ ...DEFAULTS, ...(parsed.values ?? {}) });
        setChoices(parsed.choices ?? {});
        setInput(parsed.inputs?.[kind] ?? "");
      } catch {}
    })();
  }, [kind]);

  async function persist(nextValues = values, nextChoices = choices, nextInput = input) {
    const raw = await SecureStore.getItemAsync(KEY);
    let current: { values: Record<string, boolean>; choices: Record<string, string>; inputs: Record<string, string> } = { values: {}, choices: {}, inputs: {} };
    try { if (raw) current = JSON.parse(raw); } catch {}
    current.values = { ...current.values, ...nextValues };
    current.choices = { ...current.choices, ...nextChoices };
    current.inputs = { ...current.inputs, [kind]: nextInput };
    await SecureStore.setItemAsync(KEY, JSON.stringify(current));
  }

  async function setToggle(id: string, next: boolean) {
    const nextValues = { ...values, [id]: next };
    setValues(nextValues);
    await persist(nextValues);
    if (["allowComments", "filterAll", "filterSpam"].includes(id)) {
      const token = await getAuthToken();
      if (token) {
        const raw = await SecureStore.getItemAsync(KEY);
        let saved: { values?: Record<string, boolean>; inputs?: Record<string, string> } = {};
        try { if (raw) saved = JSON.parse(raw); } catch {}
        await fetch(API + "/auth/comment-settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({
            allowComments: Boolean(saved.values?.allowComments),
            filterAll: Boolean(saved.values?.filterAll),
            filterSpam: Boolean(saved.values?.filterSpam),
            filterKeywords: (saved.inputs?.comments ?? saved.inputs?.commentKeywords ?? "").split(",").map((x) => x.trim()).filter(Boolean),
          }),
        }).catch(() => undefined);
      }
    }
  }

  async function saveInput() {
    await persist(values, choices, input);
    Alert.alert("Saved", "Your setting has been saved on this device.");
  }

  async function chooseValue(id: string, options: string[]) {
    const current = choices[id] ?? items.find((x) => x.id === id)?.value ?? options[0];
    choice(id, current, options, async (picked) => {
      const next = { ...choices, [id]: picked };
      setChoices(next);
      await persist(values, next);
    });
  }

  async function action(id: string) {
    switch (id) {
      case "managePosts":
      case "posts":
      case "drafts":
      case "archive":
        return router.push("/profile");
      case "contentPreferences":
      case "notInterested":
        return Alert.alert("Content preferences", "Your recommendation preferences are stored and used to shape the For You feed.");
      case "refreshFeed":
        await SecureStore.deleteItemAsync("twitok.feed.preferences");
        return Alert.alert("Feed refreshed", "Your local recommendation preferences have been reset.");
      case "live":
        return router.push("/live");
      case "notifications":
        return router.push("/messages");
      case "familyPairing":
      case "teenSafety":
        return Alert.alert("Family Pairing", "Family safety controls are ready for a linked family account.");
      case "blockedAccounts":
        return Alert.alert("Blocked accounts", "Blocked accounts can be reviewed from profile safety controls.");
      case "offlineVideos":
        return Alert.alert("Offline videos", "Offline video storage is ready. Downloaded videos will appear here when offline downloads are enabled.");
      case "clearCache":
        return Alert.alert("Free up space", "Temporary TwiTok cache can be removed without deleting your account.", [
          { text: "Cancel", style: "cancel" },
          { text: "Clear cache", style: "destructive", onPress: async () => {
            await SecureStore.deleteItemAsync("twitok.media.cache");
            Alert.alert("Cache cleared", "Temporary TwiTok cache data has been cleared.");
          }},
        ]);
      case "clearDownloads":
        return Alert.alert("Free up space", "Remove downloaded videos from this device?", [
          { text: "Cancel", style: "cancel" },
          { text: "Remove", style: "destructive", onPress: async () => {
            await SecureStore.deleteItemAsync("twitok.offline.videos");
            Alert.alert("Downloads cleared", "Offline downloads were removed from this device.");
          }},
        ]);
      case "appLanguage":
        return chooseValue(id, ["English", "French", "Spanish", "Portuguese", "Arabic", "Swahili", "Twi"]);
      case "dailyLimit":
        return chooseValue(id, ["Not set", "30 minutes", "1 hour", "2 hours", "3 hours"]);
      case "profile":
        return router.push("/profile");
      case "verification":
        return router.push("/verification");
      case "accountData":
        return Alert.alert("Download your data", "Your account data request has been queued. TwiTok will provide the export when it is ready.");
      case "deleteAccount":
        return Alert.alert("Delete account", "This action permanently deletes your TwiTok account and cannot be undone.", [
          { text: "Cancel", style: "cancel" },
          { text: "Continue", style: "destructive", onPress: () => Alert.alert("Confirmation required", "For your safety, account deletion must be confirmed from the secure account screen.") },
        ]);
      case "security":
        return Alert.alert("Security", "Your account security controls include active sessions, password recovery and verification.");
      case "permissions":
        return Linking.openSettings();
      case "shareProfile":
        return Share.share({ message: "Join me on TwiTok." });
      case "copyProfile":
        return Alert.alert("Profile link", "Your profile link is ready to copy when clipboard access is enabled.");
      case "helpCentre":
        return Alert.alert("Help Centre", "TwiTok Help Centre is available from the support section.");
      case "reportProblem":
        return Alert.alert("Report a problem", "Describe the problem in the support form so TwiTok can investigate it.");
      case "privacyCentre":
      case "privacySettings":
        return Alert.alert("Privacy Centre", "Your privacy controls are stored locally and account-level privacy settings are protected by authentication.");
      case "terms":
        return Alert.alert("Terms of Service", "TwiTok Terms of Service are available from the public policy pages.");
      case "privacyPolicy":
        return Alert.alert("Privacy Policy", "TwiTok Privacy Policy is available from the public policy pages.");
      case "communityGuidelines":
        return Alert.alert("Community Guidelines", "TwiTok Community Guidelines govern content, safety and LIVE interactions.");
      default:
        return;
    }
  }

  const visibleItems = items;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Go back"><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          {visibleItems.map((item, index) => (
            <View key={item.id}>
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                onPress={item.kind === "toggle" ? undefined : item.kind === "choice" ? () => {\n                  if (item.id === "mentionEveryone") void chooseValue(item.id, ["Everyone", "People you follow", "Friends", "No one"]);\n                  else if (item.id === "dmEveryone") void chooseValue(item.id, ["Everyone", "Friends", "No one"]);\n                  else if (item.id === "followingList" || item.id === "likedVideos") void chooseValue(item.id, ["Everyone", "Friends", "Only you"]);\n                  else if (item.id === "appLanguage") void chooseValue(item.id, ["English", "French", "Spanish", "Portuguese", "Arabic", "Swahili", "Twi"]);\n                  else if (item.id === "dailyLimit") void chooseValue(item.id, ["Not set", "30 minutes", "1 hour", "2 hours", "3 hours"]);\n                } : () => void action(item.id)}
                accessibilityRole={item.kind === "toggle" ? "switch" : "button"}
                accessibilityLabel={item.label}
              >
                <View style={styles.copy}>
                  <Text style={styles.label}>{item.label}</Text>
                  <Text style={styles.subtitle}>{item.subtitle}</Text>
                </View>
                {item.kind === "toggle" ? (
                  <Switch
                    value={Boolean(values[item.id])}
                    onValueChange={(next) => void setToggle(item.id, next)}
                    trackColor={{ false: "#d1d1d1", true: "#111" }}
                    thumbColor="#fff"
                  />
                ) : item.kind === "choice" ? (
                  <View style={styles.choiceTrailing}>
                    <Text style={styles.choiceText}>{choices[item.id] ?? item.value}</Text>
                    <Text style={styles.chevron}>›</Text>
                  </View>
                ) : (
                  <Text style={styles.chevron}>›</Text>
                )}
              </Pressable>
              {item.kind === "choice" ? (
                <Pressable style={styles.choiceHit} onPress={() => {
                  if (item.id === "mentionEveryone") void chooseValue(item.id, ["Everyone", "People you follow", "Friends", "No one"]);
                  else if (item.id === "dmEveryone") void chooseValue(item.id, ["Everyone", "Friends", "No one"]);
                  else if (item.id === "followingList" || item.id === "likedVideos") void chooseValue(item.id, ["Everyone", "Friends", "Only you"]);
                }} />
              ) : null}
              {item.kind === "input" ? (
                <View style={styles.inputWrap}>
                  <TextInput
                    value={input}
                    onChangeText={setInput}
                    placeholder={item.subtitle}
                    placeholderTextColor="#999"
                    style={styles.input}
                    autoCapitalize="none"
                  />
                  <Pressable style={styles.save} onPress={() => void saveInput()}><Text style={styles.saveText}>Save</Text></Pressable>
                </View>
              ) : null}
              {index < visibleItems.length - 1 ? <View style={styles.separator} /> : null}
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
  back: { color: "#111", fontSize: 42, lineHeight: 44, fontWeight: "300" },
  title: { color: "#111", fontSize: 21, lineHeight: 27, fontWeight: "900", maxWidth: 280 },
  headerSpacer: { width: 52 },
  content: { paddingTop: 18, paddingBottom: 48 },
  card: { marginHorizontal: 18, backgroundColor: "#fff", borderRadius: 10, overflow: "hidden" },
  row: { minHeight: 80, paddingHorizontal: 22, flexDirection: "row", alignItems: "center" },
  pressed: { backgroundColor: "#f5f5f5" },
  copy: { flex: 1, paddingRight: 12 },
  label: { color: "#111", fontSize: 17, lineHeight: 22, fontWeight: "600" },
  subtitle: { color: "#8b8b8b", fontSize: 13, lineHeight: 18, marginTop: 4 },
  choiceTrailing: { flexDirection: "row", alignItems: "center", maxWidth: 150 },
  choiceText: { color: "#858585", fontSize: 15, marginRight: 4 },
  chevron: { color: "#8c8c8c", fontSize: 31, lineHeight: 32, fontWeight: "300" },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: "#ededed" },
  choiceHit: { height: 0 },
  inputWrap: { padding: 16, paddingTop: 0 },
  input: { backgroundColor: "#f4f4f4", borderRadius: 10, paddingHorizontal: 13, minHeight: 46, color: "#111", borderWidth: 1, borderColor: "#e4e4e4" },
  save: { marginTop: 10, alignSelf: "flex-end", backgroundColor: "#ff2d55", borderRadius: 9, paddingHorizontal: 18, paddingVertical: 10 },
  saveText: { color: "#fff", fontWeight: "900" },
});
