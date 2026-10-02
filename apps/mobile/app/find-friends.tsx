import { useEffect, useMemo, useState } from "react";
import { Alert, Linking as NativeLinking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Contacts from "expo-contacts/legacy";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

type Person = {
  id: string;
  username: string;
  nickname: string;
  countryCode?: string | null;
  profilePhotoUrl?: string | null;
  isVerified?: boolean;
  isPrivate?: boolean;
  reason?: string | null;
  mutualCount?: number;
  following?: boolean;
  pending?: boolean;
};

async function authHeaders() {
  const token = await getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function FindFriendsScreen() {
  const [contacts, setContacts] = useState<Person[]>([]);
  const [suggestions, setSuggestions] = useState<Person[]>([]);
  const [facebook, setFacebook] = useState<Person[]>([]);
  const [busy, setBusy] = useState<"contacts" | "facebook" | null>(null);
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");
  const url = Linking.useURL();

  useEffect(() => {
    void loadSuggestions();
  }, []);

  useEffect(() => {
    if (!url) return;
    const parsed = Linking.parse(url);
    if (parsed.path === "find-friends" && parsed.queryParams?.facebook === "connected") {
      void loadFacebookMatches();
    }
  }, [url]);

  async function loadSuggestions() {
    try {
      const r = await fetch(API + "/discover/suggestions?limit=24", { headers: await authHeaders() });
      const d = await r.json().catch(() => ({}));
      if (r.ok) setSuggestions(d.suggestions ?? []);
    } catch {}
  }

  async function syncContacts() {
    setBusy("contacts");
    setMessage("");
    try {
      const permission = await Contacts.requestPermissionsAsync();
      if (permission.status !== "granted") {
        setMessage("Contacts access was not granted. You can enable it later in your phone settings.");
        return;
      }
      const hashes = new Set<string>();
      let pageOffset = 0;
      while (pageOffset < 5000) {
        const page = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers],
          pageSize: 500,
          pageOffset
        });
        for (const contact of page.data) {
          for (const phone of contact.phoneNumbers ?? []) {
            const digits = String(phone.number ?? "").replace(/\D/g, "");
            if (digits.length >= 7) {
              hashes.add(await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, digits));
              if (digits.length >= 8) hashes.add(await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, digits.slice(-10)));
            }
          }
        }
        if (!page.hasNextPage) break;
        pageOffset += page.data.length || 500;
      }
      const r = await fetch(API + "/discover/contacts/match", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ hashes: [...hashes].slice(0, 2000) })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Unable to find contacts on TwiTok");
      setContacts(d.matches ?? []);
      setMessage((d.matches ?? []).length ? `${d.matches.length} people you know are on TwiTok.` : "No contacts matched yet. Try your suggestions below.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to sync contacts");
    } finally {
      setBusy(null);
    }
  }

  async function connectFacebook() {
    setBusy("facebook");
    setMessage("");
    try {
      const r = await fetch(API + "/discover/facebook/start", { headers: await authHeaders() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.authorizationUrl) throw new Error(d.error ?? "Facebook discovery is not configured yet");
      await NativeLinking.openURL(d.authorizationUrl);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to connect Facebook");
    } finally {
      setBusy(null);
    }
  }

  async function loadFacebookMatches() {
    setBusy("facebook");
    try {
      const r = await fetch(API + "/discover/facebook/matches", { headers: await authHeaders() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Unable to load Facebook matches");
      setFacebook(d.matches ?? []);
      setMessage((d.matches ?? []).length ? `${d.matches.length} Facebook connections are on TwiTok.` : "No Facebook matches are available yet.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to load Facebook matches");
    } finally {
      setBusy(null);
    }
  }

  async function follow(person: Person) {
    try {
      const r = await fetch(API + "/profile/" + encodeURIComponent(person.username) + "/follow", { method: "POST", headers: await authHeaders() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Unable to follow");
      setFollowing(current => ({ ...current, [person.id]: d.following === true }));
      setPending(current => ({ ...current, [person.id]: d.pending === true }));
    } catch (e) {
      Alert.alert("Could not follow", e instanceof Error ? e.message : "Unable to follow this account");
    }
  }

  const groups = useMemo(() => [
    { title: "From your contacts", people: contacts },
    { title: "From Facebook", people: facebook },
    { title: "Suggested for you", people: suggestions }
  ], [contacts, facebook, suggestions]);

  return <ScrollView style={styles.container} contentContainerStyle={styles.content}>
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.logo}>TwiTok</Text>
        <Text style={styles.title}>Find friends</Text>
        <Text style={styles.subtitle}>Find people you know, then choose who you want to follow.</Text>
      </View>
      <Pressable onPress={() => router.replace("/feed")}><Text style={styles.skip}>Skip</Text></Pressable>
    </View>

    <View style={styles.privacyCard}>
      <Text style={styles.privacyTitle}>Your contacts stay private</Text>
      <Text style={styles.privacyText}>TwiTok reads contacts only after you allow access and sends one-way phone hashes for matching. We do not upload your contact names or store your address book.</Text>
    </View>

    <View style={styles.connectRow}>
      <Pressable style={styles.primary} onPress={syncContacts} disabled={busy !== null}><Text style={styles.primaryText}>{busy === "contacts" ? "Syncing…" : "Sync phone contacts"}</Text></Pressable>
      <Pressable style={styles.secondary} onPress={connectFacebook} disabled={busy !== null}><Text style={styles.secondaryText}>{busy === "facebook" ? "Connecting…" : "Connect Facebook"}</Text></Pressable>
    </View>

    {message ? <Text style={styles.message}>{message}</Text> : null}

    {groups.map(group => group.people.length ? <View key={group.title} style={styles.section}>
      <Text style={styles.sectionTitle}>{group.title}</Text>
      {group.people.map(person => <View key={person.id} style={styles.person}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{(person.nickname || person.username).slice(0,1).toUpperCase()}</Text></View>
        <View style={styles.personCopy}><Text style={styles.nickname}>{person.nickname}</Text><Text style={styles.username}>@{person.username}</Text>{person.reason ? <Text style={styles.reason}>{person.reason}</Text> : null}</View>
        <Pressable style={styles.follow} onPress={() => follow(person)} disabled={following[person.id] || pending[person.id]}><Text style={styles.followText}>{following[person.id] ? "Following" : pending[person.id] ? "Requested" : "Follow"}</Text></Pressable>
      </View>)}
    </View> : null)}

    <Pressable style={styles.continue} onPress={() => router.replace("/feed")}><Text style={styles.continueText}>Continue to TwiTok</Text></Pressable>
  </ScrollView>;
}

const styles=StyleSheet.create({
  container:{flex:1,backgroundColor:"#000"},
  content:{padding:20,paddingTop:58,paddingBottom:40},
  header:{flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18},
  headerCopy:{flex:1,paddingRight:12},
  logo:{color:"#d4af37",fontSize:20,fontWeight:"900",marginBottom:8},
  title:{color:"#fff",fontSize:32,fontWeight:"900"},
  subtitle:{color:"#999",fontSize:14,lineHeight:20,marginTop:6},
  skip:{color:"#aaa",fontSize:14,fontWeight:"800",paddingTop:4},
  privacyCard:{backgroundColor:"#171717",borderWidth:1,borderColor:"#2b2b2b",borderRadius:16,padding:15,marginBottom:14},
  privacyTitle:{color:"#fff",fontSize:14,fontWeight:"900",marginBottom:5},
  privacyText:{color:"#888",fontSize:12,lineHeight:18},
  connectRow:{gap:10,marginBottom:10},
  primary:{backgroundColor:"#d4af37",borderRadius:12,paddingVertical:14,alignItems:"center"},
  primaryText:{color:"#000",fontSize:14,fontWeight:"900"},
  secondary:{backgroundColor:"#222",borderRadius:12,paddingVertical:14,alignItems:"center",borderWidth:1,borderColor:"#333"},
  secondaryText:{color:"#fff",fontSize:14,fontWeight:"900"},
  message:{color:"#aaa",fontSize:12,lineHeight:18,marginBottom:8,textAlign:"center"},
  section:{marginTop:18},
  sectionTitle:{color:"#fff",fontSize:18,fontWeight:"900",marginBottom:10},
  person:{flexDirection:"row",alignItems:"center",paddingVertical:11},
  avatar:{width:48,height:48,borderRadius:24,backgroundColor:"#222",alignItems:"center",justifyContent:"center",marginRight:11},
  avatarText:{color:"#d4af37",fontSize:18,fontWeight:"900"},
  personCopy:{flex:1},
  nickname:{color:"#fff",fontSize:14,fontWeight:"800"},
  username:{color:"#888",fontSize:12,marginTop:2},
  reason:{color:"#777",fontSize:11,marginTop:2},
  follow:{minWidth:88,backgroundColor:"#d4af37",borderRadius:9,paddingHorizontal:12,paddingVertical:8,alignItems:"center"},
  followText:{color:"#000",fontSize:12,fontWeight:"900"},
  continue:{marginTop:26,borderWidth:1,borderColor:"#444",borderRadius:12,paddingVertical:14,alignItems:"center"},
  continueText:{color:"#fff",fontWeight:"900"}
});
