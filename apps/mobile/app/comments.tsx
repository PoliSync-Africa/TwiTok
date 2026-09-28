import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { VideoView, useVideoPlayer } from "expo-video";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

type Attachment = { objectKey:string; mimeType:string; url?:string };
type Comment = { id:string; userId:string; text:string; createdAt:string; parentId?:string|null; likeCount?:number; liked?:boolean; replyCount?:number; attachments?:Attachment[] };

function AudioAttachment({ url }: { url:string }) {
  const player = useAudioPlayer(url);
  return <Pressable style={styles.audio} onPress={() => player.play()}><Text style={styles.audioIcon}>▶</Text><Text style={styles.audioText}>Voice comment</Text></Pressable>;
}
function VideoAttachment({ url }: { url:string }) {
  const player = useVideoPlayer(url, p => { p.loop = false; });
  return <VideoView player={player} style={styles.mediaVideo} nativeControls contentFit="cover" />;
}

export default function CommentsScreen() {
  const { videoId } = useLocalSearchParams<{ videoId:string }>();
  const [comments,setComments]=useState<Comment[]>([]);
  const [text,setText]=useState("");
  const [pending,setPending]=useState<Attachment[]>([]);
  const [loading,setLoading]=useState(true);
  const [posting,setPosting]=useState(false);
  const [replyTo,setReplyTo]=useState<Comment|null>(null);
  const [error,setError]=useState("");
  const recorder=useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState=useAudioRecorderState(recorder);

  useEffect(()=>{(async()=>{await AudioModule.requestRecordingPermissionsAsync(); await setAudioModeAsync({playsInSilentMode:true,allowsRecording:true});})();},[]);

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

  async function upload(uri:string,mimeType:string) {
    if(!videoId) return;
    const token=await getAuthToken();
    if(!token) throw new Error("Sign in required");
    const sign=await fetch(API+"/engagement/"+videoId+"/comments/upload-url",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({mimeType})});
    const sd=await sign.json().catch(()=>({}));
    if(!sign.ok) throw new Error(sd.error??"Unable to prepare upload");
    const blob=await (await fetch(uri)).blob();
    const put=await fetch(sd.url,{method:"PUT",headers:{"Content-Type":mimeType},body:blob});
    if(!put.ok) throw new Error("Media upload failed");
    return {objectKey:sd.objectKey,mimeType,url:sd.url};
  }

  async function pickMedia(camera=false) {
    try {
      const result=camera
        ? await ImagePicker.launchCameraAsync({mediaTypes:["images","videos"],quality:0.85})
        : await ImagePicker.launchImageLibraryAsync({mediaTypes:["images","videos"],allowsMultipleSelection:true,selectionLimit:4,quality:0.85});
      if(result.canceled) return;
      const slots=Math.max(0,4-pending.length);
      const assets=result.assets.slice(0,slots);
      const uploaded:Attachment[]=[];
      for(const asset of assets) {
        uploaded.push(await upload(asset.uri,asset.mimeType ?? (asset.type==="video"?"video/mp4":"image/jpeg")) as Attachment);
      }
      setPending(v=>[...v,...uploaded]);
    } catch(e) { Alert.alert("Media",e instanceof Error?e.message:"Unable to add media"); }
  }

  async function toggleRecord() {
    try {
      if(recorderState.isRecording) {
        await recorder.stop();
        if(recorder.uri) {
          const attachment=await upload(recorder.uri,"audio/mp4");
          if(attachment) setPending(v=>[...v,attachment]);
        }
      } else {
        if(pending.length>=4) return;
        await recorder.prepareToRecordAsync();
        recorder.record();
      }
    } catch(e) { Alert.alert("Voice comment",e instanceof Error?e.message:"Unable to record audio"); }
  }

  async function likeComment(commentId:string) { try { const token=await getAuthToken(); const r=await fetch(API+"/engagement/comments/"+commentId+"/like",{method:"POST",headers:{Authorization:"Bearer "+(token??"")}}); const d=await r.json(); if(r.ok) setComments(v=>v.map(c=>c.id===commentId?{...c,liked:d.liked,likeCount:Math.max(0,(c.likeCount??0)+(d.liked?1:-1))}:c)); } catch {} }

  async function post() {
    const body=text.trim();
    if((!body && !pending.length) || posting || !videoId) return;
    setPosting(true); setError("");
    try {
      const token=await getAuthToken();
      const r=await fetch(API+"/engagement/"+videoId+"/comments",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+(token??"")},body:JSON.stringify({text:body,parentId:replyTo?.id,attachments:pending.map(({objectKey,mimeType})=>({objectKey,mimeType}))})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error??"Unable to post comment");
      if(d.comment) setComments(current=>[d.comment,...current]);
      setText(""); setPending([]); setReplyTo(null);
    } catch(e) { setError(e instanceof Error?e.message:"Unable to post comment"); }
    finally { setPosting(false); }
  }

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS==="ios"?"padding":undefined}>
    <View style={styles.header}><Pressable onPress={()=>router.back()}><Text style={styles.back}>‹</Text></Pressable><Text style={styles.title}>Comments</Text><View style={{width:32}}/></View>
    {loading ? <View style={styles.center}><ActivityIndicator color="#fff"/></View> :
      <ScrollView style={styles.list} contentContainerStyle={styles.content}>
        {error?<Text style={styles.error}>{error}</Text>:null}
        {!comments.length&&!error?<Text style={styles.empty}>No comments yet. Be the first to comment.</Text>:null}
        {comments.map(c=><View key={c.id} style={styles.comment}>
          <View style={styles.avatar}><Text style={styles.avatarText}>@</Text></View>
          <View style={styles.commentBody}><Text style={styles.user}>@{c.userId.slice(-8)}</Text><Text style={styles.commentText}>{c.text}</Text>
            {<View style={styles.commentActions}><Pressable onPress={()=>likeComment(c.id)}><Text style={styles.actionText}>{c.liked?"♥":"♡"} {c.likeCount??0}</Text></Pressable><Pressable onPress={()=>setReplyTo(c)}><Text style={styles.actionText}>Reply {c.replyCount?`(${c.replyCount})`:""}</Text></Pressable></View>}
            {(c.attachments??[]).map((a,i)=>a.mimeType.startsWith("image/")&&a.url?<Image key={i} source={{uri:a.url}} style={styles.mediaImage}/>:a.mimeType.startsWith("video/")&&a.url?<VideoAttachment key={i} url={a.url}/>:a.mimeType.startsWith("audio/")&&a.url?<AudioAttachment key={i} url={a.url}/>:null)}
          </View>
        </View>)}
      </ScrollView>}
    {replyTo&&<View style={styles.replyBar}><Text style={styles.replyText}>Replying to @{replyTo.userId.slice(-8)}</Text><Pressable onPress={()=>setReplyTo(null)}><Text style={styles.remove}>×</Text></Pressable></View>}
    {!!pending.length&&<ScrollView horizontal style={styles.pending} contentContainerStyle={styles.pendingContent}>{pending.map((a,i)=><View key={i} style={styles.pendingChip}><Text style={styles.pendingText}>{a.mimeType.split("/")[0]} ✓</Text><Pressable onPress={()=>setPending(v=>v.filter((_,n)=>n!==i))}><Text style={styles.remove}>×</Text></Pressable></View>)}</ScrollView>}
    <View style={styles.composer}>
      <Pressable style={styles.tool} onPress={()=>pickMedia(false)}><Text style={styles.toolText}>＋</Text></Pressable>
      <Pressable style={styles.tool} onPress={()=>pickMedia(true)}><Text style={styles.toolText}>📷</Text></Pressable>
      <Pressable style={[styles.tool,recorderState.isRecording&&styles.recording]} onPress={toggleRecord}><Text style={styles.toolText}>{recorderState.isRecording?"■":"🎙"}</Text></Pressable>
      <TextInput value={text} onChangeText={setText} placeholder="Add a comment…" placeholderTextColor="#777" maxLength={500} multiline style={styles.input}/>
      <Pressable onPress={post} disabled={(!text.trim()&&!pending.length)||posting} style={[styles.postButton,(!text.trim()&&!pending.length||posting)&&styles.disabled]}>{posting?<ActivityIndicator color="#fff" size="small"/>:<Text style={styles.postText}>Post</Text>}</Pressable>
    </View>
  </KeyboardAvoidingView>;
}

