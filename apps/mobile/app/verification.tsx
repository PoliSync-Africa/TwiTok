import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Image } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { getAuthToken } from "../lib/auth";

const API=process.env.EXPO_PUBLIC_TWITOK_API_URL??"http://localhost:4000/api/v1";

export default function VerificationScreen(){
  const [status,setStatus]=useState<any>(null);
  const [type,setType]=useState("PERSONAL");
  const [legalName,setLegalName]=useState("");
  const [displayName,setDisplayName]=useState("");
  const [website,setWebsite]=useState("");
  const [links,setLinks]=useState(["",""]);
  const [reason,setReason]=useState("");
  const [documentKey,setDocumentKey]=useState("");
  const [documentUri,setDocumentUri]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  async function load(){
    const token=await getAuthToken();if(!token){setMessage("Sign in required.");return}
    const r=await fetch(API+"/verification/me",{headers:{Authorization:"Bearer "+token}});
    const d=await r.json().catch(()=>({}));if(r.ok)setStatus(d);
  }
  useEffect(()=>{void load()},[]);

  async function pickDocument(){
    const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],quality:1});
    if(result.canceled||!result.assets[0])return;
    const asset=result.assets[0];
    const token=await getAuthToken();if(!token)return;
    setBusy(true);setMessage("");
    try{
      const mime=String(asset.mimeType??"image/jpeg");
      const r=await fetch(API+"/verification/document-upload-url",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({mimeType:mime})});
      const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error??"Unable to prepare secure upload");
      const blob=await fetch(asset.uri).then(x=>x.blob());
      const put=await fetch(d.uploadUrl,{method:"PUT",headers:{"Content-Type":mime},body:blob});
      if(!put.ok)throw new Error("Document upload failed");
      setDocumentKey(d.objectKey);setDocumentUri(asset.uri);setMessage("Identity document uploaded securely.");
    }catch(e){setMessage(e instanceof Error?e.message:"Document upload failed")}finally{setBusy(false)}
  }

  async function submit(){
    const token=await getAuthToken();if(!token)return;
    if(!documentKey)return setMessage("Upload your identity document first.");
    if(links.filter(Boolean).length<2)return setMessage("Add two credible public supporting links.");
    setBusy(true);setMessage("");
    try{
      const r=await fetch(API+"/verification/requests",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({type,legalName,displayName,website,reason,supportingLinks:links.filter(Boolean),identityDocumentKey:documentKey})});
      const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error??"Verification request failed");
      setStatus(d);setMessage("Verification request submitted.");
    }catch(e){setMessage(e instanceof Error?e.message:"Verification request failed")}finally{setBusy(false)}
  }

  return <View style={styles.screen}><View style={styles.header}><Pressable onPress={()=>router.back()}><Text style={styles.back}>‹</Text></Pressable><Text style={styles.title}>Verification</Text><View style={{width:32}}/></View>
    <ScrollView contentContainerStyle={styles.content}>
      {status?.isVerified?<View style={styles.card}><Text style={styles.kicker}>VERIFIED</Text><Text style={styles.big}>✓ Verified {String(status.verificationType??"account").toLowerCase()}</Text><Text style={styles.muted}>Your badge is applied by TwiTok after review.</Text></View>:status?.status==="PENDING"?<View style={styles.card}><Text style={styles.kicker}>UNDER REVIEW</Text><Text style={styles.big}>Application pending</Text><Text style={styles.muted}>TwiTok is reviewing your evidence.</Text></View>:<View style={styles.card}>
        <Text style={styles.kicker}>OFFICIAL BADGE</Text><Text style={styles.heading}>Request verification</Text><Text style={styles.muted}>Verification is free. TwiTok reviews authenticity, completeness, activity, uniqueness and credible public evidence.</Text>
        <Text style={styles.label}>Type</Text><View style={styles.row}>{["PERSONAL","BUSINESS","INSTITUTIONAL"].map(x=><Pressable key={x} onPress={()=>setType(x)} style={[styles.choice,type===x&&styles.active]}><Text style={styles.choiceText}>{x}</Text></Pressable>)}</View>
        <Text style={styles.label}>Legal / registered name</Text><TextInput style={styles.input} value={legalName} onChangeText={setLegalName} placeholder="Legal name" placeholderTextColor="#777"/>
        <Text style={styles.label}>Public display name</Text><TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} placeholder="Display name" placeholderTextColor="#777"/>
        <Text style={styles.label}>Website (optional)</Text><TextInput style={styles.input} value={website} onChangeText={setWebsite} autoCapitalize="none" placeholder="https://example.com" placeholderTextColor="#777"/>
        <Text style={styles.label}>Why should this account be verified?</Text><TextInput style={[styles.input,styles.textarea]} value={reason} onChangeText={setReason} multiline placeholder="Explain who you represent and why authenticity matters." placeholderTextColor="#777"/>
        <Text style={styles.label}>Identity document</Text><Pressable disabled={busy} onPress={()=>void pickDocument()} style={styles.upload}>{documentUri?<Image source={{uri:documentUri}} style={styles.preview}/>:<Text style={styles.uploadText}>Choose a clear ID image</Text>}</Pressable>
        <Text style={styles.label}>Supporting public links</Text>{links.map((x,i)=><TextInput key={i} style={styles.input} value={x} onChangeText={v=>setLinks(a=>a.map((item,j)=>j===i?v:item))} autoCapitalize="none" placeholder={"News/article URL "+(i+1)} placeholderTextColor="#777"/>)} 
        <Pressable disabled={busy} onPress={()=>void submit()} style={styles.submit}>{busy?<ActivityIndicator color="#000"/>:<Text style={styles.submitText}>Submit application</Text>}</Pressable>
        {!!message&&<Text style={styles.message}>{message}</Text>}
      </View>}
      <View style={styles.card}><Text style={styles.heading}>How it works</Text><Text style={styles.muted}>1. You apply. 2. TwiTok checks your identity and public evidence. 3. An authorized owner reviewer approves or rejects the request. Only TwiTok can apply the official badge.</Text></View>
    </ScrollView>
  </View>
}

