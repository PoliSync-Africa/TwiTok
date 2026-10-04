import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Typography, Colors } from "../theme/typography";
import * as ImagePicker from "expo-image-picker";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export default function ProfileSetupScreen() {
  const [username,setUsername]=useState("");
  const [nickname,setNickname]=useState("");
  const [bio,setBio]=useState("");
  const [isPrivate,setIsPrivate]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [photoUri,setPhotoUri]=useState<string | null>(null);
  const [photoMime,setPhotoMime]=useState<string>("image/jpeg");
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
        const r=await fetch(API+"/auth/username-availability?username="+encodeURIComponent(normalizedUsername),{
          headers:{Authorization:"Bearer "+token}
        });
        const d=await r.json().catch(()=>({}));
        if(requestId!==usernameRequest.current) return;
        if(!r.ok || d.valid !== true) { setUsernameStatus("invalid"); return; }
        setUsernameStatus(d.available === true ? "available" : "taken");
      } catch {
        if(requestId===usernameRequest.current) setUsernameStatus("idle");
      }
    },350);

    return () => clearTimeout(timer);
  },[normalizedUsername]);

  async function pickPhoto(){
    try {
      const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],allowsEditing:true,aspect:[1,1],quality:0.9});
      if(result.canceled) return;
      const asset=result.assets[0];
      setPhotoUri(asset.uri);
      setPhotoMime(asset.mimeType ?? "image/jpeg");
    } catch(e){ setError(e instanceof Error ? e.message : "Unable to select profile photo"); }
  }

  async function uploadPhoto(token:string){
    if(!photoUri) return;
    const sign=await fetch(API+"/profile/me/photo-upload-url",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({mimeType:photoMime})});
    const sd=await sign.json().catch(()=>({}));
    if(!sign.ok) throw new Error(sd.error??"Unable to prepare profile photo upload");
    const blob=await (await fetch(photoUri)).blob();
    const put=await fetch(sd.uploadUrl,{method:"PUT",headers:{"Content-Type":photoMime},body:blob});
    if(!put.ok) throw new Error("Profile photo upload failed");
  }

  async function complete(){
    const normalized=normalizedUsername;
    const displayName=nickname.trim();
    if(usernameStatus!=="available"){setError(usernameStatus==="taken"?"That username is already taken.":usernameStatus==="checking"?"Checking username availability…":"Choose a valid available username.");return;}
    if(!displayName){setError("Enter a nickname.");return;}
    if(bio.trim().length>80){setError("Bio must be 80 characters or less.");return;}
    setBusy(true);setError("");
    try{
      const token=await getAuthToken();
      const r=await fetch(API+"/auth/profile-setup",{method:"PATCH",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}: {})},body:JSON.stringify({username:normalized,nickname:displayName,bio:bio.trim(),isPrivate})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error??"Unable to complete profile");
      if(photoUri) await uploadPhoto(token!);
      router.replace("/feed");
    }catch(e){setError(e instanceof Error?e.message:"Unable to complete profile");}finally{setBusy(false);}
  }

  return <ScrollView contentContainerStyle={styles.container}>
    <Text style={styles.logo}>TwiTok</Text>
    <Text style={styles.title}>Set up your profile</Text>
    <Text style={styles.subtitle}>Choose the profile details people will see on TwiTok.</Text>
    <Pressable style={styles.avatar} onPress={pickPhoto}>{photoUri?<Image source={{uri:photoUri}} style={styles.avatarImage}/>:<Text style={styles.avatarText}>+</Text>}</Pressable>
    <Pressable onPress={pickPhoto}><Text style={styles.photoHint}>{photoUri?"Change profile photo":"Add profile photo"}</Text></Pressable>
    <TextInput style={styles.input} value={nickname} onChangeText={setNickname} placeholder="Nickname" placeholderTextColor="#777" maxLength={50}/>
    <TextInput style={styles.input} value={username} onChangeText={setUsername} placeholder="@username" placeholderTextColor="#777" autoCapitalize="none" autoCorrect={false}/>
    {usernameStatus==="checking"?<Text style={styles.status}>Checking username availability…</Text>:null}
    {usernameStatus==="available"?<Text style={styles.available}>Username is available</Text>:null}
    {usernameStatus==="taken"?<Text style={styles.error}>That username is already taken</Text>:null}
    {usernameStatus==="invalid"&&normalizedUsername?<Text style={styles.error}>Username must be 3-24 characters, use letters, numbers, dots or underscores, and cannot end with a dot.</Text>:null}
    <TextInput style={[styles.input,styles.bio]} value={bio} onChangeText={setBio} placeholder="Bio" placeholderTextColor="#777" maxLength={80} multiline/>
    <View style={styles.privacy}><Text style={styles.privacyText}>Private account</Text><Switch value={isPrivate} onValueChange={setIsPrivate}/></View>
    {error?<Text style={styles.error}>{error}</Text>:null}
    <Pressable style={[styles.button,(busy||usernameStatus!=="available")&&styles.buttonDisabled]} onPress={complete} disabled={busy||usernameStatus!=="available"}>{busy?<ActivityIndicator color="#fff"/>:<Text style={styles.buttonText}>Continue to TwiTok</Text>}</Pressable>
  </ScrollView>;
}
const styles=StyleSheet.create({
 container:{flexGrow:1,backgroundColor:"#000",padding:24,justifyContent:"center"},
 logo:{color:Colors.text,...Typography.display,textAlign:"center",marginBottom:12},
 title:{color:Colors.text,...Typography.title,textAlign:"center",marginBottom:8},
 subtitle:{color:Colors.textSecondary,...Typography.caption,textAlign:"center",marginBottom:20},
 avatar:{width:88,height:88,borderRadius:44,backgroundColor:"#222",alignSelf:"center",alignItems:"center",justifyContent:"center",marginBottom:6},
 avatarText:{color:"#fff",fontSize:34,fontWeight:"300"},
 avatarImage:{width:88,height:88,borderRadius:44},
 photoHint:{color:Colors.textSecondary,...Typography.caption,textAlign:"center",marginBottom:18},
 input:{backgroundColor:"#171717",borderWidth:1,borderColor:"#2d2d2d",borderRadius:12,color:"#fff",paddingHorizontal:16,paddingVertical:14,marginBottom:12,fontSize:16},
 bio:{minHeight:80,textAlignVertical:"top"},
 status:{color:Colors.textSecondary,...Typography.caption,marginTop:-6,marginBottom:10},
 available:{color:"#6ee7b7",...Typography.caption,marginTop:-6,marginBottom:10},
 privacy:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingVertical:8,marginBottom:12},
 privacyText:{color:Colors.text,...Typography.bodySemibold},
 button:{backgroundColor:"#ff2d55",borderRadius:12,padding:15,alignItems:"center",marginTop:8},
 buttonDisabled:{opacity:0.5},
 buttonText:{color:Colors.text,...Typography.button},
 error:{color:Colors.danger,...Typography.caption,textAlign:"center",marginBottom:10}
});