import { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

export default function EditProfileScreen() {
  const params=useLocalSearchParams<{username:string;nickname:string;bio:string;isPrivate:string}>();
  const [username,setUsername]=useState(String(params.username??""));
  const [nickname,setNickname]=useState(String(params.nickname??""));
  const [bio,setBio]=useState(String(params.bio??""));
  const [isPrivate,setIsPrivate]=useState(String(params.isPrivate)==="true");
  const [photo,setPhoto]=useState<string|null>(null);
  const [saving,setSaving]=useState(false);

  async function save() {
    setSaving(true);
    try {
      const token=await getAuthToken();
      const r=await fetch(API+"/profile/me",{method:"PATCH",headers:{"Content-Type":"application/json",Authorization:"Bearer "+(token??"")},body:JSON.stringify({username,nickname,bio,isPrivate})});
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
    <Text style={styles.label}>Username</Text><TextInput value={username} onChangeText={setUsername} autoCapitalize="none" style={styles.input}/>
    <Text style={styles.label}>Nickname</Text><TextInput value={nickname} onChangeText={setNickname} maxLength={50} style={styles.input}/>
    <Text style={styles.label}>Bio</Text><TextInput value={bio} onChangeText={setBio} maxLength={80} multiline style={[styles.input,styles.bioInput]}/><Text style={styles.counter}>{bio.length}/80</Text>
    <View style={styles.row}><View><Text style={styles.label}>Private account</Text><Text style={styles.hint}>Approve followers before they can see your content.</Text></View><Switch value={isPrivate} onValueChange={setIsPrivate}/></View>
    <Pressable style={styles.save} onPress={save} disabled={saving}>{saving?<ActivityIndicator color="#fff"/>:<Text style={styles.saveText}>Save</Text>}</Pressable>
  </ScrollView>;
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:"#000"},content:{padding:18,paddingBottom:50},header:{height:58,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},back:{color:"#fff",fontSize:40},title:{color:"#fff",fontSize:18,fontWeight:"800"},photoWrap:{alignItems:"center",marginVertical:12},photo:{width:100,height:100,borderRadius:50,backgroundColor:"#252525",alignItems:"center",justifyContent:"center"},photoText:{color:"#fff",fontSize:36,fontWeight:"900"},change:{marginTop:12},changeText:{color:"#ff2d55",fontWeight:"800"},cameraText:{color:"#aaa",marginTop:8},label:{color:"#fff",fontWeight:"800",marginTop:18,marginBottom:7},input:{height:46,borderRadius:7,backgroundColor:"#171717",color:"#fff",paddingHorizontal:14,borderWidth:1,borderColor:"#292929"},bioInput:{height:100,paddingTop:12,textAlignVertical:"top"},counter:{color:"#777",textAlign:"right",marginTop:4},row:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:20},hint:{color:"#777",fontSize:12,maxWidth:280,marginTop:4},save:{height:48,borderRadius:7,backgroundColor:"#ff2d55",alignItems:"center",justifyContent:"center",marginTop:30},saveText:{color:"#fff",fontWeight:"900",fontSize:16}});
