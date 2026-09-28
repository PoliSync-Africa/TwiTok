import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { clearAuthToken } from "../lib/auth";

export default function SettingsScreen(){
  async function logout(){ await clearAuthToken(); router.replace("/"); }
  return <View style={styles.container}><Text style={styles.title}>Account</Text><Pressable style={styles.danger} onPress={()=>Alert.alert("Sign out","Sign out of TwiTok on this device?",[{text:"Cancel",style:"cancel"},{text:"Sign out",style:"destructive",onPress:logout}])}><Text style={styles.dangerText}>Sign out</Text></Pressable></View>;
}
const styles=StyleSheet.create({container:{flex:1,backgroundColor:"#000",padding:24,justifyContent:"center"},title:{color:"#fff",fontSize:28,fontWeight:"800",textAlign:"center",marginBottom:24},danger:{backgroundColor:"#241116",borderWidth:1,borderColor:"#5b2630",padding:16,borderRadius:12,alignItems:"center"},dangerText:{color:"#ff7188",fontWeight:"800",fontSize:16}});
