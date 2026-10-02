import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

type Notification = {
  id: string;
  type: string;
  read: boolean;
  createdAt: string;
  streamId?: string | null;
  metadata?: Record<string, string> | null;
  actor?: { id: string; username?: string; nickname?: string } | null;
};

function titleFor(n: Notification) {
  if (n.type === "LIVE_GUEST_INVITE") return "LIVE guest invitation";
  if (n.type === "LIVE_GUEST_RESPONSE") return n.metadata?.status === "ACTIVE" ? "Guest accepted your LIVE invitation" : "Guest declined your LIVE invitation";
  if (n.type === "FOLLOW") return "New follower";
  if (n.type === "LIKE") return "Someone liked your video";
  if (n.type === "COMMENT") return "New comment";
  if (n.type === "REPOST") return "Your video was reposted";
  if (n.type === "MENTION") return "You were mentioned";
  return "New notification";
}

export default function NotificationsScreen() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async (refresh = false) => {
    const token = await getAuthToken();
    if (!token) { setLoading(false); return; }
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const headers = { Authorization: "Bearer " + token };
      const [list, count] = await Promise.all([
        fetch(API + "/notifications?limit=100", { headers }),
        fetch(API + "/notifications/unread-count", { headers })
      ]);
      const data = await list.json().catch(() => ({}));
      const countData = await count.json().catch(() => ({}));
      if (list.ok) setItems(data.notifications ?? []);
      if (count.ok) setUnread(Number(countData.count ?? 0));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function markRead(notificationId?: string) {
    const token = await getAuthToken();
    if (!token) return;
    await fetch(API + "/notifications/read", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(notificationId ? { notificationId } : {})
    }).catch(() => {});
    setItems(current => notificationId ? current.map(n => n.id === notificationId ? { ...n, read: true } : n) : current.map(n => ({ ...n, read: true })));
    setUnread(current => notificationId ? Math.max(0, current - 1) : 0);
  }

  function open(n: Notification) {
    void markRead(n.id);
    if (n.type === "LIVE_GUEST_INVITE" && n.streamId) {
      router.push({ pathname: "/live-shop", params: { streamId: n.streamId } });
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>‹</Text></Pressable>
        <View style={styles.heading}><Text style={styles.title}>Notifications</Text>{unread > 0 ? <Text style={styles.badge}>{unread > 99 ? "99+" : unread}</Text> : null}</View>
        <Pressable onPress={() => void markRead()}><Text style={styles.readAll}>Read all</Text></Pressable>
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color="#fff" /></View> :
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#fff" />}
          contentContainerStyle={items.length ? styles.list : styles.emptyList}
          renderItem={({ item }) => (
            <Pressable onPress={() => open(item)} style={[styles.row, !item.read && styles.unreadRow]}>
              <View style={[styles.dot, item.read && styles.dotRead]} />
              <View style={styles.body}>
                <Text style={styles.itemTitle}>{titleFor(item)}</Text>
                <Text style={styles.actor}>{item.actor?.nickname || item.actor?.username || "TwiTok"}{item.type === "LIVE_GUEST_INVITE" ? " invited you to join a LIVE as a guest." : item.type === "LIVE_GUEST_RESPONSE" ? " responded to your guest invitation." : ""}</Text>
                <Text style={styles.time}>{new Date(item.createdAt).toLocaleString()}</Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={<View><Text style={styles.emptyTitle}>You're all caught up</Text><Text style={styles.emptyText}>New activity and LIVE invitations will appear here.</Text></View>}
        />
      }
    </View>
  );
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:"#050505",paddingTop:50},
  header:{height:58,flexDirection:"row",alignItems:"center",paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:"#222"},
  back:{color:"#fff",fontSize:36,lineHeight:38,width:42},
  heading:{flex:1,flexDirection:"row",alignItems:"center",gap:8},
  title:{color:"#fff",fontSize:20,fontWeight:"900"},
  badge:{backgroundColor:"#ff2d55",color:"#fff",fontSize:11,fontWeight:"900",borderRadius:12,paddingHorizontal:7,paddingVertical:3},
  readAll:{color:"#ff2d55",fontSize:12,fontWeight:"800"},
  list:{paddingBottom:30},
  row:{flexDirection:"row",padding:15,borderBottomWidth:1,borderBottomColor:"#171717"},
  unreadRow:{backgroundColor:"#101010"},
  dot:{width:9,height:9,borderRadius:5,backgroundColor:"#ff2d55",marginTop:5,marginRight:12},
  dotRead:{backgroundColor:"#333"},
  body:{flex:1},
  itemTitle:{color:"#fff",fontSize:14,fontWeight:"900"},
  actor:{color:"#bbb",fontSize:12,lineHeight:18,marginTop:4},
  time:{color:"#666",fontSize:10,marginTop:5},
  center:{flex:1,alignItems:"center",justifyContent:"center"},
  emptyList:{flexGrow:1,alignItems:"center",justifyContent:"center",padding:30},
  emptyTitle:{color:"#fff",fontSize:18,fontWeight:"900",textAlign:"center"},
  emptyText:{color:"#777",fontSize:12,textAlign:"center",marginTop:8}
});
