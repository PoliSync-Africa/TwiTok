import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
type Video = { id:string; thumbnail?:string|null; playback?:string|null; caption?:string; status?:string };
type Profile = { id:string; username:string; nickname?:string; bio?:string; countryCode?:string; followers:number; following:number; likes:number; isFollowing:boolean; followPending:boolean; isPrivate:boolean; isVerified?:boolean; verificationType?:string|null; profilePhotoUrl?:string|null };

export default function ProfileScreen() {
  const { username: requestedUsername } = useLocalSearchParams<{username?:string}>();
  const [username,setUsername]=useState<string|null>(requestedUsername?String(requestedUsername):null);
  const [profile,setProfile]=useState<Profile|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [videos,setVideos]=useState<Video[]>([]);
  const [activeTab,setActiveTab]=useState<"videos"|"reposts"|"saved"|"liked"|"drafts">("videos");
  const [viewerId,setViewerId]=useState("");

  async function load(){
    try{
      const token=await getAuthToken();
      let target=username;
      if(!target){
        if(!token)throw new Error("Sign in required");
        const me=await fetch(API+"/auth/me",{headers:{Authorization:"Bearer "+token}});
        const md=await me.json().catch(()=>({}));
        target=md.user?.username?String(md.user.username):null;
        if(!target)throw new Error("Profile setup is incomplete");
        setUsername(target);
      }
      const r=await fetch(API+"/profile/"+encodeURIComponent(target),{headers:token?{Authorization:"Bearer "+token}:{}});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error??"Profile unavailable");
      setProfile(d.profile);
      const me=await fetch(API+"/auth/me",{headers:token?{Authorization:"Bearer "+token}:{}});
      const md=await me.json().catch(()=>({}));setViewerId(md.user?._id?.toString?.()||md.user?.id||"");
      const vr=await fetch(API+"/profile/"+encodeURIComponent(target)+"/videos",{headers:token?{Authorization:"Bearer "+token}:{}});
      const vd=await vr.json().catch(()=>({}));if(vr.ok)setVideos(vd.videos??[]);
    }catch(e){setError(e instanceof Error?e.message:"Profile unavailable");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[username]);

  async function follow(){
    if(!profile||busy)return;
    setBusy(true);
    try{
      const token=await getAuthToken();if(!token)throw new Error("Sign in required");
      const method=profile.isFollowing?"DELETE":"POST";
      const r=await fetch(API+"/profile/"+encodeURIComponent(profile.username)+"/follow",{method,headers:{Authorization:"Bearer "+token}});
      const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error??"Unable to update follow");
      setProfile(p=>p?{...p,isFollowing:Boolean(d.following),followPending:Boolean(d.pending),followers:p.followers+(d.following?1:p.isFollowing?-1:0)}:p);
    }catch(e){setError(e instanceof Error?e.message:"Unable to update follow");}
    finally{setBusy(false);}
  }

  async function publishDraft(videoId:string){
    if(busy)return;
    setBusy(true);
    try{
      const token=await getAuthToken();if(!token)throw new Error("Sign in required");
      const r=await fetch(API+"/video/"+encodeURIComponent(videoId)+"/publish",{method:"POST",headers:{Authorization:"Bearer "+token}});
      const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error??"Unable to publish draft");
      setVideos(items=>items.filter(item=>item.id!==videoId));Alert.alert("Published","Your draft is now live.");
    }catch(e){Alert.alert("Draft",e instanceof Error?e.message:"Unable to publish this draft.");}
    finally{setBusy(false);}
  }

  async function loadTab(tab:typeof activeTab){
    setActiveTab(tab);
    try{
      const token=await getAuthToken();
      const endpoint=tab==="videos"?"videos":tab==="reposts"?"reposts":tab==="liked"?"liked":tab==="saved"?"saved":"drafts";
      const r=await fetch(API+"/profile/"+encodeURIComponent(String(username))+"/"+endpoint,{headers:token?{Authorization:"Bearer "+token}:{}});
      const d=await r.json().catch(()=>({}));if(r.ok)setVideos(d.videos??[]);
    }catch{}
  }

  if(loading)return <View style={styles.center}><ActivityIndicator color="#fff"/></View>;
  if(error||!profile)return <View style={styles.center}><Text style={styles.error}>{error||"Profile unavailable"}</Text><Pressable onPress={()=>router.back()}><Text style={styles.link}>Go back</Text></Pressable></View>;

  const own=viewerId===profile.id;
  const tabs=own?["videos","reposts","liked","saved","drafts"] as const:["videos","reposts"] as const;

  return <View style={styles.screen}>
    <View style={styles.topBar}>
      <Pressable onPress={()=>router.back()} style={styles.topIcon}><Text style={styles.topIconText}>‹</Text></Pressable>
      <Text style={styles.topTitle}>Profile</Text>
      <View style={styles.topRight}><Pressable style={styles.topIcon}><Text style={styles.topIconText}>♧</Text></Pressable><Pressable style={styles.topIcon}><Text style={styles.topIconText}>↗</Text></Pressable></View>
    </View>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.identityRow}>
        <View style={styles.identityCopy}>
          <View style={styles.nameLine}><Text style={styles.nickname}>{profile.nickname||profile.username}</Text>{profile.isVerified&&<View style={styles.verified}><Text style={styles.verifiedText}>✓</Text></View>}</View>
          <Text style={styles.username}>@{profile.username}</Text>
          <View style={styles.stats}>
            <View><Text style={styles.stat}>{profile.following}</Text><Text style={styles.statLabel}>Following</Text></View>
            <View><Text style={styles.stat}>{profile.followers}</Text><Text style={styles.statLabel}>Followers</Text></View>
            <View><Text style={styles.stat}>{profile.likes}</Text><Text style={styles.statLabel}>Likes</Text></View>
          </View>
        </View>
        <View style={styles.avatar}>{profile.profilePhotoUrl?<Image source={{uri:profile.profilePhotoUrl}} style={styles.avatarImage}/>:<Text style={styles.avatarText}>{(profile.nickname||profile.username||"?").slice(0,1).toUpperCase()}</Text>}</View>
      </View>

      {own ? <View style={styles.actionRow}><Pressable style={styles.editButton} onPress={()=>router.push({pathname:"/edit-profile",params:{username:profile.username,nickname:profile.nickname??"",bio:profile.bio??"",isPrivate:String(profile.isPrivate)}})}><Text style={styles.editText}>Edit profile</Text></Pressable><Pressable style={styles.iconButton} onPress={()=>router.push("/verification")}><Text style={styles.actionIcon}>✓</Text></Pressable><Pressable style={styles.iconButton}><Text style={styles.actionIcon}>⚙</Text></Pressable></View>
      : <View style={styles.actionRow}><Pressable style={styles.followButton} onPress={follow} disabled={busy}>{busy?<ActivityIndicator color="#fff"/>:<Text style={styles.followText}>{profile.isFollowing?"Following":profile.followPending?"Requested":"Follow"}</Text>}</Pressable><Pressable style={styles.messageButton} onPress={()=>router.push({pathname:"/messages",params:{username:profile.username}})}><Text style={styles.messageText}>Message</Text></Pressable><Pressable style={styles.iconButton}><Text style={styles.actionIcon}>＋</Text></Pressable></View>}

      {!!profile.bio&&<Text style={styles.bio}>{profile.bio}</Text>}
      <Pressable style={styles.livePill} onPress={()=>router.push("/live")}><Text style={styles.liveDot}>●</Text><Text style={styles.liveText}>LIVE</Text></Pressable>

      <View style={styles.tabs}>
        {tabs.map(tab=><Pressable key={tab} style={[styles.tab,activeTab===tab&&styles.tabActive]} onPress={()=>void loadTab(tab)}><Text style={styles.tabIcon}>{tab==="videos"?"▦":tab==="reposts"?"↻":tab==="liked"?"♡":tab==="saved"?"▣":"✎"}</Text></Pressable>)}
      </View>

      <View style={styles.grid}>{videos.map(v=><View key={v.id} style={styles.gridItem}>{v.thumbnail?<Image source={{uri:v.thumbnail}} style={styles.gridImage}/>:<View style={styles.gridFallback}><Text style={styles.gridFallbackText}>{activeTab==="drafts"?"✎":"▶"}</Text></View>}<Text style={styles.views}>▶  {v.status==="PROCESSING"?"Processing":"0"}</Text>{activeTab==="drafts"?<View style={styles.draftOverlay}><Text style={styles.draftStatus}>Draft</Text><Pressable style={styles.publishDraftButton} onPress={()=>publishDraft(v.id)} disabled={busy}><Text style={styles.publishDraftText}>Publish</Text></Pressable></View>:<Pressable style={styles.gridTap} onPress={()=>v.playback&&router.push({pathname:"/feed",params:{videoId:v.id}})}/>}</View>)}</View>
    </ScrollView>
  </View>;
}

