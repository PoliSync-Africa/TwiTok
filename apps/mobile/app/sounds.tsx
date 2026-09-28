import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

type Sound = { _id: string; title: string; artist: string; type: string; durationMs: number; usageCount: number; audioUrl?: string };

export default function SoundsScreen() {
  const { videoId, select } = useLocalSearchParams<{ videoId?: string; select?: string }>();
  const [query, setQuery] = useState("");
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function load(q = query) {
    setLoading(true); setError("");
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Sign in to browse sounds.");
      const r = await fetch(API + "/music/sounds?q=" + encodeURIComponent(q), { headers: { Authorization: "Bearer " + token } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Unable to load sounds");
      setSounds(Array.isArray(d.sounds) ? d.sounds : []);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load sounds"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(""); }, []);

  async function selectSound(sound: Sound) {
    if (busy) return;
    setBusy(sound._id); setError("");
    try {
      const token = await getAuthToken();
      if (!videoId && select === "1") { router.replace({ pathname: "/create", params: { soundId: sound._id, soundTitle: sound.title } }); return; }
      if (!videoId) return;
      const r = await fetch(API + "/music/videos/" + encodeURIComponent(videoId) + "/sound", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ soundId: sound._id })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Unable to attach sound");
      router.back();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to attach sound"); }
    finally { setBusy(""); }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.title}>Sounds</Text>
        <View style={{ width: 28 }} />
      </View>
      <View style={styles.searchRow}>
        <TextInput value={query} onChangeText={setQuery} onSubmitEditing={() => load(query)} placeholder="Search sounds or artists" placeholderTextColor="#888" style={styles.input} returnKeyType="search" />
        <Pressable style={styles.search} onPress={() => load(query)}><Text style={styles.searchText}>Search</Text></Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color="#fff" style={{ marginTop: 30 }} /> : (
        <FlatList
          data={sounds}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No sounds found yet.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => selectSound(item)} disabled={Boolean(busy)}>
              <View style={styles.note}><Text style={styles.noteText}>♫</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.soundTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.artist} numberOfLines={1}>{item.artist} · {Math.round((item.durationMs || 0) / 1000)}s · {item.usageCount || 0} uses</Text>
              </View>
              <Text style={styles.use}>{busy === item._id ? "…" : "Use"}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:"#000",paddingTop:48},
  header:{height:52,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:16},
  back:{color:"#fff",fontSize:38,lineHeight:40},
  title:{color:"#fff",fontSize:19,fontWeight:"800"},
  searchRow:{flexDirection:"row",gap:8,padding:12},
  input:{flex:1,height:46,borderRadius:12,backgroundColor:"#171717",color:"#fff",paddingHorizontal:14,fontSize:15},
  search:{height:46,borderRadius:12,paddingHorizontal:14,alignItems:"center",justifyContent:"center",backgroundColor:"#fff"},
  searchText:{color:"#000",fontWeight:"800"},
  list:{paddingHorizontal:12,paddingBottom:30},
  row:{flexDirection:"row",alignItems:"center",gap:12,paddingVertical:13,borderBottomWidth:1,borderBottomColor:"#202020"},
  note:{width:50,height:50,borderRadius:10,backgroundColor:"#202020",alignItems:"center",justifyContent:"center"},
  noteText:{color:"#fff",fontSize:25},
  soundTitle:{color:"#fff",fontSize:15,fontWeight:"700"},
  artist:{color:"#999",fontSize:12,marginTop:4},
  use:{color:"#fff",fontWeight:"800",paddingHorizontal:10},
  error:{color:"#ff6678",paddingHorizontal:16},
  empty:{color:"#888",textAlign:"center",paddingTop:40}
});
