import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { getAuthToken } from "../lib/auth";
import { Colors, Typography } from "../theme/typography";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

export default function VerifyAccountScreen() {
  const params = useLocalSearchParams<{ channel?: string }>();
  const channel = params.channel === "phone" ? "phone" : "email";
  const [code,setCode]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  async function verify() {
    if (!/^\d{6}$/.test(code.trim())) { setError("Enter the 6-digit verification code."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const token=await getAuthToken();
      if(!token) throw new Error("Your session has expired. Please sign in again.");
      const r=await fetch(API+"/auth/verification/verify",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({code:code.trim()})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error??"Verification failed");
      router.replace(d.user?.profileSetupComplete===false?"/profile-setup":"/feed");
    } catch(e){setError(e instanceof Error?e.message:"Verification failed");} finally{setBusy(false);}
  }

  async function resend() {
    setBusy(true); setError(""); setMessage("");
    try {
      const token=await getAuthToken();
      if(!token) throw new Error("Your session has expired. Please sign in again.");
      const r=await fetch(API+"/auth/verification/send",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({channel})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error??"Verification delivery is temporarily unavailable");
      setMessage("A new verification code has been sent.");
    } catch(e){setError(e instanceof Error?e.message:"Verification delivery is temporarily unavailable");} finally{setBusy(false);}
  }

  return <View style={styles.root}>
    <Text style={styles.title}>Verify your account</Text>
    <Text style={styles.subtitle}>Enter the 6-digit code sent to your {channel === "email" ? "email address" : "phone number"}.</Text>
    <TextInput value={code} onChangeText={v=>setCode(v.replace(/\D/g,"").slice(0,6))} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} placeholder="000000" placeholderTextColor={Colors.textMuted} style={styles.code} />
    {error?<Text style={styles.error}>{error}</Text>:null}
    {message?<Text style={styles.message}>{message}</Text>:null}
    <Pressable style={[styles.button,busy&&styles.disabled]} onPress={verify} disabled={busy}>{busy?<ActivityIndicator color="#fff"/>:<Text style={styles.buttonText}>Verify</Text>}</Pressable>
    <Pressable onPress={resend} disabled={busy}><Text style={styles.resend}>Resend code</Text></Pressable>
    <Pressable onPress={()=>router.replace("/login")}><Text style={styles.back}>Back to login</Text></Pressable>
  </View>;
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:Colors.background,padding:24,justifyContent:"center"},
 title:{color:Colors.text,...Typography.title,textAlign:"center"},
 subtitle:{color:Colors.textSecondary,...Typography.body,textAlign:"center",marginTop:10,marginBottom:24},
 code:{backgroundColor:Colors.surface,borderWidth:1,borderColor:Colors.border,borderRadius:12,color:Colors.text,fontSize:28,fontWeight:"800",letterSpacing:8,textAlign:"center",padding:16},
 button:{backgroundColor:Colors.accent,borderRadius:10,minHeight:50,alignItems:"center",justifyContent:"center",marginTop:16},
 disabled:{opacity:.65},
 buttonText:{color:Colors.text,...Typography.button},
 resend:{color:Colors.text,...Typography.label,textAlign:"center",marginTop:22},
 back:{color:Colors.textSecondary,...Typography.caption,textAlign:"center",marginTop:22},
 error:{color:Colors.danger,...Typography.caption,textAlign:"center",marginTop:12},
 message:{color:"#6ee7b7",...Typography.caption,textAlign:"center",marginTop:12}
});