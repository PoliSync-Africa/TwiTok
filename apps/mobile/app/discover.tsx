import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { getAuthToken } from "../lib/auth";
import { Colors, Typography } from "../theme/typography";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

type UserResult = { id: string; username: string; nickname?: string; avatarUrl?: string | null };
type VideoResult = { id: string; caption?: string; hashtags?: string[]; thumbnail?: string | null; playback?: { mp4Url?: string; hlsUrl?: string } | null };

const categories = [
  ["🔥","Trending in Africa"],["♫","African Music"],["🌍","Culture & Heritage"],
  ["😂","Comedy"],["🎓","Education"],["📰","News"],["🍲","Food & Lifestyle"],["✈️","Travel & Tourism"]
] as const;

export default function DiscoverScreen() {
  const [query,setQuery]=useState("");
  const [users,setUsers]=useState<UserResult[]>([]);
  const [videos,setVideos]=useState<VideoResult[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{
    const q=query.trim();
    if(!q){setUsers([]);setVideos([]);setError("");return;}
    const timer=setTimeout(async()=>{
      const token=await getAuthToken();
      if(!token){setError("Sign in required");return;}
      setBusy(true);setError("");
      try{
        const r=await fetch(API+"/search?q="+encodeURIComponent(q)+"&limit=20",{headers:{Authorization:"Bearer "+token}});
        const d=await r.json().catch(()=>({}));
        if(!r.ok) throw new Error(d.error??"Search failed");
        setUsers(Array.isArray(d.users)?d.users:[]);
        setVideos(Array.isArray(d.videos)?d.videos:[]);
      }catch(e){setError(e instanceof Error?e.message:"Search failed");}
      finally{setBusy(false);}
    },300);
    return()=>clearTimeout(timer);
  },[query]);

  return <View style={styles.root}>
    <View style={styles.header}>
      <Pressable onPress={()=>router.back()}><Text style={styles.back}>‹</Text></Pressable>
      <Text style={styles.title}>Discover</Text>
      <View style={{width:30}}/>
    </View>
    <View style={styles.search}><Text style={styles.searchIcon}>⌕</Text><TextInput value={query} onChangeText={setQuery} placeholder="Search videos, creators, sounds, hashtags..." placeholderTextColor={Colors.textMuted} autoCapitalize="none" style={styles.searchInput}/></View>
    {!query.trim() ? <FlatList
      data={categories}
      keyExtractor={item=>item[1]}
      numColumns={2}
      contentContainerStyle={styles.content}
      columnWrapperStyle={styles.columns}
      ListHeaderComponent={<><Text style={styles.heading}>Explore Africa</Text><Text style={styles.subheading}>Discover creators, culture, music and stories from across Africa.</Text></>}
      renderItem={({item})=><Pressable style={styles.category} onPress={()=>setQuery(item[1])}><Text style={styles.categoryIcon}>{item[0]}</Text><Text style={styles.categoryText}>{item[1]}</Text></Pressable>}
    /> : <FlatList
      data={videos}
      keyExtractor={item=>item.id}
      numColumns={2}
      contentContainerStyle={styles.content}
      columnWrapperStyle={styles.columns}
      ListHeaderComponent={<><Text style={styles.heading}>Search results</Text>{busy?<ActivityIndicator color={Colors.text}/>:null}{error?<Text style={styles.error}>{error}</Text>:null}{users.length>0?<Text style={styles.section}>Creators</Text>:null}{users.map(u=><Pressable key={u.id} style={styles.creator} onPress={()=>router.push({pathname:"/profile",params:{username:u.username}})}><View style={styles.avatar}>{u.avatarUrl?<Image source={{uri:u.avatarUrl}} style={styles.avatarImage}/>:<Text style={styles.avatarText}>{(u.username||"U")[0].toUpperCase()}</Text>}</View><View><Text style={styles.creatorName}>@{u.username}</Text><Text style={styles.creatorSub}>{u.nickname||"TwiTok creator"}</Text></View></Pressable>)}</>}
      renderItem={({item})=><Pressable style={styles.video} onPress={()=>router.push({pathname:"/feed",params:{videoId:item.id}})}>{item.thumbnail?<Image source={{uri:item.thumbnail}} style={styles.thumbnail}/>:<View style={styles.placeholder}><Text style={styles.placeholderText}>TwiTok</Text></View>}<Text style={styles.caption} numberOfLines={2}>{item.caption||"TwiTok video"}</Text>{item.hashtags?.length?<Text style={styles.tags} numberOfLines={1}>{item.hashtags.map(t=>"#"+t).join(" ")}</Text>:null}</Pressable>}
      ListEmptyComponent={!busy?<Text style={styles.empty}>No results found.</Text>:null}
    />}
  </View>;
}

const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:Colors.background},
 header:{height:58,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:18,borderBottomWidth:1,borderBottomColor:Colors.border},
 back:{color:Colors.text,fontSize:34,lineHeight:36},
 title:{color:Colors.text,...Typography.section},
 search:{margin:14,backgroundColor:Colors.surface,borderRadius:12,borderWidth:1,borderColor:Colors.border,flexDirection:"row",alignItems:"center",paddingHorizontal:12},
 searchIcon:{color:Colors.textSecondary,fontSize:22},
 searchInput:{flex:1,color:Colors.text,...Typography.body,paddingVertical:13,paddingHorizontal:8},
 content:{padding:14,paddingBottom:30},
 columns:{gap:12},
 heading:{color:Colors.text,...Typography.title,marginBottom:6},
 subheading:{color:Colors.textSecondary,...Typography.body,marginBottom:18},
 category:{flex:1,minHeight:104,borderRadius:14,backgroundColor:Colors.surface,borderWidth:1,borderColor:Colors.border,padding:16,marginBottom:12,justifyContent:"center"},
 categoryIcon:{fontSize:28,marginBottom:8},
 categoryText:{color:Colors.text,...Typography.bodySemibold},
 section:{color:Colors.text,...Typography.section,marginTop:12,marginBottom:10},
 creator:{flexDirection:"row",alignItems:"center",paddingVertical:10,borderBottomWidth:1,borderBottomColor:Colors.border},
 avatar:{width:44,height:44,borderRadius:22,backgroundColor:Colors.surfaceRaised,alignItems:"center",justifyContent:"center",overflow:"hidden",marginRight:12},
 avatarImage:{width:44,height:44},avatarText:{color:Colors.text,...Typography.bodySemibold},
 creatorName:{color:Colors.text,...Typography.bodySemibold},creatorSub:{color:Colors.textSecondary,...Typography.caption},
 video:{flex:1,minWidth:0,backgroundColor:Colors.surface,borderRadius:10,overflow:"hidden",marginBottom:12},
 thumbnail:{width:"100%",aspectRatio:0.72},placeholder:{aspectRatio:0.72,alignItems:"center",justifyContent:"center",backgroundColor:Colors.surfaceRaised},placeholderText:{color:Colors.text,...Typography.section},
 caption:{color:Colors.text,...Typography.captionMedium,padding:9,paddingBottom:3},tags:{color:Colors.textSecondary,...Typography.caption,paddingHorizontal:9,paddingBottom:9},
 empty:{color:Colors.textSecondary,...Typography.body,textAlign:"center",padding:30},
 error:{color:Colors.danger,...Typography.caption,marginVertical:8}
});
