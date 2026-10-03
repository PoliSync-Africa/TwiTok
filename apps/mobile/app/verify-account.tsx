import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { getAuthToken } from "../lib/auth";
import { Colors, Typography } from "../theme/typography";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
type Channel = "email" | "phone";
type Account = { email?: string | null; phone?: string | null; emailVerified?: boolean; phoneVerified?: boolean; profileSetupComplete?: boolean };

function maskEmail(value: string) {
  return value.replace(/^(.{2}).*(@.*)$/, "$1***$2");
}

function maskPhone(value: string) {
  return value.replace(/\d(?=\d{4})/g, "*");
}

export default function VerifyAccountScreen() {
  const [account,setAccount]=useState<Account|null>(null);
  const [channel,setChannel]=useState<Channel|null>(null);
  const [code,setCode]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  async function loadAccount() {
    const token=await getAuthToken();
    if(!token) throw new Error("Your session has expired. Please sign in again.");
    const r=await fetch(API+"/auth/verification/status",{headers:{Authorization:"Bearer "+token}});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.user) throw new Error(d.error??"Unable to load your account");
    setAccount(d.user);
    return d.user as Account;
  }

  useEffect(()=>{ loadAccount().catch(e=>setError(e instanceof Error?e.message:"Unable to load your account")); },[]);

  const remaining = useMemo(()=>Boolean(account && (account.emailVerified !== true || account.phoneVerified !== true)),[account]);

  async function send(channelToSend: Channel) {
    if(!account) return;
    if(channelToSend==="email" && account.emailVerified===true) return;
    if(channelToSend==="phone" && account.phoneVerified===true) return;
    setBusy(true); setError(""); setMessage(""); setChannel(channelToSend);
    try {
      const token=await getAuthToken();
      if(!token) throw new Error("Your session has expired. Please sign in again.");
      const r=await fetch(API+"/auth/verification/send",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({channel:channelToSend})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error??"Verification delivery is temporarily unavailable");
      setMessage(`Code sent to your registered ${channelToSend==="email"?"email address":"phone number"}.`);
      setCode("");
    } catch(e){setError(e instanceof Error?e.message:"Verification delivery is temporarily unavailable");}
    finally{setBusy(false);}
  }

  async function verify() {
    if(!channel){setError("Choose where you want to receive your OTP first.");return;}
    if(!/^\d{6}$/.test(code.trim())){setError("Enter the 6-digit verification code.");return;}
    setBusy(true); setError(""); setMessage("");
    try {
      const token=await getAuthToken();
      if(!token) throw new Error("Your session has expired. Please sign in again.");
      const r=await fetch(API+"/auth/verification/verify",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({code:code.trim()})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error??"Verification failed");
      if(d.verificationRequired){
        setAccount(d.user);
        setChannel(null);
        setCode("");
        setMessage(channel==="email"?"Email verified. Now verify your phone number.":"Phone verified. Now verify your email address.");
      } else {
        router.replace(d.user?.profileSetupComplete===false?"/profile-setup":"/feed");
      }
    } catch(e){setError(e instanceof Error?e.message:"Verification failed");}
    finally{setBusy(false);}
  }

  if(!account) {
    return <View style={styles.root}><ActivityIndicator color={Colors.text}/><Text style={styles.loading}>Loading verification options…</Text></View>;
  }

  const emailAvailable=Boolean(account.email)&&account.emailVerified!==true;
  const phoneAvailable=Boolean(account.phone)&&account.phoneVerified!==true;

  return <View style={styles.root}>
    <Text style={styles.title}>Verify your account</Text>
    <Text style={styles.subtitle}>Your TwiTok account requires both your registered email and phone number to be verified. Choose where you want to receive your next OTP.</Text>

    <View style={styles.optionGroup}>
      <Text style={styles.section}>Send OTP to</Text>
      <Pressable disabled={!emailAvailable||busy} onPress={()=>send("email")} style={[styles.option,channel==="email"&&styles.optionActive,(!emailAvailable||busy)&&styles.optionDisabled]}>
        <View style={styles.optionText}><Text style={styles.optionTitle}>Email</Text><Text style={styles.optionValue}>{account.email?maskEmail(account.email):"Not registered"}{account.emailVerified?" • Verified":""}</Text></View>
        <Text style={styles.optionAction}>{account.emailVerified?"✓":"Send code"}</Text>
      </Pressable>
      <Pressable disabled={!phoneAvailable||busy} onPress={()=>send("phone")} style={[styles.option,channel==="phone"&&styles.optionActive,(!phoneAvailable||busy)&&styles.optionDisabled]}>
        <View style={styles.optionText}><Text style={styles.optionTitle}>Phone</Text><Text style={styles.optionValue}>{account.phone?maskPhone(account.phone):"Not registered"}{account.phoneVerified?" • Verified":""}</Text></View>
        <Text style={styles.optionAction}>{account.phoneVerified?"✓":"Send code"}</Text>
      </Pressable>
    </View>

    {channel?<Text style={styles.destination}>Enter the code sent to your registered {channel==="email"?"email address":"phone number"}.</Text>:null}
    {channel?<TextInput value={code} onChangeText={v=>setCode(v.replace(/\D/g,"").slice(0,6))} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} placeholder="000000" placeholderTextColor={Colors.textMuted} style={styles.code}/>:null}
    {error?<Text style={styles.error}>{error}</Text>:null}
    {message?<Text style={styles.message}>{message}</Text>:null}
    {channel?<Pressable style={[styles.button,busy&&styles.disabled]} onPress={verify} disabled={busy}>{busy?<ActivityIndicator color="#fff"/>:<Text style={styles.buttonText}>Verify {channel==="email"?"email":"phone"}</Text>}</Pressable>:null}
    {channel?<Pressable onPress={()=>send(channel)} disabled={busy}><Text style={styles.resend}>Resend to this {channel==="email"?"email":"phone"}</Text></Pressable>:null}
    {remaining?<Text style={styles.required}>Both contact methods must be verified before you can enter TwiTok.</Text>:null}
    <Pressable onPress={()=>router.replace("/login")}><Text style={styles.back}>Back to login</Text></Pressable>
  </View>;
}

