import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getAuthToken } from "../lib/auth";
import { Colors, Typography } from "../theme/typography";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
const GUEST_LIMIT = 15;

type Stream = { streamId: string; title: string; category?: string; status: "SCHEDULED"|"LIVE"|"ENDED"; viewerCount?: number; guestLimit?: number; hostUserId: string };
type Guest = { userId: string; status: "INVITED"|"ACCEPTED"|"DECLINED"|"REMOVED" };

export default function LiveScreen() {
  const insets = useSafeAreaInsets();
  // LIVE control plane: the current backend creates/manages the session. A production
  // broadcast transport is intentionally not faked here; Start LIVE reflects the
  // server state and the actual media transport can be connected separately.
  const [title, setTitle] = useState("");
  const [username, setUsername] = useState("");
  const [stream, setStream] = useState<Stream | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function request(path: string, init: RequestInit = {}) {
    const token = await getAuthToken();
    if (!token) throw new Error("Sign in required");
    const r = await fetch(API + path, {
      ...init,
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(init.headers || {}) },
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error ?? "LIVE request failed");
    return d;
  }

  async function create() {
    if (!title.trim()) return;
    setBusy(true); setError("");
    try {
      const d = await request("/live/streams", { method: "POST", body: JSON.stringify({ title: title.trim() }) });
      setStream(d); setTitle("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create LIVE"); }
    finally { setBusy(false); }
  }

  async function changeStatus(status: "LIVE"|"ENDED") {
    if (!stream) return;
    setBusy(true); setError("");
    try {
      const d = await request("/live/streams/" + encodeURIComponent(stream.streamId) + "/status", { method: "POST", body: JSON.stringify({ status }) });
      setStream(d);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update LIVE"); }
    finally { setBusy(false); }
  }

  async function refreshGuests() {
    if (!stream) return;
    try {
      const d = await request("/live/streams/" + encodeURIComponent(stream.streamId) + "/guests");
      setGuests(Array.isArray(d.guests) ? d.guests : []);
    } catch {}
  }

  async function invite() {
    if (!stream || !username.trim()) return;
    setBusy(true); setError("");
    try {
      await request("/live/streams/" + encodeURIComponent(stream.streamId) + "/guests", { method: "POST", body: JSON.stringify({ username: username.trim() }) });
      setUsername(""); await refreshGuests();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to invite guest"); }
    finally { setBusy(false); }
  }

  useEffect(() => { if (stream) void refreshGuests(); }, [stream?.streamId]);

  if (!stream) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}><Pressable onPress={() => router.back()}><Text style={styles.back}>‹</Text></Pressable><Text style={styles.title}>Go LIVE</Text><View style={{ width: 30 }} /></View>
        <View style={styles.form}>
          <Text style={styles.heading}>Start your LIVE</Text>
          <Text style={styles.sub}>Create the session first, then start the broadcast when you're ready.</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="LIVE title" placeholderTextColor={Colors.textMuted} style={styles.input} maxLength={150} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable onPress={create} disabled={busy || !title.trim()} style={[styles.primary, (busy || !title.trim()) && styles.disabled]}>
            {busy ? <ActivityIndicator color={Colors.background} /> : <Text style={styles.primaryText}>Create LIVE</Text>}
          </Pressable>
        </View>
      </View>
    );
  }

  const accepted = guests.filter(g => g.status === "ACCEPTED").length;
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}><Pressable onPress={() => router.back()}><Text style={styles.back}>‹</Text></Pressable><Text style={styles.title}>LIVE Control</Text><View style={{ width: 30 }} /></View>
      <FlatList
        data={guests}
        keyExtractor={g => g.userId}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <View style={styles.hero}>
              <Text style={styles.liveBadge}>{stream.status}</Text>
              <Text style={styles.heading}>{stream.title}</Text>
              <Text style={styles.sub}>{stream.viewerCount ?? 0} viewers · {accepted}/{GUEST_LIMIT} guest slots accepted</Text>
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {stream.status === "SCHEDULED" ? <Pressable onPress={() => changeStatus("LIVE")} disabled={busy} style={styles.primary}><Text style={styles.primaryText}>Start LIVE</Text></Pressable> : null}
            {stream.status === "LIVE" ? <Pressable onPress={() => changeStatus("ENDED")} disabled={busy} style={styles.danger}><Text style={styles.primaryText}>End LIVE</Text></Pressable> : null}
            <Text style={styles.section}>Invite guests</Text>
            <Text style={styles.sub}>Up to {GUEST_LIMIT} guests can be accepted into the session. Streaming transport is kept separate from this control plane.</Text>
            <View style={styles.row}><TextInput value={username} onChangeText={setUsername} placeholder="@username" placeholderTextColor={Colors.textMuted} autoCapitalize="none" style={[styles.input, { flex: 1 }]} /><Pressable onPress={invite} disabled={busy || !username.trim()} style={[styles.invite, (!username.trim() || busy) && styles.disabled]}><Text style={styles.inviteText}>Invite</Text></Pressable></View>
            <Text style={styles.section}>Guest roster</Text>
          </View>
        }
        renderItem={({ item, index }) => <View style={styles.guest}><Text style={styles.guestIndex}>{index + 1}</Text><Text style={styles.guestId}>{item.userId}</Text><Text style={styles.guestStatus}>{item.status}</Text></View>}
        ListEmptyComponent={<Text style={styles.empty}>No guest invitations yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:Colors.background},
  header:{height:58,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:18,borderBottomWidth:1,borderBottomColor:Colors.border},
  back:{color:Colors.text,fontSize:34,lineHeight:36},
  title:{color:Colors.text,...Typography.section},
  form:{padding:20},
  content:{padding:18,paddingBottom:40},
  hero:{backgroundColor:Colors.surface,borderWidth:1,borderColor:Colors.border,borderRadius:16,padding:18,marginBottom:14},
  liveBadge:{color:Colors.text,...Typography.captionMedium,marginBottom:8},
  heading:{color:Colors.text,...Typography.title},
  sub:{color:Colors.textSecondary,...Typography.body,marginTop:6},
  input:{backgroundColor:Colors.surface,borderWidth:1,borderColor:Colors.border,borderRadius:11,color:Colors.text,...Typography.body,paddingHorizontal:13,paddingVertical:13,marginTop:16},
  primary:{minHeight:48,borderRadius:12,backgroundColor:Colors.text,alignItems:"center",justifyContent:"center",marginTop:12},
  danger:{minHeight:48,borderRadius:12,backgroundColor:Colors.danger,alignItems:"center",justifyContent:"center",marginTop:12},
  primaryText:{color:Colors.background,...Typography.button},
  disabled:{opacity:.45},
  error:{color:Colors.danger,...Typography.caption,marginTop:10},
  section:{color:Colors.text,...Typography.section,marginTop:24,marginBottom:8},
  row:{flexDirection:"row",alignItems:"center",gap:8},
  invite:{marginTop:16,minHeight:48,paddingHorizontal:18,borderRadius:11,backgroundColor:Colors.text,alignItems:"center",justifyContent:"center"},
  inviteText:{color:Colors.background,...Typography.label},
  guest:{flexDirection:"row",alignItems:"center",paddingVertical:12,borderBottomWidth:1,borderBottomColor:Colors.border,gap:10},
  guestIndex:{color:Colors.textSecondary,...Typography.caption},
  guestId:{color:Colors.text,...Typography.body,flex:1},
  guestStatus:{color:Colors.textSecondary,...Typography.captionMedium},
  empty:{color:Colors.textSecondary,...Typography.body,textAlign:"center",padding:28}
});
