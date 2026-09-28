import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

export default function CreateVideoScreen() {
  const [uri,setUri]=useState<string | null>(null);
  const [mimeType,setMimeType]=useState("video/mp4");
  const [sizeBytes,setSizeBytes]=useState(0);
  const [durationMs,setDurationMs]=useState<number | undefined>();
  const [caption,setCaption]=useState("");
  const [visibility,setVisibility]=useState<"PUBLIC"|"FOLLOWERS"|"PRIVATE">("PUBLIC");
  const [allowComments,setAllowComments]=useState(true);
  const [allowDuet,setAllowDuet]=useState(true);
  const [allowStitch,setAllowStitch]=useState(true);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");
  const [error,setError]=useState("");

  async function chooseVideo(){
    setError("");
    const result=await ImagePicker.launchImageLibraryAsync({
      mediaTypes:["videos"],
      allowsEditing:true,
      quality:1
    });
    if(result.canceled) return;
    const asset=result.assets[0];
    setUri(asset.uri);
    setMimeType(asset.mimeType ?? "video/mp4");
    setSizeBytes(asset.fileSize ?? 0);
    setDurationMs(asset.duration ?? undefined);
  }

  async function publish(){
    if(!uri) { setError("Choose a video first."); return; }
    if(!sizeBytes) { setError("Unable to read the selected video size."); return; }
    setBusy(true); setError(""); setStatus("Preparing upload…");
    try {
      const token=await getAuthToken();
      if(!token) throw new Error("Sign in to post a video.");
      const headers={Authorization:"Bearer "+token,"Content-Type":"application/json"};
      const session=await fetch(API+"/video/uploads",{method:"POST",headers,body:JSON.stringify({mimeType,sizeBytes,durationMs})});
      const sd=await session.json().catch(()=>({}));
      if(!session.ok) throw new Error(sd.error ?? "Unable to prepare video upload");
      if(!sd.uploadUrl) throw new Error("Video storage is not configured.");
      setStatus("Uploading video…");
      const blob=await (await fetch(uri)).blob();
      const put=await fetch(sd.uploadUrl,{method:"PUT",headers:{"Content-Type":mimeType},body:blob});
      if(!put.ok) throw new Error("Video upload failed");
      setStatus("Processing video…");
      const complete=await fetch(API+"/video/uploads/"+sd.uploadId+"/complete",{method:"POST",headers});
      const cd=await complete.json().catch(()=>({}));
      if(!complete.ok) throw new Error(cd.error ?? "Unable to process video");
      const draft=await fetch(API+"/video/drafts",{method:"POST",headers,body:JSON.stringify({
        uploadId:sd.uploadId,caption,visibility,allowComments,allowDuet,allowStitch
      })});
      const dd=await draft.json().catch(()=>({}));
      if(!draft.ok) throw new Error(dd.error ?? "Unable to create video draft");
      const videoId=dd.videoId ?? dd.id;
      if(!videoId) throw new Error("Video draft did not return an id.");
      for(let attempt=0;attempt<24;attempt++){
        const check=await fetch(API+"/video/"+videoId,{headers:{Authorization:"Bearer "+token}});
        const vd=await check.json().catch(()=>({}));
        if(check.ok && vd.status==="READY" && vd.playback){
          setStatus("Publishing…");
          const pub=await fetch(API+"/video/"+videoId+"/publish",{method:"POST",headers});
          const pd=await pub.json().catch(()=>({}));
          if(!pub.ok) throw new Error(pd.error ?? "Unable to publish video");
          router.replace("/feed");
          return;
        }
        if(check.ok && vd.status==="FAILED") throw new Error("Video processing failed.");
        await new Promise(resolve=>setTimeout(resolve,5000));
      }
      throw new Error("Video is still processing. Please try again shortly.");
    } catch(e) {
      setError(e instanceof Error ? e.message : "Unable to publish video");
      setStatus("");
    } finally { setBusy(false); }
  }

  return <ScrollView contentContainerStyle={styles.container}>
    <Text style={styles.title}>Post video</Text>
    <Text style={styles.subtitle}>Upload a video from your gallery, add a caption, then publish it to TwiTok.</Text>
    <Pressable style={styles.pick} onPress={chooseVideo} disabled={busy}>
      <Text style={styles.pickText}>{uri ? "Change video" : "Choose video from gallery"}</Text>
    </Pressable>
    {uri?<View style={styles.info}><Text style={styles.infoText}>{mimeType} · {Math.round(sizeBytes/1024/1024*10)/10} MB</Text><Text style={styles.infoText}>{durationMs ? Math.round(durationMs/1000)+"s" : "Duration unavailable"}</Text></View>:null}
    <TextInput value={caption} onChangeText={setCaption} placeholder="Describe your video…" placeholderTextColor="#777" style={styles.input} multiline maxLength={2200}/>
    <Text style={styles.label}>Who can watch</Text>
    <View style={styles.row}>{(["PUBLIC","FOLLOWERS","PRIVATE"] as const).map(v=><Pressable key={v} onPress={()=>setVisibility(v)} style={[styles.chip,visibility===v&&styles.chipActive]}><Text style={styles.chipText}>{v==="PUBLIC"?"Everyone":v==="FOLLOWERS"?"Followers":"Only me"}</Text></Pressable>)}</View>
    <Pressable style={styles.setting} onPress={()=>setAllowComments(v=>!v)}><Text style={styles.settingText}>Allow comments</Text><Text style={styles.value}>{allowComments?"ON":"OFF"}</Text></Pressable>
    <Pressable style={styles.setting} onPress={()=>setAllowDuet(v=>!v)}><Text style={styles.settingText}>Allow Duet</Text><Text style={styles.value}>{allowDuet?"ON":"OFF"}</Text></Pressable>
    <Pressable style={styles.setting} onPress={()=>setAllowStitch(v=>!v)}><Text style={styles.settingText}>Allow Stitch</Text><Text style={styles.value}>{allowStitch?"ON":"OFF"}</Text></Pressable>
    {status?<View style={styles.status}><ActivityIndicator color="#fff"/><Text style={styles.statusText}>{status}</Text></View>:null}
    {error?<Text style={styles.error}>{error}</Text>:null}
    <Pressable style={[styles.publish,!uri&&styles.disabled]} onPress={publish} disabled={busy||!uri}>{busy?<ActivityIndicator color="#fff"/>:<Text style={styles.publishText}>Post</Text>}</Pressable>
    <Pressable onPress={()=>router.back()} disabled={busy}><Text style={styles.cancel}>Cancel</Text></Pressable>
  </ScrollView>;
}