const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:Colors.background,padding:24,justifyContent:"center"},
 title:{color:Colors.text,...Typography.title,textAlign:"center"},
 subtitle:{color:Colors.textSecondary,...Typography.body,textAlign:"center",marginTop:10,marginBottom:22},
 loading:{color:Colors.textSecondary,...Typography.caption,textAlign:"center",marginTop:12},
 optionGroup:{marginBottom:14},
 section:{color:Colors.text,...Typography.label,marginBottom:8},
 option:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",backgroundColor:Colors.surface,borderWidth:1,borderColor:Colors.border,borderRadius:12,padding:15,marginBottom:10},
 optionActive:{borderColor:Colors.text},
 optionDisabled:{opacity:.5},
 optionText:{flex:1},
 optionTitle:{color:Colors.text,...Typography.bodySemibold},
 optionValue:{color:Colors.textSecondary,...Typography.caption,marginTop:3},
 optionAction:{color:Colors.text,...Typography.label,marginLeft:12},
 destination:{color:Colors.textSecondary,...Typography.caption,marginBottom:10},
 code:{backgroundColor:Colors.surface,borderWidth:1,borderColor:Colors.border,borderRadius:12,color:Colors.text,fontSize:28,fontWeight:"800",letterSpacing:8,textAlign:"center",padding:16},
 button:{backgroundColor:Colors.accent,borderRadius:10,minHeight:50,alignItems:"center",justifyContent:"center",marginTop:16},
 disabled:{opacity:.65},
 buttonText:{color:Colors.text,...Typography.button},
 resend:{color:Colors.text,...Typography.label,textAlign:"center",marginTop:20},
 required:{color:Colors.textMuted,...Typography.caption,textAlign:"center",marginTop:18},
 back:{color:Colors.textSecondary,...Typography.caption,textAlign:"center",marginTop:22},
 error:{color:Colors.danger,...Typography.caption,textAlign:"center",marginTop:12},
 message:{color:"#6ee7b7",...Typography.caption,textAlign:"center",marginTop:12}
});