const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:"#000"},
 topBar:{height:60,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:"rgba(255,255,255,.08)"},
 topRight:{flexDirection:"row",gap:4},topIcon:{width:38,height:38,alignItems:"center",justifyContent:"center"},topIconText:{color:"#fff",fontSize:25},topTitle:{color:"#fff",fontSize:16,fontWeight:"800"},
 content:{paddingTop:18,paddingBottom:40},
 identityRow:{flexDirection:"row",justifyContent:"space-between",paddingHorizontal:16},
 identityCopy:{flex:1,paddingRight:12},nameLine:{flexDirection:"row",alignItems:"center",gap:6},nickname:{color:"#fff",fontSize:30,fontWeight:"900",letterSpacing:-.8},verified:{width:19,height:19,borderRadius:10,backgroundColor:"#20b2aa",alignItems:"center",justifyContent:"center"},verifiedText:{color:"#fff",fontSize:11,fontWeight:"900"},username:{color:"rgba(255,255,255,.55)",fontSize:15,marginTop:3},
 avatar:{width:96,height:96,borderRadius:48,backgroundColor:"#1b1b1b",borderWidth:2,borderColor:"rgba(255,255,255,.22)",alignItems:"center",justifyContent:"center",overflow:"hidden"},avatarImage:{width:"100%",height:"100%"},avatarText:{color:"#fff",fontSize:36,fontWeight:"900"},
 stats:{flexDirection:"row",gap:24,marginTop:18},stat:{color:"#fff",fontSize:20,fontWeight:"900"},statLabel:{color:"rgba(255,255,255,.55)",fontSize:13,marginTop:2},
 actionRow:{flexDirection:"row",gap:8,paddingHorizontal:16,marginTop:18},followButton:{flex:1,height:42,borderRadius:8,backgroundColor:"#fe2c55",alignItems:"center",justifyContent:"center"},followText:{color:"#fff",fontSize:15,fontWeight:"900"},messageButton:{flex:1,height:42,borderRadius:8,backgroundColor:"#2a2a2a",alignItems:"center",justifyContent:"center"},messageText:{color:"#fff",fontSize:15,fontWeight:"800"},editButton:{flex:1,height:42,borderRadius:8,borderWidth:1,borderColor:"rgba(255,255,255,.18)",backgroundColor:"#151515",alignItems:"center",justifyContent:"center"},editText:{color:"#fff",fontSize:15,fontWeight:"800"},iconButton:{width:42,height:42,borderRadius:9,backgroundColor:"#202020",alignItems:"center",justifyContent:"center"},actionIcon:{color:"#fff",fontSize:20,fontWeight:"800"},
 bio:{color:"#fff",fontSize:15,lineHeight:21,paddingHorizontal:16,marginTop:14},livePill:{alignSelf:"flex-start",marginLeft:16,marginTop:14,flexDirection:"row",alignItems:"center",gap:6,borderWidth:1,borderColor:"rgba(255,255,255,.18)",borderRadius:20,paddingHorizontal:12,paddingVertical:7},liveDot:{color:"#fe2c55",fontSize:10},liveText:{color:"#fff",fontSize:13,fontWeight:"900"},
 tabs:{marginTop:18,height:48,flexDirection:"row",justifyContent:"center",borderBottomWidth:1,borderBottomColor:"rgba(255,255,255,.08)"},tab:{width:70,alignItems:"center",justifyContent:"center",borderBottomWidth:2,borderBottomColor:"transparent"},tabActive:{borderBottomColor:"#fff"},tabIcon:{color:"rgba(255,255,255,.55)",fontSize:23},grid:{flexDirection:"row",flexWrap:"wrap",gap:2,padding:2},gridItem:{width:"32.95%",aspectRatio:.75,backgroundColor:"#111",position:"relative"},gridImage:{width:"100%",height:"100%"},gridFallback:{flex:1,alignItems:"center",justifyContent:"center"},gridFallbackText:{color:"#555",fontSize:24},gridTap:{position:"absolute",top:0,bottom:0,left:0,right:0},views:{position:"absolute",left:7,bottom:6,color:"#fff",fontSize:11,fontWeight:"800",textShadowColor:"#000",textShadowRadius:5},draftOverlay:{position:"absolute",left:0,right:0,bottom:0,padding:6,backgroundColor:"rgba(0,0,0,.72)"},draftStatus:{color:"#fff",fontSize:10,fontWeight:"800"},publishDraftButton:{marginTop:5;backgroundColor:"#fe2c55",borderRadius:6,paddingVertical:5,alignItems:"center"},publishDraftText:{color:"#fff",fontSize:10,fontWeight:"900"},
 center:{flex:1,backgroundColor:"#000",alignItems:"center",justifyContent:"center",padding:24},error:{color:"#ff7d96",textAlign:"center",marginBottom:15},link:{color:"#fff",fontWeight:"800"}
});