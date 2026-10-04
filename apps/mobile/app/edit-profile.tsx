import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export default function EditProfileScreen() {
  const params=useLocalSearchParams<{username:string;nickname:string;bio:string;isPrivate:string}>();
  const [username,setUsername]=useState(String(params.username??""));
  const [nickname,setNickname]=useState(String(params.nickname??""));
  const [bio,setBio]=useState(String(params.bio??""));
  const [isPrivate,setIsPrivate]=useState(String(params.isPrivate)==="true");
  const [photo,setPhoto]=useState<string|null>(null);
  const [saving,setSaving]=useState(false);
  const [usernameStatus,setUsernameStatus]=useState<UsernameStatus>("idle");
  const usernameRequest=useRef(0);
  const normalizedUsername=username.trim().toLowerCase();

  useEffect(() => {
    usernameRequest.current += 1;
    const requestId=usernameRequest.current;
    const valid=/^[a-z0-9._]{3,24}$/.test(normalizedUsername) && !normalizedUsername.endsWith(".");
    if(!normalizedUsername){setUsernameStatus("idle");return;}
    if(!valid){setUsernameStatus("invalid");return;}

    setUsernameStatus("checking");
    const timer=setTimeout(async () => {
      try {
        const token=await getAuthToken();
        if(!token) throw new Error("Authentication required");
        const r=await fetch(API+"/auth/username-availability?username="+encodeURIComponent(normalizedUsername),{headers:{Authorization:"Bearer "+token}});
        const d=await r.json().catch(()=>({}));
        if(requestId!==usernameRequest.current) return;
        if(!r.ok || d.valid !== true){setUsernameStatus("invalid");return;}
        setUsernameStatus(d.available===true?"available":"taken");
      } catch {
        if(requestId===usernameRequest.current) setUsernameStatus("idle");
      }
    },350);
    return () => clearTimeout(timer);
  },[normalizedUsername]);

  async function save() {
    if(usernameStatus!=="available"){Alert.alert("Profile",usernameStatus==="taken"?"That username is already taken.":usernameStatus==="checking"?"Checking username availability…":"Enter a valid username.");return;}
    setSaving(true);
    try {
      const token=await getAuthToken();
      const r=await fetch(API+"/profile/me",{method:"PATCH",headers:{"Content-Type":"application/json",Authorization:"Bearer "+(token??"")},body:JSON.stringify({username:normalizedUsername,nickname,bio,isPrivate})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error??"Unable to save profile");
      router.back();
    } catch(e){Alert.alert("Profile",e instanceof Error?e.message:"Unable to save profile");}
    finally{setSaving(false);}
  }

  async function changePhoto(camera=false) {
    try {
      const result=camera?await ImagePicker.launchCameraAsync({mediaTypes:["images"],quality:.9,aspect:[1,1]}):await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],quality:.9,aspect:[1,1]});
      if(result.canceled) return;
      const asset=result.assets[0]; setPhoto(asset.uri);
      const token=await getAuthToken();
      const mimeType=asset.mimeType??"image/jpeg";
      const sign=await fetch(API+"/profile/me/photo-upload-url",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+(token??"")},body:JSON.stringify({mimeType})});
      const sd=await sign.json().catch(()=>({}));
      if(!sign.ok) throw new Error(sd.error??"Unable to prepare photo upload");
      const blob=await (await fetch(asset.uri)).blob();
      const put=await fetch(sd.uploadUrl,{method:"PUT",headers:{"Content-Type":mimeType},body:blob});
      if(!put.ok) throw new Error("Photo upload failed");
      Alert.alert("Profile photo","Photo updated.");
    } catch(e){Alert.alert("Profile photo",e instanceof Error?e.message:"Unable to update photo");}
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.header}><Pressable onPress={()=>router.back()}><Text style={styles.back}>‹</Text></Pressable><Text style={styles.title}>Edit profile</Text><View style={{width:32}}/></View>
    <View style={styles.photoWrap}>{photo?<Image source={{uri:photo}} style={styles.photo}/>:<View style={styles.photo}><Text style={styles.photoText}>{nickname.slice(0,1).toUpperCase()||"?"}</Text></View>}<Pressable style={styles.change} onPress={()=>changePhoto(false)}><Text style={styles.changeText}>Change photo</Text></Pressable><Pressable onPress={()=>changePhoto(true)}><Text style={styles.cameraText}>Take photo</Text></Pressable></View>
    <Text style={styles.label}>Username</Text>
    <TextInput value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} style={styles.input}/>
    {usernameStatus==="checking"?<Text style={styles.status}>Checking username availability…</Text>:null}
    {usernameStatus==="available"?<Text style={styles.available}>Username is available</Text>:null}
    {usernameStatus==="taken"?<Text style={styles.error}>That username is already taken</Text>:null}
    {usernameStatus==="invalid"&&normalizedUsername?<Text style={styles.error}>Username must be 3-24 characters, use letters, numbers, dots or underscores, and cannot end with a dot.</Text>:null}
    <Text style={styles.label}>Nickname</Text><TextInput value={nickname} onChangeText={setNickname} maxLength={50} style={styles.input}/>
    <Text style={styles.label}>Bio</Text><TextInput value={bio} onChangeText={setBio} maxLength={80} multiline style={[styles.input,styles.bioInput]}/><Text style={styles.counter}>{bio.length}/80</Text>
    <View style={styles.row}><View><Text style={styles.label}>Private account</Text><Text style={styles.hint}>Approve followers before they can see your content.</Text></View><Switch value={isPrivate} onValueChange={setIsPrivate}/></View>
    <Pressable style={[styles.save,(saving||usernameStatus!=="available")&&styles.saveDisabled]} onPress={save} disabled={saving||usernameStatus!=="available"}>{saving?<ActivityIndicator color="#fff"/>:<Text style={styles.saveText}>Save</Text>}</Pressable>
  </ScrollView>;
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:"#000"},content:{padding:18,paddingBottom:50},header:{height:58,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},back:{color:"#fff",fontSize:40},title:{color:"#fff",fontSize:18,fontWeight:"800"},photoWrap:{alignItems:"center",marginVertical:12},photo:{width:100,height:100,borderRadius:50,backgroundColor:"#252525",alignItems:"center",justifyContent:"center"},photoText:{color:"#fff",fontSize:36,fontWeight:"900"},change:{marginTop:12},changeText:{color:"#ff2d55",fontWeight:"800"},cameraText:{color:"#aaa",marginTop:8},label:{color:"#fff",fontWeight:"800",marginTop:18,marginBottom:7},input:{height:46,borderRadius:7,backgroundColor:"#171717",color:"#fff",paddingHorizontal:14,borderWidth:1,borderColor:"#292929"},bioInput:{height:100,paddingTop:12,textAlignVertical:"top"},counter:{color:"#777",textAlign:"right",marginTop:4},status:{color:"#aaa",fontSize:12,marginTop:5},available:{color:"#6ee7b7",fontSize:12,marginTop:5},error:{color:"#ff6b81",fontSize:12,marginTop:5},row:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:20},hint:{color:"#777",fontSize:12,maxWidth:280,marginTop:4},save:{height:48,borderRadius:7,backgroundColor:"#ff2d55",alignItems:"center",justifyContent:"center",marginTop:30},saveDisabled:{opacity:.5},saveText:{color:"#fff",fontWeight:"900",fontSize:16}});