const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:"#000"}, header:{height:58,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:"#222"},
 back:{color:"#fff",fontSize:40,fontWeight:"300",lineHeight:40}, title:{color:"#fff",fontSize:18,fontWeight:"800"}, list:{flex:1}, content:{padding:16,paddingBottom:24},
 center:{flex:1,alignItems:"center",justifyContent:"center"}, comment:{flexDirection:"row",gap:10,marginBottom:20}, avatar:{width:38,height:38,borderRadius:19,backgroundColor:"#222",alignItems:"center",justifyContent:"center"}, avatarText:{color:"#aaa",fontWeight:"800"},
 commentBody:{flex:1}, commentActions:{flexDirection:"row",gap:18,marginTop:8}, actionText:{color:"#999",fontSize:12,fontWeight:"700"}, replyBar:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:14,paddingVertical:8,backgroundColor:"#171717"}, replyText:{color:"#bbb",fontSize:12}, user:{color:"#aaa",fontSize:12,fontWeight:"700",marginBottom:3}, commentText:{color:"#fff",fontSize:15,lineHeight:21}, empty:{color:"#888",textAlign:"center",marginTop:60,lineHeight:22}, error:{color:"#ff7188",marginBottom:14,textAlign:"center"},
 mediaImage:{width:220,height:220,borderRadius:12,marginTop:8}, mediaVideo:{width:240,height:150,borderRadius:12,marginTop:8}, audio:{flexDirection:"row",alignItems:"center",gap:10,backgroundColor:"#202020",padding:12,borderRadius:20,marginTop:8}, audioIcon:{color:"#fff",fontSize:15}, audioText:{color:"#fff",fontWeight:"700"},
 pending:{maxHeight:42,borderTopWidth:1,borderTopColor:"#222"}, pendingContent:{paddingHorizontal:10,paddingVertical:6,gap:6}, pendingChip:{flexDirection:"row",alignItems:"center",backgroundColor:"#202020",borderRadius:16,paddingHorizontal:10}, pendingText:{color:"#ddd",fontSize:12}, remove:{color:"#ff6b81",fontSize:18,marginLeft:5},
 composer:{flexDirection:"row",alignItems:"flex-end",gap:5,padding:8,borderTopWidth:1,borderTopColor:"#222",backgroundColor:"#0a0a0a"}, tool:{width:32,height:44,alignItems:"center",justifyContent:"center"}, toolText:{color:"#fff",fontSize:20}, recording:{backgroundColor:"#ff2d55",borderRadius:16}, input:{flex:1,maxHeight:100,minHeight:44,borderRadius:22,backgroundColor:"#1b1b1b",color:"#fff",paddingHorizontal:14,paddingVertical:10,fontSize:15}, postButton:{height:44,minWidth:58,borderRadius:22,backgroundColor:"#ff2d55",alignItems:"center",justifyContent:"center"}, disabled:{opacity:.45}, postText:{color:"#fff",fontWeight:"800"}
});