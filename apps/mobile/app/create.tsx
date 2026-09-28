import { useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
type Asset = { uri: string; mimeType?: string | null; duration?: number | null; fileSize?: number | null; fileName?: string | null };
type ClipSetting = { speed: number; volume: number; muted: boolean };
const DEFAULT_CLIP_SETTING: ClipSetting = { speed: 1, volume: 1, muted: false };
const TRANSITIONS = ["NONE","FADE","DISSOLVE","WIPELEFT","WIPERIGHT","SLIDELEFT","SLIDERIGHT"];

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
  const [trimStartMs, setTrimStartMs] = useState(0);
  const [trimEndMs, setTrimEndMs] = useState(0);
  const [originalVolume, setOriginalVolume] = useState(1);
  const [addedSoundVolume, setAddedSoundVolume] = useState(1);
  const { soundId: incomingSoundId, soundTitle: incomingSoundTitle } = useLocalSearchParams<{ soundId?: string; soundTitle?: string }>();
  const [soundId, setSoundId] = useState(String(incomingSoundId ?? ""));
  const [soundTitle, setSoundTitle] = useState(String(incomingSoundTitle ?? ""));
  const [overlayText, setOverlayText] = useState("");
  const durationMs = assets.reduce((sum, asset) => sum + (asset.duration ?? 0), 0);
  const [clipSettings, setClipSettings] = useState<ClipSetting[]>([]);
  const [clipTransitions, setClipTransitions] = useState<{type:string;durationMs:number}[]>([]);

  function replaceAssets(next: Asset[]) {
    setAssets(next);
    setClipSettings(next.map((_, i) => clipSettings[i] ?? { ...DEFAULT_CLIP_SETTING }));
    setClipTransitions(next.slice(0, Math.max(0, next.length - 1)).map((_, i) => clipTransitions[i] ?? ({ type: "NONE", durationMs: 500 })));
  }
  function moveClip(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= assets.length) return;
    const nextAssets = [...assets]; [nextAssets[index], nextAssets[target]] = [nextAssets[target], nextAssets[index]];
    const nextSettings = [...clipSettings]; [nextSettings[index], nextSettings[target]] = [nextSettings[target] ?? { ...DEFAULT_CLIP_SETTING }, nextSettings[index] ?? { ...DEFAULT_CLIP_SETTING }];
    setAssets(nextAssets); setClipSettings(nextSettings);
  }
  function setTransition(index: number, type: string) {
    setClipTransitions(prev => prev.map((x, i) => i === index ? { ...x, type } : x));
  }

  function chooseSound(){ router.push({ pathname:"/sounds", params:{ select:"1" } }); }

  async function pickPhotos() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 35, quality: 1 });
    if (!result.canceled) replaceAssets(result.assets.map(a => ({ uri: a.uri, mimeType: a.mimeType, fileSize: a.fileSize, fileName: a.fileName })));
  }

  async function recordPhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert("Camera permission", "Allow TwiTok to use your camera.");
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 });
    if (!result.canceled) replaceAssets(result.assets.map(a => ({ uri: a.uri, mimeType: a.mimeType, fileSize: a.fileSize, fileName: a.fileName })));
  }

  async function pickGallery() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 1,
      videoMaxDuration: 600
    });
    if (!result.canceled) replaceAssets(result.assets.map(a => ({ uri: a.uri, mimeType: a.mimeType, duration: a.duration, fileSize: a.fileSize, fileName: a.fileName })));
  }

  async function recordVideo() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert("Camera permission", "Allow TwiTok to use your camera to record a video.");
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["videos"], videoMaxDuration: 600, quality: 1 });
    if (!result.canceled) replaceAssets([...assets, ...result.assets.map(x => ({ uri: x.uri, mimeType: x.mimeType, duration: x.duration, fileSize: x.fileSize, fileName: x.fileName }))]);
  }

  async function publish(publishNow = true) {
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
          visibility,
          allowComments: comments,
          allowDuet: duet,
          allowStitch: stitch,
          speed,
          effect,
          soundId: soundId || undefined,
          originalVolume,
          addedSoundVolume,
          coverTimeMs,
          trimStartMs,
          trimEndMs: trimEndMs || undefined,
          clipTransitions,
          clipSettings,
          autoCaptions: true,
          textOverlays: overlayText.trim() ? [{ text: overlayText.trim(), startMs: 0, endMs: Math.max(3000, durationMs || 3000), x: 0.5, y: 0.8, fontSize: 42, color: "#FFFFFF", background: "#000000@0.55", align: "center" }] : []
        })
      });
      const draft = await draftResponse.json().catch(() => ({}));
      if (!draftResponse.ok || !draft.videoId) throw new Error(draft.error || "Unable to create post.");
      if (!publishNow) {
        Alert.alert("Draft saved", "Your video has been saved as a draft. You can publish it later.", [{ text: "Done", onPress: () => router.back() }]);
        return;
      }
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
        {assets.length ? <FlatList data={assets} horizontal keyExtractor={(a,i)=>a.uri+i} contentContainerStyle={styles.assets} renderItem={({item,index})=><View style={styles.clip}>
  <Text style={styles.clipIcon}>▶</Text><Text style={styles.clipText}>Clip {index+1}</Text>
  <View style={styles.clipActions}>
    <Pressable onPress={()=>moveClip(index,-1)}><Text style={styles.action}>‹</Text></Pressable>
    <Pressable onPress={()=>moveClip(index,1)}><Text style={styles.action}>›</Text></Pressable>
    <Pressable onPress={()=>{const next=assets.filter((_,i)=>i!==index);replaceAssets(next)}}><Text style={styles.remove}>×</Text></Pressable>
  </View>
</View>} /> : <View style={styles.empty}><Text style={styles.emptyIcon}>＋</Text><Text style={styles.emptyText}>Add videos from your gallery or record with camera</Text></View>}
        <Text style={styles.section}>Edit timeline</Text>
        {mode === "VIDEO" ? <>
          <Text style={styles.helper}>Trim start / end (milliseconds)</Text>
          <View style={styles.row}>
            <TextInput value={String(trimStartMs)} onChangeText={v=>setTrimStartMs(Math.max(0,Number(v)||0))} keyboardType="numeric" placeholder="Start" placeholderTextColor="#777" style={[styles.input,styles.trimInput]} />
            <TextInput value={String(trimEndMs)} onChangeText={v=>setTrimEndMs(Math.max(0,Number(v)||0))} keyboardType="numeric" placeholder="End (0 = full)" placeholderTextColor="#777" style={[styles.input,styles.trimInput]} />
          </View>
        </> : null}
        <View style={styles.row}>{["0.5","1","1.5","2"].map(v=><Pressable key={v} style={[styles.choice,speed===Number(v)&&styles.selected]} onPress={()=>setSpeed(Number(v))}><Text style={styles.choiceText}>{v}×</Text></Pressable>)}</View>
        <View style={styles.row}>{["NONE","VIBRANT","WARM","COOL","NOIR","VINTAGE"].map(v=><Pressable key={v} style={[styles.choice,effect===v&&styles.selected]} onPress={()=>setEffect(v)}><Text style={styles.choiceText}>{v}</Text></Pressable>)}</View>
        <TextInput value={overlayText} onChangeText={setOverlayText} placeholder="Add text overlay (optional)" placeholderTextColor="#777" style={styles.input} maxLength={150} />
        {mode === "VIDEO" && assets.length > 1 ? <View>
          <Text style={styles.helper}>Transitions between clips</Text>
          {assets.slice(0, -1).map((_, i) => <View key={i} style={styles.transitionRow}>
            <Text style={styles.label}>Clip {i + 1} → {i + 2}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.transitionChoices}>
              {TRANSITIONS.map(type => <Pressable key={type} style={[styles.choice, clipTransitions[i]?.type === type && styles.selected]} onPress={()=>setTransition(i,type)}><Text style={styles.choiceText}>{type}</Text></Pressable>)}
            </ScrollView>
          </View>)}
          <Text style={styles.helper}>Per-clip controls</Text>
          {assets.map((_, i) => <View key={i} style={styles.perClip}>
            <Text style={styles.label}>Clip {i + 1}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.transitionChoices}>
              {[0.5,0.75,1,1.5,2].map(v => <Pressable key={v} style={[styles.choice, clipSettings[i]?.speed === v && styles.selected]} onPress={()=>setClipSettings(prev=>prev.map((x,j)=>j===i?{...x,speed:v}:x))}><Text style={styles.choiceText}>{v}×</Text></Pressable>)}
              <Pressable style={[styles.choice, clipSettings[i]?.muted && styles.selected]} onPress={()=>setClipSettings(prev=>prev.map((x,j)=>j===i?{...x,muted:!x.muted,volume:x.muted?1:0}:x))}><Text style={styles.choiceText}>{clipSettings[i]?.muted ? "Muted" : "Sound on"}</Text></Pressable>
            </ScrollView>
          </View>)}
        </View> : null}
        <Text style={styles.section}>Sound</Text>
        <Pressable style={styles.soundButton} onPress={chooseSound}><Text style={styles.choiceText}>{soundId ? `♫ ${soundTitle || soundId}` : "Add sound"}</Text></Pressable>
        {soundId ? <Pressable onPress={()=>{setSoundId("");setSoundTitle("");}}><Text style={styles.clearSound}>Remove sound</Text></Pressable> : null}
        <View style={styles.row}><Text style={styles.label}>Original {Math.round(originalVolume*100)}%</Text><Pressable style={styles.small} onPress={()=>setOriginalVolume(v=>v>=1?0:Math.min(1,v+0.25))}><Text style={styles.choiceText}>Adjust</Text></Pressable><Text style={styles.label}>Added {Math.round(addedSoundVolume*100)}%</Text><Pressable style={styles.small} onPress={()=>setAddedSoundVolume(v=>v>=1?0:Math.min(1,v+0.25))}><Text style={styles.choiceText}>Adjust</Text></Pressable></View>
        <Text style={styles.section}>Cover</Text>
        <TextInput value={String(coverTimeMs)} onChangeText={v=>setCoverTimeMs(Math.max(0,Number(v)||0))} keyboardType="numeric" placeholder="Cover time in milliseconds" placeholderTextColor="#777" style={styles.input} />
        <Text style={styles.section}>Post settings</Text>
        <View style={styles.row}>{["PUBLIC","FOLLOWERS","PRIVATE"].map(v=><Pressable key={v} style={[styles.choice,visibility===v&&styles.selected]} onPress={()=>setVisibility(v)}><Text style={styles.choiceText}>{v}</Text></Pressable>)}</View>
        <View style={styles.row}>{[[comments,"Comments"],[duet,"Duet"],[stitch,"Stitch"]].map(([on,label])=><Pressable key={String(label)} style={[styles.choice,on&&styles.selected]} onPress={()=>{ if(label==="Comments") setComments(!comments); else if(label==="Duet") setDuet(!duet); else setStitch(!stitch); }}><Text style={styles.choiceText}>{label}: {on?"On":"Off"}</Text></Pressable>)}</View>
        {mode === "VIDEO" && assets.length ? <Pressable style={styles.draftButton} onPress={()=>publish(false)} disabled={busy}><Text style={styles.draftText}>Save to Drafts</Text></Pressable> : null}
        {busy ? <View style={styles.progress}><ActivityIndicator color="#fff" /><Text style={styles.status}>{status}</Text></View> : null}
      </ScrollView>
    </View>
  );
}
const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:"#000",paddingTop:48},clipActions:{position:"absolute",bottom:4,left:8,right:8,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},action:{color:"#fff",fontSize:24,fontWeight:"900"},transitionRow:{paddingHorizontal:16,paddingVertical:4},transitionChoices:{gap:6},perClip:{paddingHorizontal:16,paddingVertical:4},helper:{color:"#777",fontSize:12,paddingHorizontal:16,paddingTop:4},trimInput:{flex:1,minWidth:130,marginHorizontal:0},draftButton:{marginHorizontal:16,marginTop:14,borderWidth:1,borderColor:"#444",borderRadius:12,padding:14,alignItems:"center"},draftText:{color:"#fff",fontWeight:"800"},content:{paddingBottom:80},section:{color:"#fff",fontSize:17,fontWeight:"900",paddingHorizontal:16,paddingTop:12,paddingBottom:8},row:{flexDirection:"row",flexWrap:"wrap",gap:8,paddingHorizontal:16,paddingVertical:6},choice:{borderWidth:1,borderColor:"#333",borderRadius:10,paddingHorizontal:12,paddingVertical:9,backgroundColor:"#111"},selected:{borderColor:"#ff2d55",backgroundColor:"#241017"},choiceText:{color:"#fff",fontWeight:"700"},label:{color:"#aaa",paddingVertical:9},small:{borderWidth:1,borderColor:"#333",borderRadius:10,paddingHorizontal:10,paddingVertical:8},input:{marginHorizontal:16,marginVertical:6,borderRadius:12,backgroundColor:"#151515",color:"#fff",padding:12,fontSize:15},header:{height:54,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:"#222"},close:{color:"#fff",fontSize:34,fontWeight:"300"},title:{color:"#fff",fontSize:18,fontWeight:"800"},post:{color:"#ff2d55",fontSize:16,fontWeight:"900"},disabled:{color:"#555"},modeRow:{flexDirection:"row",justifyContent:"center",gap:30,paddingVertical:22},mode:{alignItems:"center",gap:6},modeIcon:{color:"#fff",fontSize:28},modeText:{color:"#fff",fontWeight:"700"},caption:{margin:16,minHeight:100,borderRadius:14,backgroundColor:"#151515",color:"#fff",padding:14,fontSize:16,textAlignVertical:"top"},assets:{paddingHorizontal:16,gap:10},clip:{width:110,height:145,borderRadius:12,backgroundColor:"#181818",alignItems:"center",justifyContent:"center",position:"relative"},clipIcon:{color:"#fff",fontSize:30},clipText:{color:"#aaa",marginTop:8},remove:{position:"absolute",right:6,top:3,color:"#fff",fontSize:25},empty:{alignItems:"center",justifyContent:"center",padding:40},emptyIcon:{color:"#777",fontSize:60},emptyText:{color:"#888",textAlign:"center",fontSize:15},modeSelected:{borderBottomWidth:2,borderBottomColor:"#ff2d55"},progress:{alignItems:"center",gap:10,padding:20},status:{color:"#aaa"},soundButton:{marginHorizontal:16,marginVertical:6,borderRadius:12,backgroundColor:"#151515",borderWidth:1,borderColor:"#333",padding:14},clearSound:{color:"#ff2d55",fontWeight:"800",marginHorizontal:16,marginTop:4}
});
