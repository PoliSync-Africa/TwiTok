import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { router } from "expo-router";
import { saveAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

export default function RegisterScreen() {
  const [email,setEmail]=useState("");
  const [phone,setPhone]=useState("");
  const [password,setPassword]=useState("");
  const [dateOfBirth,setDateOfBirth]=useState("");
  const [countryCode,setCountryCode]=useState("GH");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  async function register(){
    if((!email.trim()&&!phone.trim())||!password||!dateOfBirth||!countryCode.trim()){setError("Enter an email address or phone number, plus all required fields.");return;}\n    if(password.length<8){setError("Password must contain at least 8 characters.");return;}
    setBusy(true);setError("");
    try{
      const r=await fetch(API+"/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:email.trim()||undefined,phone:phone.trim()||undefined,password,dateOfBirth,countryCode:countryCode.trim().toUpperCase()})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok||!d.token) throw new Error(d.error??"Unable to create account");
      await saveAuthToken(d.token);
      router.replace("/profile-setup");
    }catch(e){setError(e instanceof Error?e.message:"Unable to create account");}finally{setBusy(false);}
  }

  return <ScrollView contentContainerStyle={styles.container}>
    <Text style={styles.logo}>TwiTok</Text>
    <Text style={styles.title}>Create your account</Text>
    <Text style={styles.subtitle}>Sign up with your email or phone number.</Text>
    <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email address (or use phone)" placeholderTextColor="#777" autoCapitalize="none" keyboardType="email-address"/>
    <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone number (or use email)" placeholderTextColor="#777" keyboardType="phone-pad"/>
    <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Password (8+ characters)" placeholderTextColor="#777" secureTextEntry/>
    <TextInput style={styles.input} value={dateOfBirth} onChangeText={setDateOfBirth} placeholder="Date of birth (YYYY-MM-DD)" placeholderTextColor="#777"/>
    <TextInput style={styles.input} value={countryCode} onChangeText={setCountryCode} placeholder="Country code" placeholderTextColor="#777" autoCapitalize="characters" maxLength={2}/>
    {error?<Text style={styles.error}>{error}</Text>:null}
    <Pressable style={styles.button} onPress={register} disabled={busy}>{busy?<ActivityIndicator color="#fff"/>:<Text style={styles.buttonText}>Create account</Text>}</Pressable>
    <Pressable onPress={()=>router.replace("/login")}><Text style={styles.back}>Already have an account? Sign in</Text></Pressable>
  </ScrollView>;
}
const styles=StyleSheet.create({
 container:{flexGrow:1,backgroundColor:"#000",padding:24,justifyContent:"center"},
 logo:{color:"#fff",fontSize:42,fontWeight:"900",textAlign:"center",marginBottom:18},
 title:{color:"#fff",fontSize:25,fontWeight:"800",textAlign:"center",marginBottom:10},
 subtitle:{color:"#aaa",fontSize:14,textAlign:"center",marginBottom:20},
 input:{backgroundColor:"#171717",borderWidth:1,borderColor:"#2d2d2d",borderRadius:12,color:"#fff",paddingHorizontal:16,paddingVertical:14,marginBottom:12,fontSize:16},
 button:{backgroundColor:"#ff2d55",borderRadius:12,padding:15,alignItems:"center",marginTop:8},
 buttonText:{color:"#fff",fontWeight:"800",fontSize:16},
 error:{color:"#ff7188",textAlign:"center",marginBottom:10},
 back:{color:"#aaa",textAlign:"center",marginTop:20}
});