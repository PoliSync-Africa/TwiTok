import { useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
type Asset = { uri: string; mimeType?: string | null; duration?: number | null; fileSize?: number | null; fileName?: string | null };

export default function CreateScreen() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [mode, setMode] = useState<"VIDEO"|"PHOTO"|"TEXT">("VIDEO");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [speed, setSpeed] = useState(1);
  const [effect, setEffect] = useState("NONE");
  const [visibility, setVisibility] = useState("PUBLIC");
  const [comments, setComments] = useState(true);
  const [duet, setDuet] = useState(true);
  const [stitch, setStitch] = useState(true);
  const [coverTimeMs, setCoverTimeMs] = useState(0);
  const [originalVolume, setOriginalVolume] = useState(1);
  const [addedSoundVolume, setAddedSoundVolume] = useState(1);
  const [soundId, setSoundId] = useState("");
  const [overlayText, setOverlayText] = useState("");

  async function pickPhotos() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 35, quality: 1 });
    if (!result.canceled) setAssets(result.assets.map(a => ({ uri: a.uri, mimeType: a.mimeType, fileSize: a.fileSize, fileName: a.fileName })));
  }

  async function recordPhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert("Camera permission", "Allow TwiTok to use your camera.");
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 });
    if (!result.canceled) setAssets(result.assets.map(a => ({ uri: a.uri, mimeType: a.mimeType, fileSize: a.fileSize, fileName: a.fileName })));
  }

  async function pickGallery() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 1,
      videoMaxDuration: 600
    });
    if (!result.canceled) setAssets(result.assets.map(a => ({ uri: a.uri, mimeType: a.mimeType, duration: a.duration, fileSize: a.fileSize, fileName: a.fileName })));
  }

  async function recordVideo() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert("Camera permission", "Allow TwiTok to use your camera to record a video.");
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["videos"], videoMaxDuration: 600, quality: 1 });
    if (!result.canceled) setAssets(a => [...a, ...result.assets.map(x => ({ uri: x.uri, mimeType: x.mimeType, duration: x.duration, fileSize: x.fileSize, fileName: x.fileName }))]);
  }

  async function publish() {
    if ((mode !== "TEXT" && !assets.length) || (mode === "TEXT" && !caption.trim()) || busy) return;
    setBusy(true); setStatus("Preparing upload…");
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Sign in before posting.");
      if (mode === "TEXT") {
        const response = await fetch(API + "/videos/posts/text", { method:"POST", headers:{"Content-Type":"application/json",Authorization:"Bearer "+token}, body:JSON.stringify({text:caption,visibility,allowComments:comments}) });
        const data = await response.json().catch(()=>({})); if (!response.ok) throw new Error(data.error || "Unable to publish text post.");
        Alert.alert("Posted","Your TwiTok text post is live.",[{text:"View feed",onPress:()=>router.replace("/feed")}]); return;
      }
      if (mode === "PHOTO") {
        const uploadIds: string[] = [];
        for (let index=0; index<assets.length; index++) {
          const blob = await (await fetch(assets[index].uri)).blob();
          const mimeType = assets[index].mimeType || blob.type || "image/jpeg";
          const sessionResponse = await fetch(API+"/videos/photos/uploads",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({mimeType,sizeBytes:blob.size})});
          const session=await sessionResponse.json().catch(()=>({}));
          if(!sessionResponse.ok || !session.uploadId || !session.uploadUrl) throw new Error(session.error||"Unable to create photo upload.");
          const upload=await fetch(session.uploadUrl,{method:"PUT",headers:{"Content-Type":mimeType},body:blob}); if(!upload.ok) throw new Error("Photo upload failed.");
          const complete=await fetch(API+"/videos/photos/uploads/"+session.uploadId+"/complete",{method:"POST",headers:{Authorization:"Bearer "+token}}); if(!complete.ok) throw new Error("Unable to complete photo upload.");
          uploadIds.push(session.uploadId); setStatus("Uploading photo "+(index+1)+" of "+assets.length+"…");
        }
        const post=await fetch(API+"/videos/posts/photos",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({uploadIds,caption,visibility,allowComments:comments})});
        const data=await post.json().catch(()=>({})); if(!post.ok) throw new Error(data.error||"Unable to publish photo post.");
        Alert.alert("Posted","Your TwiTok photo post is live.",[{text:"View feed",onPress:()=>router.replace("/feed")}]); return;
      }
      const uploads: string[] = [];
      for (let index = 0; index < assets.length; index++) {
        const asset = assets[index];
        const blob = await (await fetch(asset.uri)).blob();
        const mimeType = asset.mimeType || blob.type || "video/mp4";
        if (!mimeType.startsWith("video/")) throw new Error("Only video clips are supported in this post.");
        setStatus(`Uploading clip ${index + 1} of ${assets.length}…`);
        const sessionResponse = await fetch(API + "/videos/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ mimeType, sizeBytes: blob.size, durationMs: asset.duration ?? undefined })
        });
        const session = await sessionResponse.json().catch(() => ({}));
        if (!sessionResponse.ok || !session.uploadId) throw new Error(session.error || "Unable to create upload session.");
        if (!session.uploadUrl) throw new Error("Media storage is not configured.");
        const uploadResponse = await fetch(session.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: blob });
        if (!uploadResponse.ok) throw new Error("Clip upload failed.");
        const completeResponse = await fetch(API + "/videos/uploads/" + session.uploadId + "/complete", { method: "POST", headers: { Authorization: "Bearer " + token } });
        if (!completeResponse.ok) {
          const d = await completeResponse.json().catch(() => ({}));
          throw new Error(d.error || "Unable to complete upload.");
        }
        uploads.push(session.uploadId);
      }

      setStatus("Creating your post…");
      const draftResponse = await fetch(API + "/videos/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          uploadId: uploads[0],
          clipUploadIds: uploads,
          caption,
          visibility: "PUBLIC",
          allowComments: true,
          allowDuet: true,
          allowStitch: true,
          autoCaptions: true
        })
      });
      const draft = await draftResponse.json().catch(() => ({}));
      if (!draftResponse.ok || !draft.videoId) throw new Error(draft.error || "Unable to create post.");
      setStatus("Processing video…");
      for (let attempt = 0; attempt < 60; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const check = await fetch(API + "/videos/" + draft.videoId, { headers: { Authorization: "Bearer " + token } });
        const video = await check.json().catch(() => ({}));
        if (video.status === "READY") break;
        if (video.status === "FAILED") throw new Error("Video processing failed.");
        if (attempt === 59) throw new Error("Video is still processing. Open your profile later to publish it.");
      }
      setStatus("Publishing…");
      const publishResponse = await fetch(API + "/videos/" + draft.videoId + "/publish", { method: "POST", headers: { Authorization: "Bearer " + token } });
      const published = await publishResponse.json().catch(() => ({}));
      if (!publishResponse.ok) throw new Error(published.error || "Unable to publish post.");
      Alert.alert("Posted", "Your TwiTok video is now live.", [{ text: "View feed", onPress: () => router.replace("/feed") }]);
    } catch (e) {
      Alert.alert("Post failed", e instanceof Error ? e.message : "Unable to publish.");
    } finally { setBusy(false); setStatus(""); }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.close}>×</Text></Pressable>
        <Text style={styles.title}>Create</Text>
        <Pressable onPress={publish} disabled={(mode==="TEXT" ? !caption.trim() : !assets.length) || busy}><Text style={[styles.post, ((mode==="TEXT" ? !caption.trim() : !assets.length) || busy) && styles.disabled]}>Post</Text></Pressable>
      </View>
      <View style={styles.modeRow}>{["VIDEO","PHOTO","TEXT"].map(v=><Pressable key={v} style={[styles.mode,mode===v&&styles.modeSelected]} onPress={()=>{setMode(v as any);setAssets([])}}><Text style={styles.modeText}>{v==="VIDEO"?"Video":v==="PHOTO"?"Photo":"Text"}</Text></Pressable>)}</View>
      {mode !== "TEXT" ? <View style={styles.modeRow}>
        <Pressable style={styles.mode} onPress={mode==="PHOTO"?recordPhoto:recordVideo}><Text style={styles.modeIcon}>●</Text><Text style={styles.modeText}>Camera</Text></Pressable>
        <Pressable style={styles.mode} onPress={mode==="PHOTO"?pickPhotos:pickGallery}><Text style={styles.modeIcon}>▣</Text><Text style={styles.modeText}>Gallery</Text></Pressable>
      </View> : null}
      <ScrollView contentContainerStyle={styles.content}>
        <TextInput value={caption} onChangeText={setCaption} placeholder="Describe your post…" placeholderTextColor="#777" style={styles.caption} multiline maxLength={2200} />
        {assets.length ? <FlatList data={assets} horizontal keyExtractor={(a,i)=>a.uri+i} contentContainerStyle={styles.assets} renderItem={({item,index})=><View style={styles.clip}><Text style={styles.clipIcon}>▶</Text><Text style={styles.clipText}>Clip {index+1}</Text><Pressable onPress={()=>setAssets(a=>a.filter((_,i)=>i!==index))}><Text style={styles.remove}>×</Text></Pressable></View>} /> : <View style={styles.empty}><Text style={styles.emptyIcon}>＋</Text><Text style={styles.emptyText}>Add videos from your gallery or record with camera</Text></View>}
        <Text style={styles.section}>Edit</Text>
        <View style={styles.row}>{["0.5","1","1.5","2"].map(v=><Pressable key={v} style={[styles.choice,speed===Number(v)&&styles.selected]} onPress={()=>setSpeed(Number(v))}><Text style={styles.choiceText}>{v}×</Text></Pressable>)}</View>
        <View style={styles.row}>{["NONE","VIBRANT","WARM","COOL","NOIR","VINTAGE"].map(v=><Pressable key={v} style={[styles.choice,effect===v&&styles.selected]} onPress={()=>setEffect(v)}><Text style={styles.choiceText}>{v}</Text></Pressable>)}</View>
        <TextInput value={overlayText} onChangeText={setOverlayText} placeholder="Add text overlay (optional)" placeholderTextColor="#777" style={styles.input} maxLength={150} />
        <Text style={styles.section}>Sound</Text>
        <TextInput value={soundId} onChangeText={setSoundId} placeholder="Sound ID (optional)" placeholderTextColor="#777" style={styles.input} />
        <View style={styles.row}><Text style={styles.label}>Original {Math.round(originalVolume*100)}%</Text><Pressable style={styles.small} onPress={()=>setOriginalVolume(v=>v>=1?0:Math.min(1,v+0.25))}><Text style={styles.choiceText}>Adjust</Text></Pressable><Text style={styles.label}>Added {Math.round(addedSoundVolume*100)}%</Text><Pressable style={styles.small} onPress={()=>setAddedSoundVolume(v=>v>=1?0:Math.min(1,v+0.25))}><Text style={styles.choiceText}>Adjust</Text></Pressable></View>
        <Text style={styles.section}>Cover</Text>
        <TextInput value={String(coverTimeMs)} onChangeText={v=>setCoverTimeMs(Math.max(0,Number(v)||0))} keyboardType="numeric" placeholder="Cover time in milliseconds" placeholderTextColor="#777" style={styles.input} />
        <Text style={styles.section}>Post settings</Text>
        <View style={styles.row}>{["PUBLIC","FOLLOWERS","PRIVATE"].map(v=><Pressable key={v} style={[styles.choice,visibility===v&&styles.selected]} onPress={()=>setVisibility(v)}><Text style={styles.choiceText}>{v}</Text></Pressable>)}</View>
        <View style={styles.row}>{[[comments,"Comments"],[duet,"Duet"],[stitch,"Stitch"]].map(([on,label])=><Pressable key={String(label)} style={[styles.choice,on&&styles.selected]} onPress={()=>{ if(label==="Comments") setComments(!comments); else if(label==="Duet") setDuet(!duet); else setStitch(!stitch); }}><Text style={styles.choiceText}>{label}: {on?"On":"Off"}</Text></Pressable>)}</View>
        {busy ? <View style={styles.progress}><ActivityIndicator color="#fff" /><Text style={styles.status}>{status}</Text></View> : null}
      </ScrollView>
    </View>
  );
}
const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:"#000",paddingTop:48},content:{paddingBottom:80},section:{color:"#fff",fontSize:17,fontWeight:"900",paddingHorizontal:16,paddingTop:12,paddingBottom:8},row:{flexDirection:"row",flexWrap:"wrap",gap:8,paddingHorizontal:16,paddingVertical:6},choice:{borderWidth:1,borderColor:"#333",borderRadius:10,paddingHorizontal:12,paddingVertical:9,backgroundColor:"#111"},selected:{borderColor:"#ff2d55",backgroundColor:"#241017"},choiceText:{color:"#fff",fontWeight:"700"},label:{color:"#aaa",paddingVertical:9},small:{borderWidth:1,borderColor:"#333",borderRadius:10,paddingHorizontal:10,paddingVertical:8},input:{marginHorizontal:16,marginVertical:6,borderRadius:12,backgroundColor:"#151515",color:"#fff",padding:12,fontSize:15},header:{height:54,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:"#222"},close:{color:"#fff",fontSize:34,fontWeight:"300"},title:{color:"#fff",fontSize:18,fontWeight:"800"},post:{color:"#ff2d55",fontSize:16,fontWeight:"900"},disabled:{color:"#555"},modeRow:{flexDirection:"row",justifyContent:"center",gap:30,paddingVertical:22},mode:{alignItems:"center",gap:6},modeIcon:{color:"#fff",fontSize:28},modeText:{color:"#fff",fontWeight:"700"},caption:{margin:16,minHeight:100,borderRadius:14,backgroundColor:"#151515",color:"#fff",padding:14,fontSize:16,textAlignVertical:"top"},assets:{paddingHorizontal:16,gap:10},clip:{width:110,height:145,borderRadius:12,backgroundColor:"#181818",alignItems:"center",justifyContent:"center",position:"relative"},clipIcon:{color:"#fff",fontSize:30},clipText:{color:"#aaa",marginTop:8},remove:{position:"absolute",right:6,top:3,color:"#fff",fontSize:25},empty:{alignItems:"center",justifyContent:"center",padding:40},emptyIcon:{color:"#777",fontSize:60},emptyText:{color:"#888",textAlign:"center",fontSize:15},modeSelected:{borderBottomWidth:2,borderBottomColor:"#ff2d55"},progress:{alignItems:"center",gap:10,padding:20},status:{color:"#aaa"}
});
