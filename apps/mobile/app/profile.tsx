import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

type Video = { id:string; thumbnail?:string|null; playback?:string|null; caption?:string; status?:string };
type Profile = { id:string; username:string; nickname?:string; bio?:string; countryCode?:string; followers:number; following:number; likes:number; isFollowing:boolean; followPending:boolean; isPrivate:boolean; isVerified?:boolean; verificationType?:string|null; profilePhotoUrl?:string|null };

export default function ProfileScreen() {
  const { username: requestedUsername } = useLocalSearchParams<{username?:string}>();
  const [username, setUsername] = useState<string | null>(requestedUsername ? String(requestedUsername) : null);
  const [profile,setProfile]=useState<Profile|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [videos,setVideos]=useState<Video[]>([]);
  const [activeTab,setActiveTab]=useState<"videos"|"reposts"|"saved"|"liked"|"drafts">("videos");
  const [viewerId,setViewerId]=useState("");

  async function load() {
    try {
      const token=await getAuthToken();
      let target = username;
      if (!target) {
        if (!token) throw new Error("Sign in required");
        const me = await fetch(API+"/auth/me",{headers:{Authorization:"Bearer "+token}});
        const md = await me.json().catch(()=>({}));
        target = md.user?.username ? String(md.user.username) : null;
        if (!target) throw new Error("Profile setup is incomplete");
        setUsername(target);
      }
      const r=await fetch(API+"/profile/"+encodeURIComponent(target),{headers:token?{Authorization:"Bearer "+token}:{}});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error??"Profile unavailable");
      setProfile(d.profile);
      const me=await fetch(API+"/auth/me",{headers:token?{Authorization:"Bearer "+token}:{}});
      const md=await me.json().catch(()=>({})); setViewerId(md.user?._id?.toString?.() || md.user?.id || "");
      const vr=await fetch(API+"/profile/"+encodeURIComponent(String(username))+"/videos",{headers:token?{Authorization:"Bearer "+token}:{}});
      const vd=await vr.json().catch(()=>({})); if(vr.ok) setVideos(vd.videos??[]);
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

  async function publishDraft(videoId:string) {
    if (busy) return;
    setBusy(true);
    try {
      const token=await getAuthToken();
      if(!token) throw new Error("Sign in required");
      const r=await fetch(API+"/video/"+encodeURIComponent(videoId)+"/publish",{method:"POST",headers:{Authorization:"Bearer "+token}});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error??"Unable to publish draft");
      setVideos(items=>items.filter(item=>item.id!==videoId));
      Alert.alert("Published","Your draft is now live.");
    } catch(e) {
      Alert.alert("Draft","Unable to publish this draft.",[{text:e instanceof Error?e.message:"Try again"}]);
    } finally { setBusy(false); }
  }

  if(loading) return <View style={styles.center}><ActivityIndicator color="#fff"/></View>;
  if(error||!profile) return <View style={styles.center}><Text style={styles.error}>{error||"Profile unavailable"}</Text><Pressable onPress={()=>router.back()}><Text style={styles.link}>Go back</Text></Pressable></View>;

  return <View style={styles.screen}>
    <View style={styles.header}><Pressable onPress={()=>router.back()}><Text style={styles.back}>‹</Text></Pressable><Text style={styles.headerTitle}>Profile</Text><View style={{width:32}}/></View>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.avatar}>{profile.profilePhotoUrl?<Image source={{uri:profile.profilePhotoUrl}} style={styles.avatarImage}/>:<Text style={styles.avatarText}>{(profile.nickname||profile.username||"?").slice(0,1).toUpperCase()}</Text>}</View>
      <View style={styles.nameRow}><Text style={styles.nickname}>{profile.nickname||profile.username}</Text>{profile.isVerified&&<View style={styles.verifiedBadge}><Text style={styles.verifiedBadgeCheck}>✓</Text></View>}</View>
      <Text style={styles.username}>@{profile.username}</Text>
      {viewerId===profile.id&&<Pressable style={styles.verifyButton} onPress={()=>router.push("/verification")}><Text style={styles.verifyText}>Get verified</Text></Pressable>}{viewerId===profile.id&&<Pressable style={styles.editButton} onPress={()=>router.push({pathname:"/edit-profile",params:{username:profile.username,nickname:profile.nickname??"",bio:profile.bio??"",isPrivate:String(profile.isPrivate)}})}><Text style={styles.editText}>Edit profile</Text></Pressable>}
      {!!profile.bio&&<Text style={styles.bio}>{profile.bio}</Text>}
      <View style={styles.stats}><View><Text style={styles.stat}>{profile.followers}</Text><Text style={styles.statLabel}>Followers</Text></View><View><Text style={styles.stat}>{profile.following}</Text><Text style={styles.statLabel}>Following</Text></View><View><Text style={styles.stat}>{profile.likes}</Text><Text style={styles.statLabel}>Likes</Text></View></View>
      {viewerId!==profile.id&&<Pressable onPress={follow} disabled={busy} style={[styles.followButton,profile.isFollowing&&styles.followingButton,profile.followPending&&styles.pendingButton]}>
        {busy?<ActivityIndicator color="#fff" size="small"/>:<Text style={styles.followText}>{profile.isFollowing?"Following":profile.followPending?"Requested":"Follow"}</Text>}
      </Pressable>}
      {profile.isPrivate&&!profile.isFollowing?<Text style={styles.private}>This account is private. Follow to see their content.</Text>:<Text style={styles.private}>Creator profile</Text>}
      <View style={styles.tabs}>
        {(["videos","reposts",...(viewerId===profile?.id?["liked" as const,"saved" as const,"drafts" as const]:[])] as const).map(tab=><Pressable key={tab} style={[styles.tab,activeTab===tab&&styles.tabActive]} onPress={async()=>{
          setActiveTab(tab);
          try {
            const token=await getAuthToken();
            const endpoint=tab==="videos"?"videos":tab==="reposts"?"reposts":tab==="liked"?"liked":tab==="saved"?"saved":"drafts";
            const r=await fetch(API+"/profile/"+encodeURIComponent(String(username))+"/"+endpoint,{headers:token?{Authorization:"Bearer "+token}:{}});
            const d=await r.json().catch(()=>({}));
            if(r.ok) setVideos(d.videos??[]);
          } catch {}
        }}><Text style={[styles.tabText,activeTab===tab&&styles.tabTextActive]}>{tab==="videos"?"Videos":tab==="reposts"?"Reposts":tab==="liked"?"Liked":tab==="saved"?"Saved":"Drafts"}</Text></Pressable>)}
      </View>
      <View style={styles.grid}>{videos.map(v=><View key={v.id} style={styles.gridItem}>{v.thumbnail?<Image source={{uri:v.thumbnail}} style={styles.gridImage}/>:<View style={styles.gridFallback}><Text style={styles.gridFallbackText}>{activeTab==="drafts"?"✎":"▶"}</Text></View>}{activeTab==="drafts"?<View style={styles.draftOverlay}><Text style={styles.draftStatus}>{v.status==="PROCESSING"?"Processing":"Draft"}</Text><Pressable style={styles.publishDraftButton} onPress={()=>publishDraft(v.id)} disabled={busy}><Text style={styles.publishDraftText}>Publish</Text></Pressable></View>:<Pressable style={styles.gridTap} onPress={()=>v.playback&&router.push({pathname:"/feed",params:{videoId:v.id}})}/>}</View>)}</View>
    </ScrollView>
  </View>;
}

