import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
const WS = API.replace(/^http/, "ws").replace(/\/api\/v1$/, "") + "/realtime";

type Tab = "ALL" | "MESSAGES" | "ACTIVITY";
type Conversation = {
  id: string;
  otherUser?: { username?: string; nickname?: string; profilePhotoUrl?: string | null } | null;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
  updatedAt?: string;
  unreadCount?: number;
};
type Message = {
  _id: string;
  senderId: string;
  recipientId: string;
  text?: string;
  type?: "TEXT" | "VOICE";
  createdAt: string;
  status?: string;
};
type Notification = {
  id: string;
  type: "FOLLOW" | "LIKE" | "COMMENT" | "REPOST" | "MENTION" | "SYSTEM" | string;
  category?: string | null;
  title?: string | null;
  body?: string | null;
  read?: boolean;
  createdAt: string;
  actor?: { id?: string; username?: string; nickname?: string } | null;
};

const ICONS: Record<string, { ios: string; android: string; web: string }> = {
  back: { ios: "chevron.left", android: "arrow_back", web: "arrow_back" },
  search: { ios: "magnifyingglass", android: "search", web: "search" },
  plus: { ios: "plus", android: "add", web: "add" },
  settings: { ios: "ellipsis", android: "more_vert", web: "more_vert" },
  message: { ios: "message.fill", android: "chat_bubble", web: "chat_bubble" },
  bell: { ios: "bell.fill", android: "notifications", web: "notifications" },
  heart: { ios: "heart.fill", android: "favorite", web: "favorite" },
  comment: { ios: "bubble.left.fill", android: "comment", web: "comment" },
  person: { ios: "person.fill", android: "person", web: "person" },
  repost: { ios: "arrow.2.squarepath", android: "repeat", web: "repeat" },
  at: { ios: "at", android: "alternate_email", web: "alternate_email" },
  send: { ios: "arrow.up.circle.fill", android: "send", web: "send" },
  check: { ios: "checkmark", android: "check", web: "check" },
  close: { ios: "xmark", android: "close", web: "close" },
};

function Icon({ name, size = 23, color = "#fff" }: { name: string; size?: number; color?: string }) {
  const icon = ICONS[name] ?? ICONS.message;
  return <SymbolView name={icon} tintColor={color} size={size} fallback={<Text style={{ color, fontSize: size }}>•</Text>} />;
}

function initials(user?: Conversation["otherUser"]) {
  return (user?.nickname || user?.username || "?").slice(0, 1).toUpperCase();
}

function relativeTime(value?: string | null) {
  if (!value) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "now";
  if (seconds < 3600) return Math.floor(seconds / 60) + "m";
  if (seconds < 86400) return Math.floor(seconds / 3600) + "h";
  if (seconds < 604800) return Math.floor(seconds / 86400) + "d";
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
}

function NotificationIcon({ type }: { type: string }) {
  const name = type === "LIKE" ? "heart" : type === "COMMENT" ? "comment" : type === "FOLLOW" ? "person" : type === "MENTION" ? "at" : type === "REPOST" ? "repost" : "bell";
  const color = type === "LIKE" ? "#fe2c55" : "#fff";
  return <View style={styles.notificationIcon}><Icon name={name} size={20} color={color} /></View>;
}

