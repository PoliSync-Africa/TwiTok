import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useState } from "react";
import { router } from "expo-router";
import { Typography, Colors } from "../theme/typography";
import { clearAuthToken, getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

export default function SettingsScreen(){
  const [allowComments,setAllowComments]=useState(true);
  const [filterAll,setFilterAll]=useState(false);
  const [filterSpam,setFilterSpam]=useState(true);
  const [keywords,setKeywords]=useState("");
  const [saving,setSaving]=useState(false);
  async function save(){
    setSaving(true);
    try {
      const token=await getAuthToken();
      const list=keywords.split(",").map(x=>x.trim()).filter(Boolean);
      const r=await fetch(API+"/auth/comment-settings",{method:"PATCH",headers:{"Content-Type":"application/json",Authorization:"Bearer "+(token??"")},body:JSON.stringify({allowComments,filterAll,filterSpam,filterKeywords:list})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error??"Unable to save");
      Alert.alert("Saved","Comment settings updated.");
    } catch(e){ Alert.alert("Error",e instanceof Error?e.message:"Unable to save"); }
    finally{setSaving(false);}
  }
  async function logout(){ await clearAuthToken(); router.replace("/"); }
  return <ScrollView style={styles.container} contentContainerStyle={styles.content}>
    <Text style={styles.title}>Settings</Text>
    <Text style={styles.section}>Comments</Text>
    <View style={styles.row}><View style={styles.copy}><Text style={styles.label}>Allow comments</Text><Text style={styles.hint}>Control comments on your content.</Text></View><Switch value={allowComments} onValueChange={setAllowComments}/></View>
    <View style={styles.row}><View style={styles.copy}><Text style={styles.label}>Filter all comments</Text><Text style={styles.hint}>Block comments that match your moderation settings.</Text></View><Switch value={filterAll} onValueChange={setFilterAll}/></View>
    <View style={styles.row}><View style={styles.copy}><Text style={styles.label}>Filter spam</Text><Text style={styles.hint}>Block common spam patterns.</Text></View><Switch value={filterSpam} onValueChange={setFilterSpam}/></View>
    <Text style={styles.label}>Keyword filters</Text>
    <TextInput value={keywords} onChangeText={setKeywords} placeholder="word1, word2, word3" placeholderTextColor="#666" style={styles.input}/>
    <Pressable disabled={saving} style={styles.save} onPress={save}><Text style={styles.saveText}>{saving?"Saving…":"Save comment settings"}</Text></Pressable>
    <Pressable style={styles.danger} onPress={()=>Alert.alert("Sign out","Sign out of TwiTok on this device?",[{text:"Cancel",style:"cancel"},{text:"Sign out",style:"destructive",onPress:logout}])}><Text style={styles.dangerText}>Sign out</Text></Pressable>
  </ScrollView>;
}
const styles=StyleSheet.create({container:{flex:1,backgroundColor:"#000"},content:{padding:24,paddingTop:70,paddingBottom:40},title:{color:Colors.text,...Typography.display,marginBottom:30},section:{color:Colors.text,...Typography.section,marginBottom:12},row:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingVertical:15,borderBottomWidth:1,borderBottomColor:"#222"},copy:{flex:1,paddingRight:16},label:{color:Colors.text,...Typography.bodySemibold,marginBottom:4},hint:{color:Colors.textMuted,...Typography.caption},input:{marginTop:10,backgroundColor:"#171717",borderRadius:12,color:"#fff",padding:14},save:{marginTop:16,backgroundColor:"#fff",padding:15,borderRadius:12,alignItems:"center"},saveText:{color:"#000",...Typography.button},danger:{marginTop:40,backgroundColor:"#241116",borderWidth:1,borderColor:"#5b2630",padding:16,borderRadius:12,alignItems:"center"},dangerText:{color:Colors.danger,...Typography.button}});