const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:"#000"}, header:{height:58,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:"#222"}, back:{color:"#fff",fontSize:40,lineHeight:40},headerTitle:{color:"#fff",fontSize:18,fontWeight:"800"},content:{alignItems:"center",padding:24},avatar:{width:92,height:92,borderRadius:46,backgroundColor:"#252525",alignItems:"center",justifyContent:"center",marginTop:18},avatarText:{color:"#fff",fontSize:34,fontWeight:"900"},avatarImage:{width:"100%",height:"100%",borderRadius:46},nameRow:{flexDirection:"row",alignItems:"center",gap:7,marginTop:14},nickname:{color:"#fff",fontSize:22,fontWeight:"800"},verifiedBadge:{width:18,height:18,borderRadius:9,backgroundColor:"#1877F2",alignItems:"center",justifyContent:"center"},verifiedBadgeCheck:{color:"#fff",fontSize:12,fontWeight:"900",lineHeight:14},username:{color:"#aaa",fontSize:15,marginTop:4},bio:{color:"#ddd",fontSize:15,textAlign:"center",lineHeight:21,marginTop:14,maxWidth:330},stats:{flexDirection:"row",gap:34,marginTop:24,marginBottom:24},stat:{color:"#fff",fontSize:20,fontWeight:"900",textAlign:"center"},statLabel:{color:"#aaa",fontSize:12,marginTop:3},followButton:{minWidth:180,height:44,borderRadius:6,backgroundColor:"#ff2d55",alignItems:"center",justifyContent:"center"},followingButton:{backgroundColor:"#222",borderWidth:1,borderColor:"#555"},pendingButton:{backgroundColor:"#222",borderWidth:1,borderColor:"#555"},followText:{color:"#fff",fontWeight:"800"},private:{color:"#888",fontSize:13,textAlign:"center",marginTop:24},verifyButton:{marginTop:12,paddingHorizontal:24,height:38,borderRadius:5,backgroundColor:"#fff",alignItems:"center",justifyContent:"center"},verifyText:{color:"#000",fontWeight:"800"},editButton:{marginTop:12,paddingHorizontal:24,height:38,borderRadius:5,borderWidth:1,borderColor:"#444",alignItems:"center",justifyContent:"center"},editText:{color:"#fff",fontWeight:"800"},tabs:{width:"100%",flexDirection:"row",marginTop:28,borderTopWidth:1,borderTopColor:"#222"},tab:{flex:1,alignItems:"center",paddingVertical:14,borderBottomWidth:2,borderBottomColor:"transparent"},tabActive:{borderBottomColor:"#fff"},tabText:{color:"#777",fontWeight:"800",fontSize:13},tabTextActive:{color:"#fff"},grid:{width:"100%",flexDirection:"row",flexWrap:"wrap",gap:2,marginTop:0,borderTopWidth:1,borderTopColor:"#222",paddingTop:2},gridItem:{width:"32.8%",aspectRatio:.72,backgroundColor:"#171717"},gridImage:{width:"100%",height:"100%"},gridFallback:{flex:1,alignItems:"center",justifyContent:"center"},gridFallbackText:{color:"#777",fontSize:20},gridTap:{position:"absolute",top:0,bottom:0,left:0,right:0},draftOverlay:{position:"absolute",left:0,right:0,bottom:0,padding:6,backgroundColor:"rgba(0,0,0,.72)",gap:5},draftStatus:{color:"#fff",fontSize:10,fontWeight:"800"},publishDraftButton:{backgroundColor:"#ff2d55",borderRadius:5,paddingVertical:6,alignItems:"center"},publishDraftText:{color:"#fff",fontSize:11,fontWeight:"900"},center:{flex:1,backgroundColor:"#000",alignItems:"center",justifyContent:"center",padding:24},error:{color:"#ff7188",textAlign:"center",marginBottom:15},link:{color:"#fff",fontWeight:"700"}
});