export default function MessagesScreen() {
  const params = useLocalSearchParams<{ username?: string }>();
  const initialUsername = params.username ? String(params.username) : "";
  const [tab, setTab] = useState<Tab>("ALL");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [composeUsername, setComposeUsername] = useState(initialUsername);
  const [text, setText] = useState("");
  const [viewerId, setViewerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const socket = useRef<WebSocket | null>(null);
  const startedParam = useRef(false);

  async function request(path: string, init: RequestInit = {}) {
    const token = await getAuthToken();
    if (!token) throw new Error("Sign in required");
    const headers: Record<string, string> = { Authorization: "Bearer " + token };
    if (init.body) headers["Content-Type"] = "application/json";
    const response = await fetch(API + path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }

  async function loadInbox() {
    try {
      setError("");
      const [me, chats, activity] = await Promise.all([
        request("/auth/me"),
        request("/messages/conversations"),
        request("/notifications?limit=100"),
      ]);
      setViewerId(String(me.user?._id ?? me.user?.id ?? ""));
      setConversations(chats.conversations ?? []);
      setNotifications(activity.notifications ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load inbox");
    } finally {
      setLoading(false);
    }
  }

  async function openConversation(conversation: Conversation) {
    setActive(conversation);
    setError("");
    try {
      const data = await request("/messages/conversations/" + conversation.id + "/messages");
      setMessages(data.messages ?? []);
      await request("/messages/conversations/" + conversation.id + "/delivered", { method: "POST" });
      await request("/messages/conversations/" + conversation.id + "/read", { method: "POST" });
      setConversations(items => items.map(item => item.id === conversation.id ? { ...item, unreadCount: 0 } : item));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to open conversation");
    }
  }

  async function startConversation() {
    const username = composeUsername.trim().replace(/^@/, "");
    if (!username || busy) return;
    setBusy(true);
    try {
      const data = await request("/messages/conversations/direct", {
        method: "POST",
        body: JSON.stringify({ username }),
      });
      setComposeUsername("");
      await loadInbox();
      await openConversation({ id: data.conversation._id, otherUser: { username } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to start conversation");
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage() {
    if (!active || !text.trim() || busy) return;
    setBusy(true);
    try {
      const data = await request("/messages/conversations/" + active.id + "/messages", {
        method: "POST",
        body: JSON.stringify({ text: text.trim() }),
      });
      setMessages(items => [...items, data.message]);
      setText("");
      await loadInbox();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to send message");
    } finally {
      setBusy(false);
    }
  }

  async function markNotificationRead(item: Notification) {
    if (item.read) return;
    try {
      await request("/notifications/read", { method: "POST", body: JSON.stringify({ notificationId: item.id }) });
      setNotifications(items => items.map(current => current.id === item.id ? { ...current, read: true } : current));
    } catch {}
  }

  async function markAllRead() {
    try {
      await request("/notifications/read", { method: "POST", body: JSON.stringify({}) });
      setNotifications(items => items.map(item => ({ ...item, read: true })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to mark notifications read");
    }
  }

  function notificationText(item: Notification) {
    if (item.type === "SYSTEM") return item.body || item.title || "TwiTok update";
    const actor = item.actor?.nickname || (item.actor?.username ? "@" + item.actor.username : "Someone");
    if (item.type === "FOLLOW") return actor + " started following you";
    if (item.type === "LIKE") return actor + " liked your video";
    if (item.type === "COMMENT") return actor + " commented on your video";
    if (item.type === "REPOST") return actor + " reposted your video";
    if (item.type === "MENTION") return actor + " mentioned you";
    return actor + " interacted with you";
  }

  const unreadActivity = useMemo(() => notifications.filter(item => !item.read).length, [notifications]);
  const unreadMessages = useMemo(() => conversations.reduce((sum, item) => sum + Number(item.unreadCount ?? 0), 0), [conversations]);

  const combined = useMemo(() => {
    const chatItems = conversations.map(item => ({
      kind: "chat" as const,
      id: "chat:" + item.id,
      time: item.lastMessageAt || item.updatedAt || "",
      item,
    }));
    const notificationItems = notifications.map(item => ({
      kind: "notification" as const,
      id: "notification:" + item.id,
      time: item.createdAt,
      item,
    }));
    return [...chatItems, ...notificationItems].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  }, [conversations, notifications]);

  useEffect(() => {
    void loadInbox();

    const tokenPromise = getAuthToken();
    void tokenPromise.then(token => {
      if (!token) return;
      const ws = new WebSocket(WS);
      socket.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token }));
      ws.onmessage = event => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "notification:new" && data.notification) {
            setNotifications(items => [{ ...data.notification, read: false }, ...items]);
          }
          if ((data.type === "message:new" || data.type === "message:sent") && data.message) {
            if (active?.id === data.message.conversationId) {
              setMessages(items => items.some(item => item._id === data.message._id) ? items : [...items, data.message]);
            }
            void loadInbox();
          }
        } catch {}
      };
      socket.current = ws;
    });

    return () => {
      socket.current?.close();
      socket.current = null;
    };
  }, []);

  useEffect(() => {
    if (!initialUsername || startedParam.current || loading || active) return;
    startedParam.current = true;
    setComposeUsername(initialUsername);
    void startConversation();
  }, [initialUsername, loading, active]);

  if (active) {
    return (
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.chatHeader}>
          <Pressable style={styles.headerIcon} onPress={() => setActive(null)}><Icon name="back" /></Pressable>
          <View style={styles.chatIdentity}>
            <View style={styles.smallAvatar}>
              {active.otherUser?.profilePhotoUrl ? <Image source={{ uri: active.otherUser.profilePhotoUrl }} style={styles.avatarImage} /> : <Text style={styles.avatarInitial}>{initials(active.otherUser)}</Text>}
            </View>
            <View>
              <Text style={styles.chatName}>{active.otherUser?.nickname || "TwiTok user"}</Text>
              <Text style={styles.chatHandle}>@{active.otherUser?.username || "user"}</Text>
            </View>
          </View>
          <Pressable style={styles.headerIcon}><Icon name="settings" /></Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <ScrollView contentContainerStyle={styles.chatList}>
          {messages.map(item => {
            const mine = String(item.senderId) === viewerId;
            return (
              <View key={item._id} style={[styles.messageRow, mine ? styles.mineRow : styles.theirRow]}>
                <View style={[styles.bubble, mine ? styles.mineBubble : styles.theirBubble]}>
                  <Text style={styles.bubbleText}>{item.type === "VOICE" ? "🎤 Voice message" : item.text}</Text>
                  <Text style={styles.bubbleTime}>{relativeTime(item.createdAt)}</Text>
                </View>
              </View>
            );
          })}
          {!messages.length ? <View style={styles.empty}><Icon name="message" size={38} color="#777" /><Text style={styles.emptyTitle}>Start the conversation</Text><Text style={styles.emptyText}>Send a message to @{active.otherUser?.username || "this creator"}.</Text></View> : null}
        </ScrollView>

        <View style={styles.composer}>
          <Pressable style={styles.composerIcon}><Icon name="plus" size={22} color="#aaa" /></Pressable>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message..."
            placeholderTextColor="#777"
            style={styles.messageInput}
            multiline
            maxLength={4000}
          />
          <Pressable style={[styles.sendButton, (!text.trim() || busy) && styles.disabled]} onPress={() => void sendMessage()} disabled={!text.trim() || busy}>
            <Icon name="send" size={21} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable style={styles.headerIcon} onPress={() => router.back()}><Icon name="back" /></Pressable>
        <Text style={styles.title}>Inbox</Text>
        <Pressable style={styles.headerIcon}><Icon name="settings" /></Pressable>
      </View>

      <View style={styles.tabs}>
        {([
          ["ALL", "All", unreadMessages + unreadActivity],
          ["MESSAGES", "Messages", unreadMessages],
          ["ACTIVITY", "Activity", unreadActivity],
        ] as const).map(([key, label, count]) => (
          <Pressable key={key} style={[styles.tab, tab === key && styles.activeTab]} onPress={() => setTab(key)}>
            <Text style={[styles.tabText, tab === key && styles.activeTabText]}>{label}</Text>
            {count > 0 ? <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{count > 99 ? "99+" : count}</Text></View> : null}
          </Pressable>
        ))}
      </View>

      <View style={styles.newChatRow}>
        <View style={styles.searchBox}>
          <Icon name="search" size={18} color="#777" />
          <TextInput value={composeUsername} onChangeText={setComposeUsername} placeholder="Search people or start a chat" placeholderTextColor="#777" style={styles.searchInput} autoCapitalize="none" />
        </View>
        <Pressable style={styles.newChatButton} onPress={() => void startConversation()} disabled={busy || !composeUsername.trim()}>
          <Icon name="plus" size={21} color="#fff" />
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <ScrollView contentContainerStyle={styles.list}>
        {loading ? <ActivityIndicator color="#fff" style={{ marginTop: 40 }} /> : null}

        {tab === "ALL" && !loading ? combined.map(entry =>
          entry.kind === "chat" ? (
            <Pressable key={entry.id} style={styles.row} onPress={() => void openConversation(entry.item)}>
              <View style={styles.avatar}>
                {entry.item.otherUser?.profilePhotoUrl ? <Image source={{ uri: entry.item.otherUser.profilePhotoUrl }} style={styles.avatarImage} /> : <Text style={styles.avatarInitial}>{initials(entry.item.otherUser)}</Text>}
              </View>
              <View style={styles.rowBody}>
                <View style={styles.rowTitleLine}><Text style={styles.rowTitle}>{entry.item.otherUser?.nickname || "TwiTok user"}</Text><Text style={styles.time}>{relativeTime(entry.time)}</Text></View>
                <Text style={styles.rowPreview} numberOfLines={1}>{entry.item.lastMessagePreview || "Start a conversation"}</Text>
              </View>
              {Number(entry.item.unreadCount ?? 0) > 0 ? <View style={styles.unreadDot}><Text style={styles.unreadText}>{entry.item.unreadCount! > 99 ? "99+" : entry.item.unreadCount}</Text></View> : null}
            </Pressable>
          ) : (
            <Pressable key={entry.id} style={[styles.row, !entry.item.read && styles.unreadRow]} onPress={() => void markNotificationRead(entry.item)}>
              <NotificationIcon type={entry.item.type} />
              <View style={styles.rowBody}>
                <View style={styles.rowTitleLine}><Text style={styles.rowTitle}>{entry.item.title || (entry.item.actor?.nickname || "Activity")}</Text><Text style={styles.time}>{relativeTime(entry.time)}</Text></View>
                <Text style={styles.rowPreview} numberOfLines={2}>{notificationText(entry.item)}</Text>
              </View>
              {!entry.item.read ? <View style={styles.activityDot} /> : null}
            </Pressable>
          )
        ) : null}

        {tab === "MESSAGES" && !loading ? (
          conversations.length ? conversations.map(item => (
            <Pressable key={item.id} style={styles.row} onPress={() => void openConversation(item)}>
              <View style={styles.avatar}>
                {item.otherUser?.profilePhotoUrl ? <Image source={{ uri: item.otherUser.profilePhotoUrl }} style={styles.avatarImage} /> : <Text style={styles.avatarInitial}>{initials(item.otherUser)}</Text>}
              </View>
              <View style={styles.rowBody}>
                <View style={styles.rowTitleLine}><Text style={styles.rowTitle}>{item.otherUser?.nickname || "TwiTok user"}</Text><Text style={styles.time}>{relativeTime(item.lastMessageAt || item.updatedAt)}</Text></View>
                <Text style={styles.rowPreview} numberOfLines={1}>{item.lastMessagePreview || "Start a conversation"}</Text>
              </View>
              {Number(item.unreadCount ?? 0) > 0 ? <View style={styles.unreadDot}><Text style={styles.unreadText}>{item.unreadCount! > 99 ? "99+" : item.unreadCount}</Text></View> : null}
            </Pressable>
          )) : <View style={styles.empty}><Icon name="message" size={38} color="#777" /><Text style={styles.emptyTitle}>No messages yet</Text><Text style={styles.emptyText}>Start a conversation with a creator or friend.</Text></View>
        ) : null}

        {tab === "ACTIVITY" && !loading ? (
          <>
            <View style={styles.activityHeader}><Text style={styles.sectionTitle}>All activity</Text><Pressable onPress={() => void markAllRead()}><Text style={styles.markRead}>Mark all read</Text></Pressable></View>
            {notifications.length ? notifications.map(item => (
              <Pressable key={item.id} style={[styles.row, !item.read && styles.unreadRow]} onPress={() => void markNotificationRead(item)}>
                <NotificationIcon type={item.type} />
                <View style={styles.rowBody}>
                  <View style={styles.rowTitleLine}><Text style={styles.rowTitle}>{item.title || (item.actor?.nickname || "Activity")}</Text><Text style={styles.time}>{relativeTime(item.createdAt)}</Text></View>
                  <Text style={styles.rowPreview} numberOfLines={2}>{notificationText(item)}</Text>
                </View>
                {!item.read ? <View style={styles.activityDot} /> : null}
              </Pressable>
            )) : <View style={styles.empty}><Icon name="bell" size={38} color="#777" /><Text style={styles.emptyTitle}>No activity yet</Text><Text style={styles.emptyText}>Likes, comments, follows and mentions will appear here.</Text></View>}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:"#000"},
  header:{height:58,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:12,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:"#222"},
  headerIcon:{width:42,height:42,alignItems:"center",justifyContent:"center"},
  title:{color:"#fff",fontSize:19,fontWeight:"800"},
  tabs:{height:52,flexDirection:"row",alignItems:"flex-end",justifyContent:"center",gap:28,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:"#222"},
  tab:{height:52,alignItems:"center",justifyContent:"center",position:"relative",paddingHorizontal:4},
  activeTab:{borderBottomWidth:2,borderBottomColor:"#fff"},
  tabText:{color:"#777",fontSize:14,fontWeight:"800"},
  activeTabText:{color:"#fff"},
  tabBadge:{position:"absolute",right:-17,top:8,minWidth:18,height:18,borderRadius:9,backgroundColor:"#fe2c55",alignItems:"center",justifyContent:"center",paddingHorizontal:4},
  tabBadgeText:{color:"#fff",fontSize:9,fontWeight:"900"},
  newChatRow:{flexDirection:"row",padding:12,gap:8},
  searchBox:{flex:1,height:44,borderRadius:12,backgroundColor:"#181818",flexDirection:"row",alignItems:"center",paddingHorizontal:12},
  searchInput:{flex:1,color:"#fff",fontSize:14,marginLeft:8},
  newChatButton:{width:44,height:44,borderRadius:12,backgroundColor:"#fe2c55",alignItems:"center",justifyContent:"center"},
  list:{paddingBottom:30},
  row:{minHeight:76,flexDirection:"row",alignItems:"center",paddingHorizontal:16,paddingVertical:11,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:"#1d1d1d"},
  unreadRow:{backgroundColor:"#080808"},
  avatar:{width:52,height:52,borderRadius:26,backgroundColor:"#242424",alignItems:"center",justifyContent:"center",marginRight:12,overflow:"hidden"},
  smallAvatar:{width:40,height:40,borderRadius:20,backgroundColor:"#242424",alignItems:"center",justifyContent:"center",overflow:"hidden",marginRight:10},
  avatarImage:{width:"100%",height:"100%"},
  avatarInitial:{color:"#fff",fontSize:18,fontWeight:"900"},
  rowBody:{flex:1,minWidth:0},
  rowTitleLine:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10},
  rowTitle:{color:"#fff",fontSize:15,fontWeight:"800",flexShrink:1},
  rowPreview:{color:"#8f8f8f",fontSize:13,marginTop:4},
  time:{color:"#666",fontSize:11},
  unreadDot:{minWidth:22,height:22,borderRadius:11,backgroundColor:"#fe2c55",alignItems:"center",justifyContent:"center",marginLeft:8},
  unreadText:{color:"#fff",fontSize:9,fontWeight:"900"},
  notificationIcon:{width:52,height:52,borderRadius:26,backgroundColor:"#191919",alignItems:"center",justifyContent:"center",marginRight:12},
  activityDot:{width:8,height:8,borderRadius:4,backgroundColor:"#fe2c55",marginLeft:10},
  activityHeader:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:16,paddingVertical:14},
  sectionTitle:{color:"#fff",fontSize:15,fontWeight:"900"},
  markRead:{color:"#25f4ee",fontSize:12,fontWeight:"800"},
  error:{color:"#ff6b7f",fontSize:12,textAlign:"center",paddingHorizontal:16,paddingVertical:8},
  empty:{alignItems:"center",justifyContent:"center",paddingHorizontal:35,paddingTop:65},
  emptyTitle:{color:"#fff",fontSize:18,fontWeight:"900",marginTop:14},
  emptyText:{color:"#777",fontSize:13,textAlign:"center",marginTop:7,lineHeight:20},
  chatHeader:{height:62,flexDirection:"row",alignItems:"center",paddingHorizontal:10,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:"#222"},
  chatIdentity:{flex:1,flexDirection:"row",alignItems:"center"},
  chatName:{color:"#fff",fontSize:15,fontWeight:"900"},
  chatHandle:{color:"#777",fontSize:11,marginTop:2},
  chatList:{padding:14,paddingBottom:24},
  messageRow:{flexDirection:"row",marginBottom:10},
  mineRow:{justifyContent:"flex-end"},
  theirRow:{justifyContent:"flex-start"},
  bubble:{maxWidth:"78%",paddingHorizontal:13,paddingVertical:9,borderRadius:18},
  mineBubble:{backgroundColor:"#fe2c55",borderBottomRightRadius:5},
  theirBubble:{backgroundColor:"#252525",borderBottomLeftRadius:5},
  bubbleText:{color:"#fff",fontSize:15,lineHeight:20},
  bubbleTime:{color:"rgba(255,255,255,.55)",fontSize:9,marginTop:4,textAlign:"right"},
  composer:{flexDirection:"row",alignItems:"flex-end",paddingHorizontal:10,paddingVertical:8,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:"#222",backgroundColor:"#000",gap:7},
  composerIcon:{width:40,height:40,borderRadius:20,backgroundColor:"#191919",alignItems:"center",justifyContent:"center"},
  messageInput:{flex:1,maxHeight:110,minHeight:40,borderRadius:20,backgroundColor:"#191919",color:"#fff",paddingHorizontal:15,paddingVertical:9,fontSize:15},
  sendButton:{width:40,height:40,borderRadius:20,backgroundColor:"#fe2c55",alignItems:"center",justifyContent:"center"},
  disabled:{opacity:.35},
});
