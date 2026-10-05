import { useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Typography, Colors } from "../theme/typography";
import { saveAuthToken } from "../lib/auth";
import { DEFAULT_COUNTRY, type Country } from "../lib/countries";
import { CountryPicker } from "../components/CountryPicker";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "https://twitok-api-sfig.onrender.com/api/v1";
type LoginMethod = "phone" | "email" | "username";

export default function LoginScreen() {
  const [method,setMethod]=useState<LoginMethod>("phone");
  const [identifier,setIdentifier]=useState("");
  const [country,setCountry]=useState<Country>(DEFAULT_COUNTRY);
  const [password,setPassword]=useState("");
  const [showPassword,setShowPassword]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  function selectMethod(next:LoginMethod){setMethod(next);setIdentifier("");setError("");}
  async function login(){
    const value=identifier.trim();
    if(!value||!password){setError("Enter your login information and password.");return;}
    if(method==="email"&&!/^\S+@\S+\.\S+$/.test(value)){setError("Enter a valid email address.");return;}
    if(method==="username"&&!/^[a-z0-9._]{3,24}$/i.test(value)){setError("Enter a valid username.");return;}
    if(method==="phone"&&value.replace(/\D/g,"").length<7){setError("Enter a valid phone number.");return;}
    setBusy(true);setError("");
    try{
      const response=await fetch(API+"/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({identifier:value,password,countryCode:country.iso})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.token)throw new Error(data.error??"Unable to log in");
      await saveAuthToken(data.token);
      router.replace(data.user?.profileSetupComplete===false?"/profile-setup":"/feed");
    }catch(e){setError(e instanceof Error?e.message:"Unable to log in");}finally{setBusy(false);}
  }

  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS==="ios"?"padding":undefined}>
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Pressable style={styles.close} onPress={()=>router.back()}><Text style={styles.closeText}>×</Text></Pressable>
      <View style={styles.brand}><Image source={require("../assets/images/twitok-logo.png")} style={styles.logo} resizeMode="contain"/><Text style={styles.wordmark}><Text style={styles.wordGold}>Twi</Text><Text style={styles.wordWhite}>T</Text><Text style={styles.wordGold}>o</Text><Text style={styles.wordWhite}>k</Text></Text><Text style={styles.tagline}>AFRICA'S VIDEO PLATFORM</Text></View>
      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.subtitle}>Watch, create and share African stories with the world.</Text>

      <View style={styles.methodRow}>{(["phone","email","username"] as LoginMethod[]).map(item=><Pressable key={item} onPress={()=>selectMethod(item)} style={[styles.method,method===item&&styles.methodActive]}><Text style={[styles.methodText,method===item&&styles.methodTextActive]}>{item==="phone"?"Phone":item==="email"?"Email":"Username"}</Text></Pressable>)}</View>

      {method==="phone"?<View style={styles.phoneRow}><CountryPicker value={country} onChange={setCountry}/><TextInput value={identifier} onChangeText={setIdentifier} placeholder="Phone number" placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" style={styles.identifierInput}/></View>:<TextInput value={identifier} onChangeText={setIdentifier} placeholder={method==="email"?"Email address":"Username"} placeholderTextColor={Colors.textMuted} autoCapitalize="none" autoCorrect={false} keyboardType={method==="email"?"email-address":"default"} style={styles.input}/>}
      <View style={styles.passwordRow}><TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={Colors.textMuted} secureTextEntry={!showPassword} style={styles.passwordInput}/><Pressable onPress={()=>setShowPassword(v=>!v)}><Text style={styles.show}>{showPassword?"Hide":"Show"}</Text></Pressable></View>
      {error?<Text style={styles.error}>{error}</Text>:null}
      <Pressable style={[styles.button,busy&&styles.disabled]} onPress={login} disabled={busy}>{busy?<ActivityIndicator color="#000"/>:<Text style={styles.buttonText}>Log in</Text>}</Pressable>
      <Text style={styles.forgotText}>Forgot password? Use password recovery from your account settings.</Text>
      <View style={styles.divider}><View style={styles.line}/><Text style={styles.or}>OR</Text><View style={styles.line}/></View>
      <Pressable style={styles.alt}><Text style={styles.altIcon}></Text><Text style={styles.altText}>Continue with Apple</Text></Pressable>
      <Pressable style={styles.alt}><Text style={styles.altIcon}>G</Text><Text style={styles.altText}>Continue with Google</Text></Pressable>
      <Text style={styles.legal}>By continuing, you agree to TwiTok's Terms of Service and Privacy Policy.</Text>
      <View style={styles.signupRow}><Text style={styles.signupPrompt}>Don't have an account?</Text><Pressable onPress={()=>router.replace("/register")}><Text style={styles.signupLink}> Sign up</Text></Pressable></View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:Colors.background},container:{flexGrow:1,paddingHorizontal:24,paddingTop:54,paddingBottom:34,justifyContent:"center"},
 close:{position:"absolute",top:16,left:16,width:42,height:42,alignItems:"center",justifyContent:"center",zIndex:2},closeText:{color:Colors.text,fontSize:34,fontWeight:"300"},
 brand:{alignItems:"center",marginBottom:22},logo:{width:108,height:108,marginBottom:2},wordmark:{fontSize:34,fontWeight:"900",letterSpacing:-1},wordGold:{color:Colors.gold},wordWhite:{color:Colors.text},tagline:{color:Colors.gold,letterSpacing:3,fontSize:9,fontWeight:"800",marginTop:3},
 title:{color:Colors.text,...Typography.title,textAlign:"center"},subtitle:{color:Colors.textSecondary,...Typography.caption,textAlign:"center",marginTop:7,marginBottom:20},
 methodRow:{flexDirection:"row",backgroundColor:Colors.surface,borderWidth:1,borderColor:Colors.border,borderRadius:14,padding:4,marginBottom:12},method:{flex:1,alignItems:"center",paddingVertical:11,borderRadius:10},methodActive:{backgroundColor:Colors.gold},methodText:{color:Colors.textMuted,...Typography.label},methodTextActive:{color:"#080808"},
 phoneRow:{flexDirection:"row",gap:8,marginBottom:10},identifierInput:{flex:1,backgroundColor:Colors.surface,borderWidth:1,borderColor:Colors.border,borderRadius:12,color:Colors.text,paddingHorizontal:14,paddingVertical:14,...Typography.body},input:{backgroundColor:Colors.surface,borderWidth:1,borderColor:Colors.border,borderRadius:12,color:Colors.text,paddingHorizontal:14,paddingVertical:14,marginBottom:10,...Typography.body},
 passwordRow:{flexDirection:"row",alignItems:"center",backgroundColor:Colors.surface,borderWidth:1,borderColor:Colors.border,borderRadius:12,marginBottom:10},passwordInput:{flex:1,color:Colors.text,paddingHorizontal:14,paddingVertical:14,...Typography.body},show:{color:Colors.gold,fontWeight:"800",paddingHorizontal:14},
 error:{color:Colors.danger,...Typography.caption,textAlign:"center",marginBottom:10},button:{backgroundColor:Colors.gold,borderRadius:13,minHeight:52,alignItems:"center",justifyContent:"center"},disabled:{opacity:.6},buttonText:{color:"#080808",...Typography.button},
 forgot:{alignItems:"center",paddingVertical:13},forgotText:{color:Colors.gold,...Typography.captionMedium},divider:{flexDirection:"row",alignItems:"center",gap:10,marginVertical:8},line:{height:1,backgroundColor:Colors.border,flex:1},or:{color:Colors.textMuted,fontSize:11,fontWeight:"800"},
 alt:{height:48,borderRadius:12,borderWidth:1,borderColor:Colors.border,backgroundColor:Colors.surface,alignItems:"center",justifyContent:"center",flexDirection:"row",marginTop:8},altIcon:{color:Colors.text,fontSize:20,fontWeight:"800",width:30},altText:{color:Colors.text,...Typography.bodySemibold},
 legal:{color:Colors.textMuted,...Typography.caption,textAlign:"center",marginTop:16},signupRow:{flexDirection:"row",justifyContent:"center",marginTop:22},signupPrompt:{color:Colors.textSecondary,...Typography.caption},signupLink:{color:Colors.gold,...Typography.captionMedium}
});