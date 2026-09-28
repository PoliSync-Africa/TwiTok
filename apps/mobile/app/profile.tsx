import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

type Profile = { id:string; username:string; nickname?:string; bio?:string; countryCode?:string; followers:number; following:number; isFollowing:boolean; followPending:boolean; isPrivate:boolean };

export default function ProfileScreen() {
  const { username } = useLocalSearchParams<{username:string}>();
  const [profile,setProfile]=useState<Profile|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  async function load() {
    if(!username) return;
    try {
      const token=await getAuthToken();
      const r=await fetch(API+"/profile/"+encodeURIComponent(String(username)),{headers:token?{Authorization:"Bearer "+token}:{}});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error??"Profile unavailable");
      setProfile(d.profile);
    } catch(e){setError(e instanceof Error?e.message:"Profile unavailable");}
    finally{setLoading(false);}
  }
  useEffect(()=>{load();},[username]);

  async function follow() {
    if(!profile||busy) return;
    setBusy(true);
    try {
      const token=await getAuthToken();
      if(!token) throw new Error("Sign in required");
      const method=profile.isFollowing?"DELETE":"POST";
      const r=await fetch(API+"/profile/"+encodeURIComponent(profile.username)+"/follow",{method,headers:{Authorization:"Bearer "+token}});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error??"Unable to update follow");
      setProfile(p=>p?{...p,isFollowing:Boolean(d.following),followPending:Boolean(d.pending),followers:p.followers+(d.following?1:p.isFollowing?-1:0)}:p);
    } catch(e){setError(e instanceof Error?e.message:"Unable to update follow");}
    finally{setBusy(false);}
  }

  if(loading) return <View style={styles.center}><ActivityIndicator color="#fff"/></View>;
  if(error||!profile) return <View style={styles.center}><Text style={styles.error}>{error||"Profile unavailable"}</Text><Pressable onPress={()=>router.back()}><Text style={styles.link}>Go back</Text></Pressable></View>;

  return <View style={styles.screen}>
    <View style={styles.header}><Pressable onPress={()=>router.back()}><Text style={styles.back}>‹</Text></Pressable><Text style={styles.headerTitle}>Profile</Text><View style={{width:32}}/></View>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{(profile.nickname||profile.username||"?").slice(0,1).toUpperCase()}</Text></View>
      <Text style={styles.nickname}>{profile.nickname||profile.username}</Text>
      <Text style={styles.username}>@{profile.username}</Text>
      {!!profile.bio&&<Text style={styles.bio}>{profile.bio}</Text>}
      <View style={styles.stats}><View><Text style={styles.stat}>{profile.followers}</Text><Text style={styles.statLabel}>Followers</Text></View><View><Text style={styles.stat}>{profile.following}</Text><Text style={styles.statLabel}>Following</Text></View></View>
      <Pressable onPress={follow} disabled={busy} style={[styles.followButton,profile.isFollowing&&styles.followingButton,profile.followPending&&styles.pendingButton]}>
        {busy?<ActivityIndicator color="#fff" size="small"/>:<Text style={styles.followText}>{profile.isFollowing?"Following":profile.followPending?"Requested":"Follow"}</Text>}
      </Pressable>
      {profile.isPrivate&&!profile.isFollowing?<Text style={styles.private}>This account is private. Follow to see their content.</Text>:<Text style={styles.private}>Creator profile</Text>}
    </ScrollView>
  </View>;
}

const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:"#000"}, header:{height:58,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:"#222"}, back:{color:"#fff",fontSize:40,lineHeight:40},headerTitle:{color:"#fff",fontSize:18,fontWeight:"800"},content:{alignItems:"center",padding:24},avatar:{width:92,height:92,borderRadius:46,backgroundColor:"#252525",alignItems:"center",justifyContent:"center",marginTop:18},avatarText:{color:"#fff",fontSize:34,fontWeight:"900"},nickname:{color:"#fff",fontSize:22,fontWeight:"800",marginTop:14},username:{color:"#aaa",fontSize:15,marginTop:4},bio:{color:"#ddd",fontSize:15,textAlign:"center",lineHeight:21,marginTop:14,maxWidth:330},stats:{flexDirection:"row",gap:55,marginTop:24,marginBottom:24},stat:{color:"#fff",fontSize:20,fontWeight:"900",textAlign:"center"},statLabel:{color:"#aaa",fontSize:12,marginTop:3},followButton:{minWidth:180,height:44,borderRadius:6,backgroundColor:"#ff2d55",alignItems:"center",justifyContent:"center"},followingButton:{backgroundColor:"#222",borderWidth:1,borderColor:"#555"},pendingButton:{backgroundColor:"#222",borderWidth:1,borderColor:"#555"},followText:{color:"#fff",fontWeight:"800"},private:{color:"#888",fontSize:13,textAlign:"center",marginTop:24},center:{flex:1,backgroundColor:"#000",alignItems:"center",justifyContent:"center",padding:24},error:{color:"#ff7188",textAlign:"center",marginBottom:15},link:{color:"#fff",fontWeight:"700"}
});