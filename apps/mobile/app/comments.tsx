import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

type Comment = { id:string; userId:string; text:string; createdAt:string };

export default function CommentsScreen() {
  const { videoId } = useLocalSearchParams<{ videoId:string }>();
  const [comments,setComments]=useState<Comment[]>([]);
  const [text,setText]=useState("");
  const [loading,setLoading]=useState(true);
  const [posting,setPosting]=useState(false);
  const [error,setError]=useState("");

  async function load() {
    if (!videoId) return;
    try {
      const token=await getAuthToken();
      const r=await fetch(API+"/engagement/"+videoId+"/comments",{headers:{Authorization:"Bearer "+(token??"")}});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error??"Unable to load comments");
      setComments(d.comments??[]);
    } catch(e) { setError(e instanceof Error?e.message:"Unable to load comments"); }
    finally { setLoading(false); }
  }

  useEffect(()=>{load();},[videoId]);

  async function post() {
    const body=text.trim();
    if(!body || posting || !videoId) return;
    setPosting(true); setError("");
    try {
      const token=await getAuthToken();
      const r=await fetch(API+"/engagement/"+videoId+"/comments",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+(token??"")},
        body:JSON.stringify({text:body})
      });
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error??"Unable to post comment");
      if(d.comment) setComments(current=>[d.comment,...current]);
      setText("");
    } catch(e) { setError(e instanceof Error?e.message:"Unable to post comment"); }
    finally { setPosting(false); }
  }

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS==="ios"?"padding":undefined}>
    <View style={styles.header}>
      <Pressable onPress={()=>router.back()}><Text style={styles.back}>‹</Text></Pressable>
      <Text style={styles.title}>Comments</Text>
      <View style={{width:32}}/>
    </View>
    {loading ? <View style={styles.center}><ActivityIndicator color="#fff"/></View> :
      <ScrollView style={styles.list} contentContainerStyle={styles.content}>
        {error?<Text style={styles.error}>{error}</Text>:null}
        {!comments.length && !error ? <Text style={styles.empty}>No comments yet. Be the first to comment.</Text>:null}
        {comments.map(c=><View key={c.id} style={styles.comment}>
          <View style={styles.avatar}><Text style={styles.avatarText}>@</Text></View>
          <View style={styles.commentBody}><Text style={styles.user}>@{c.userId.slice(-8)}</Text><Text style={styles.commentText}>{c.text}</Text></View>
        </View>)}
      </ScrollView>}
    <View style={styles.composer}>
      <TextInput value={text} onChangeText={setText} placeholder="Add a comment…" placeholderTextColor="#777" maxLength={500} multiline style={styles.input}/>
      <Pressable onPress={post} disabled={!text.trim()||posting} style={[styles.postButton,(!text.trim()||posting)&&styles.disabled]}>
        {posting?<ActivityIndicator color="#fff" size="small"/>:<Text style={styles.postText}>Post</Text>}
      </Pressable>
    </View>
  </KeyboardAvoidingView>;
}

const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:"#000"},
 header:{height:58,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:"#222"},
 back:{color:"#fff",fontSize:40,fontWeight:"300",lineHeight:40},
 title:{color:"#fff",fontSize:18,fontWeight:"800"},
 list:{flex:1},
 content:{padding:16,paddingBottom:24},
 center:{flex:1,alignItems:"center",justifyContent:"center"},
 comment:{flexDirection:"row",gap:10,marginBottom:20},
 avatar:{width:38,height:38,borderRadius:19,backgroundColor:"#222",alignItems:"center",justifyContent:"center"},
 avatarText:{color:"#aaa",fontWeight:"800"},
 commentBody:{flex:1},
 user:{color:"#aaa",fontSize:12,fontWeight:"700",marginBottom:3},
 commentText:{color:"#fff",fontSize:15,lineHeight:21},
 empty:{color:"#888",textAlign:"center",marginTop:60,lineHeight:22},
 error:{color:"#ff7188",marginBottom:14,textAlign:"center"},
 composer:{flexDirection:"row",alignItems:"flex-end",gap:8,padding:10,borderTopWidth:1,borderTopColor:"#222",backgroundColor:"#0a0a0a"},
 input:{flex:1,maxHeight:100,minHeight:44,borderRadius:22,backgroundColor:"#1b1b1b",color:"#fff",paddingHorizontal:16,paddingVertical:10,fontSize:15},
 postButton:{height:44,minWidth:58,borderRadius:22,backgroundColor:"#ff2d55",alignItems:"center",justifyContent:"center"},
 disabled:{opacity:.45},
 postText:{color:"#fff",fontWeight:"800"}
});