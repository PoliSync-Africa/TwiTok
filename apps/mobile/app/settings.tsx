import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Colors, Typography } from "../theme/typography";

type Row = { key: string; label: string; icon: string; value?: string };

const sections: Array<{ title: string; rows: Row[] }> = [
  {
    title: "Preferences",
    rows: [
      { key: "music", label: "Music", icon: "♫" },
      { key: "inbox", label: "Inbox & Messaging", icon: "◉" },
      { key: "activity", label: "Activity centre", icon: "◷" },
      { key: "audience", label: "Audience control", icon: "♟" },
      { key: "ads", label: "Ads", icon: "▰" },
      { key: "playback", label: "Playback", icon: "▶", value: " " },
      { key: "language", label: "Language", icon: "A" },
      { key: "display", label: "Display", icon: "◐" },
      { key: "accessibility", label: "Accessibility", icon: "✦", value: " " },
      { key: "contacts", label: "Contacts and location", icon: "♧" },
    ],
  },
  {
    title: "Cache & mobile",
    rows: [
      { key: "offline", label: "Offline videos", icon: "⇩" },
      { key: "space", label: "Free up space", icon: "▣" },
      { key: "data", label: "Data Saver", icon: "⌁" },
    ],
  },
  {
    title: "Activity",
    rows: [
      { key: "manage", label: "Manage posts", icon: "▣" },
      { key: "content", label: "Content preferences", icon: "◧" },
      { key: "live", label: "LIVE", icon: "▻" },
      { key: "notifications", label: "Notifications", icon: "♧" },
      { key: "wellbeing", label: "Time and well-being", icon: "⌛", value: " " },
      { key: "family", label: "Family Pairing", icon: "♥" },
    ],
  },
  {
    title: "Account",
    rows: [
      { key: "account", label: "Account", icon: "●" },
      { key: "security", label: "Security and permissions", icon: "▣" },
      { key: "share", label: "Share profile", icon: "↗" },
      { key: "balance", label: "Balance", icon: "$" },
    ],
  },
  {
    title: "Visibility",
    rows: [
      { key: "private", label: "Private account", icon: "▣" },
      { key: "blocked", label: "Blocked accounts", icon: "⊘" },
    ],
  },
  {
    title: "Interactions",
    rows: [
      { key: "comments", label: "Comments", icon: "•••" },
      { key: "mentions", label: "Mentions", icon: "@" },
      { key: "dm", label: "Direct messages", icon: "➤" },
      { key: "reuse", label: "Reuse of content", icon: "▷" },
      { key: "sharing", label: "Display profile when sharing...", icon: "↗", value: "On" },
      { key: "downloads", label: "Downloads", icon: "⇩", value: "On" },
      { key: "following", label: "Following list", icon: "♟", value: "Only you" },
      { key: "liked", label: "Liked videos", icon: "♥", value: "Only you" },
      { key: "viewers", label: "Viewers", icon: "◉", value: "On" },
    ],
  },
  {
    title: "Support & about",
    rows: [
      { key: "help", label: "Help Centre", icon: "◌" },
      { key: "privacy", label: "Privacy Centre", icon: "▣" },
      { key: "terms", label: "Terms and policies", icon: "ⓘ" },
    ],
  },
];

function RowItem({ row }: { row: Row }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => {
        if (row.key === "balance") return router.push("/balance");
        router.push({ pathname: "/settings-detail", params: { kind: row.key, title: row.label } });
      }}
      accessibilityRole="button"
      accessibilityLabel={row.label}
    >
      <View style={styles.iconWrap}><Text style={styles.icon}>{row.icon}</Text></View>
      <Text style={styles.label} numberOfLines={1}>{row.label}</Text>
      <View style={styles.trailing}>
        {row.value ? <Text style={styles.value}>{row.value}</Text> : null}
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
  );
}

export default function SettingsScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Go back">
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Settings and privacy</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {sections.map((section) => (
          <View key={section.title} style={styles.sectionWrap}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.card}>{section.rows.map((row) => <RowItem key={row.key} row={row} />)}</View>
          </View>
        ))}
        <View style={styles.loginSection}>
          <Text style={styles.sectionTitle}>Login</Text>
          <View style={styles.card}>
            <RowItem row={{ key: "switch", label: "Switch account", icon: "⇄" }} />
            <Pressable
              style={styles.row}
              onPress={() => router.push("/logout")}
              accessibilityRole="button"
              accessibilityLabel="Log out"
            >
              <View style={styles.iconWrap}><Text style={styles.icon}>⇥</Text></View>
              <Text style={styles.label}>Log out</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.version}>TwiTok mobile • Settings and privacy</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  header: {
    height: 96,
    paddingTop: 42,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e8e8e8",
  },
  backButton: { width: 52, height: 50, alignItems: "center", justifyContent: "center" },
  back: { color: "#111", fontSize: 42, lineHeight: 44, fontWeight: "300" },
  title: { color: "#111", fontSize: 22, lineHeight: 28, fontWeight: "900", letterSpacing: -0.4 },
  headerSpacer: { width: 52 },
  content: { paddingTop: 18, paddingBottom: 48 },
  sectionWrap: { marginBottom: 26 },
  sectionTitle: { color: "#858585", fontSize: 18, lineHeight: 24, fontWeight: "700", marginHorizontal: 54, marginBottom: 12 },
  card: {
    marginHorizontal: 18,
    backgroundColor: "#fff",
    borderRadius: 8,
    overflow: "hidden",
  },
  row: {
    minHeight: 68,
    paddingHorizontal: 34,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ededed",
  },
  rowPressed: { backgroundColor: "#f0f0f0" },
  iconWrap: { width: 36, alignItems: "flex-start", justifyContent: "center" },
  icon: { color: "#a9a9a9", fontSize: 23, fontWeight: "600" },
  label: { flex: 1, color: "#111", fontSize: 18, lineHeight: 23, fontWeight: "500" },
  trailing: { flexDirection: "row", alignItems: "center", maxWidth: 150 },
  value: { color: "#8a8a8a", fontSize: 17, marginRight: 7 },
  chevron: { color: "#8c8c8c", fontSize: 31, lineHeight: 32, fontWeight: "300" },
  loginSection: { marginTop: 2 },
  version: { textAlign: "center", color: "#aaa", fontSize: 12, marginTop: 10, marginBottom: 30 },
});