const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:"#000"},header:{height:58,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:"#222"},back:{color:"#fff",fontSize:40},title:{color:"#fff",fontSize:18,fontWeight:"900"},content:{padding:16,paddingBottom:40},card:{backgroundColor:"#111",borderRadius:16,borderWidth:1,borderColor:"#252525",padding:18,marginBottom:12},kicker:{color:"#888",fontSize:11,fontWeight:"900",letterSpacing:1.5},heading:{color:"#fff",fontSize:20,fontWeight:"900",marginTop:7},big:{color:"#fff",fontSize:22,fontWeight:"900",marginTop:8},muted:{color:"#888",lineHeight:20,marginTop:8},label:{color:"#aaa",fontSize:12,fontWeight:"800",marginTop:15,marginBottom:7},row:{flexDirection:"row",gap:7,flexWrap:"wrap"},choice:{paddingHorizontal:11,paddingVertical:9,borderRadius:9,backgroundColor:"#1a1a1a",borderWidth:1,borderColor:"#333"},active:{borderColor:"#fff",backgroundColor:"#2a2a2a"},choiceText:{color:"#fff",fontSize:11,fontWeight:"800"},input:{backgroundColor:"#181818",borderWidth:1,borderColor:"#333",borderRadius:10,padding:12,color:"#fff"},textarea:{minHeight:100,textAlignVertical:"top"},upload:{height:150,borderRadius:12,borderWidth:1,borderColor:"#333",borderStyle:"dashed",alignItems:"center",justifyContent:"center",overflow:"hidden",backgroundColor:"#181818"},uploadText:{color:"#aaa",fontWeight:"800"},preview:{width:"100%",height:"100%",resizeMode:"contain"},submit:{marginTop:18,backgroundColor:"#fff",borderRadius:10,padding:14,alignItems:"center"},submitText:{color:"#000",fontWeight:"900"},message:{color:"#d8ad43",marginTop:10,lineHeight:19}
});