const styles=StyleSheet.create({
 container:{flexGrow:1,backgroundColor:"#000",padding:22,paddingTop:70},
 title:{color:"#fff",fontSize:30,fontWeight:"900",marginBottom:8},
 subtitle:{color:"#aaa",lineHeight:20,marginBottom:22},
 pick:{height:180,borderRadius:16,borderWidth:1,borderColor:"#333",backgroundColor:"#151515",alignItems:"center",justifyContent:"center",marginBottom:14},
 pickText:{color:"#fff",fontSize:17,fontWeight:"800"},
 info:{backgroundColor:"#171717",borderRadius:12,padding:12,marginBottom:14,gap:4},
 infoText:{color:"#aaa",fontSize:13},
 input:{minHeight:110,borderRadius:12,borderWidth:1,borderColor:"#333",backgroundColor:"#171717",color:"#fff",padding:14,textAlignVertical:"top",fontSize:16,marginBottom:18},
 label:{color:"#fff",fontWeight:"800",marginBottom:8},
 row:{flexDirection:"row",gap:8,marginBottom:16},
 chip:{borderWidth:1,borderColor:"#333",borderRadius:20,paddingVertical:9,paddingHorizontal:13},
 chipActive:{backgroundColor:"#ff2d55",borderColor:"#ff2d55"},
 chipText:{color:"#fff",fontWeight:"700"},
 setting:{flexDirection:"row",justifyContent:"space-between",paddingVertical:15,borderBottomWidth:1,borderBottomColor:"#222"},
 settingText:{color:"#fff",fontSize:16},
 value:{color:"#ff2d55",fontWeight:"800"},
 status:{flexDirection:"row",alignItems:"center",gap:10,marginTop:18},
 statusText:{color:"#fff"},
 error:{color:"#ff7188",marginTop:14,lineHeight:20},
 publish:{backgroundColor:"#ff2d55",borderRadius:12,padding:16,alignItems:"center",marginTop:22},
 publishText:{color:"#fff",fontWeight:"900",fontSize:17},
 disabled:{opacity:0.45},
 cancel:{color:"#aaa",textAlign:"center",padding:18,fontWeight:"700"}
});