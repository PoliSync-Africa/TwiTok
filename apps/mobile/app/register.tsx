import { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Typography, Colors } from "../theme/typography";
import { saveAuthToken } from "../lib/auth";
import { DEFAULT_COUNTRY, type Country } from "../lib/countries";
import { CountryPicker } from "../components/CountryPicker";

const API=process.env.EXPO_PUBLIC_TWITOK_API_URL??"https://twitok-api-sfig.onrender.com/api/v1";

export default function RegisterScreen(){
 const [email,setEmail]=useState("");const [phone,setPhone]=useState("");const [password,setPassword]=useState("");const [dateOfBirth,setDateOfBirth]=useState("");const [country,setCountry]=useState<Country>(DEFAULT_COUNTRY);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 async function register(){
  if(!email.trim()&&!phone.trim()){setError("Choose at least one contact method.");return;}
  if(password.length<8){setError("Password must contain at least 8 characters.");return;}
  setBusy(true);setError("");
  try{
   const r=await fetch(API+"/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:email.trim()||undefined,phone:phone.trim()||undefined,password,dateOfBirth,countryCode:country.iso})});
   const d=await r.json().catch(()=>({}));if(!r.ok||!d.token)throw new Error(d.error??"Unable to create account");
   await saveAuthToken(d.token);router.replace("/profile-setup");
  }catch(e){setError(e instanceof Error?e.message:"Unable to create account");}finally{setBusy(false);}
 }
 return <ScrollView contentContainerStyle={styles.container}>
  <Pressable style={styles.close} onPress={()=>router.back()}><Text style={styles.closeText}>×</Text></Pressable>
  <View style={styles.brand}><Image source={require("../assets/images/twitok-logo.png")} style={styles.logo} resizeMode="contain"/><Text style={styles.wordmark}><Text style={styles.gold}>Twi</Text><Text style={styles.white}>T</Text><Text style={styles.gold}>o</Text><Text style={styles.white}>k</Text></Text><Text style={styles.tagline}>AFRICA'S VIDEO PLATFORM</Text></View>
  <Text style={styles.title}>Join TwiTok</Text><Text style={styles.subtitle}>Create your account and share your story with the world.</Text>
  <Text style={styles.label}>Email</Text><TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email address" placeholderTextColor={Colors.textMuted} autoCapitalize="none" keyboardType="email-address"/>
  <Text style={styles.label}>Phone</Text><View style={styles.phoneRow}><CountryPicker value={country} onChange={setCountry}/><TextInput style={styles.phoneInput} value={phone} onChangeText={setPhone} placeholder="Phone number" placeholderTextColor={Colors.textMuted} keyboardType="phone-pad"/></View>
  <Text style={styles.label}>Password</Text><TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="At least 8 characters" placeholderTextColor={Colors.textMuted} secureTextEntry/>
  <Text style={styles.label}>Date of birth</Text><TextInput style={styles.input} value={dateOfBirth} onChangeText={setDateOfBirth} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.textMuted}/>
  <View style={styles.notice}><Text style={styles.noticeTitle}>Your username comes next</Text><Text style={styles.noticeText}>After signup, TwiTok will take you to Profile Setup where you must choose a unique username.</Text></View>
  {error?<Text style={styles.error}>{error}</Text>:null}
  <Pressable style={[styles.button,busy&&styles.disabled]} onPress={register} disabled={busy}>{busy?<ActivityIndicator color="#080808"/>:<Text style={styles.buttonText}>Create account</Text>}</Pressable>
  <Text style={styles.legal}>Verification can be completed later. You agree to TwiTok's Terms and Privacy Policy.</Text>
  <Pressable onPress={()=>router.replace("/login")}><Text style={styles.back}>Already have an account? <Text style={styles.goldText}>Log in</Text></Text></Pressable>
 </ScrollView>;
}
const styles=StyleSheet.create({
 container:{flexGrow:1,backgroundColor:Colors.background,padding:24,paddingTop:50,paddingBottom:34,justifyContent:"center"},close:{position:"absolute",top:16,left:16,width:42,height:42,alignItems:"center",justifyContent:"center",zIndex:2},closeText:{color:Colors.text,fontSize:34},
 brand:{alignItems:"center",marginBottom:20},logo:{width:98,height:98},wordmark:{fontSize:31,fontWeight:"900"},gold:{color:Colors.gold},white:{color:Colors.text},tagline:{color:Colors.gold,letterSpacing:3,fontSize:8,fontWeight:"800"},
 title:{color:Colors.text,...Typography.title,textAlign:"center"},subtitle:{color:Colors.textSecondary,...Typography.caption,textAlign:"center",marginTop:6,marginBottom:20},label:{color:Colors.textSecondary,...Typography.label,marginBottom:6,marginLeft:2},input:{backgroundColor:Colors.surface,borderWidth:1,borderColor:Colors.border,borderRadius:12,color:Colors.text,paddingHorizontal:14,paddingVertical:14,marginBottom:12,...Typography.body},phoneRow:{flexDirection:"row",gap:8,marginBottom:12},phoneInput:{flex:1,backgroundColor:Colors.surface,borderWidth:1,borderColor:Colors.border,borderRadius:12,color:Colors.text,paddingHorizontal:14,paddingVertical:14,...Typography.body},notice:{backgroundColor:"#17120a",borderWidth:1,borderColor:Colors.goldDeep,borderRadius:13,padding:13,marginBottom:12},noticeTitle:{color:Colors.gold,...Typography.bodySemibold},noticeText:{color:Colors.textSecondary,...Typography.caption,marginTop:4},error:{color:Colors.danger,...Typography.caption,textAlign:"center",marginBottom:10},button:{backgroundColor:Colors.gold,borderRadius:13,minHeight:52,alignItems:"center",justifyContent:"center"},disabled:{opacity:.6},buttonText:{color:"#080808",...Typography.button},legal:{color:Colors.textMuted,...Typography.caption,textAlign:"center",marginTop:14},back:{color:Colors.textSecondary,...Typography.caption,textAlign:"center",marginTop:20},goldText:{color:Colors.gold,fontWeight:"800"}
});