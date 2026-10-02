import { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { saveAuthToken } from "../lib/auth";
import { COUNTRIES, CountryOption } from "../lib/countries";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

export default function RegisterScreen() {
  const [username,setUsername]=useState("");
  const [email,setEmail]=useState("");
  const [phone,setPhone]=useState("");
  const [password,setPassword]=useState("");
  const [dateOfBirth,setDateOfBirth]=useState("");
  const [country,setCountry]=useState<CountryOption | null>(null);
  const [countryOpen,setCountryOpen]=useState(false);
  const [countrySearch,setCountrySearch]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const filteredCountries=useMemo(()=>{
    const query=countrySearch.trim().toLowerCase();
    if(!query) return COUNTRIES;
    return COUNTRIES.filter(item=>item.name.toLowerCase().includes(query)||item.code.toLowerCase()===query);
  },[countrySearch]);

  async function register(){
    if(!username.trim()||(!email.trim()&&!phone.trim())||!password||!dateOfBirth||!country){
      setError("Enter a username, email or phone number, password, date of birth, and select your country.");
      return;
    }
    if(!/^[a-z0-9._]{3,24}$/.test(username.trim().toLowerCase())||username.trim().endsWith(".")){
      setError("Username must be 3-24 characters and use only letters, numbers, dots or underscores.");
      return;
    }
    setBusy(true);setError("");
    try{
      const r=await fetch(API+"/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        username:username.trim().toLowerCase(),email:email.trim()||undefined,phone:phone.trim()||undefined,password,dateOfBirth,countryCode:country.code
      })});
      const d=await r.json().catch(()=>({}));
      if(!r.ok||!d.token) throw new Error(d.error??"Unable to create account");
      await saveAuthToken(d.token);
      router.replace("/profile-setup");
    }catch(e){setError(e instanceof Error?e.message:"Unable to create account");}finally{setBusy(false);}
  }

  return <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.logo}>TwiTok</Text>
      <Text style={styles.title}>Join TwiTok</Text>
      <Text style={styles.subtitle}>Africa-born. Open to creators and communities everywhere.</Text>

      <TextInput style={styles.input} value={username} onChangeText={setUsername} placeholder="Username" placeholderTextColor="#777" autoCapitalize="none" maxLength={24}/>
      <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email address (or use phone)" placeholderTextColor="#777" autoCapitalize="none" keyboardType="email-address"/>

      <Pressable style={styles.countryButton} onPress={()=>{setCountryOpen(true);setCountrySearch("");setError("");}}>
        <View style={styles.countryButtonMain}>
          <Text style={styles.countryLabel}>Country</Text>
          <Text style={[styles.countryValue,!country&&styles.countryPlaceholder]}>
            {country ? `🌍 ${country.name}` : "Select your country"}
          </Text>
        </View>
        <Text style={styles.chevron}>⌄</Text>
      </Pressable>

      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder={country ? `Phone number (${country.code})` : "Phone number — select country first"}
        placeholderTextColor="#777"
        keyboardType="phone-pad"
      />
      <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor="#777" secureTextEntry/>
      <TextInput style={styles.input} value={dateOfBirth} onChangeText={setDateOfBirth} placeholder="Date of birth (YYYY-MM-DD)" placeholderTextColor="#777"/>

      {error?<Text style={styles.error}>{error}</Text>:null}
      <Pressable style={styles.button} onPress={register} disabled={busy}>{busy?<ActivityIndicator color="#111"/>:<Text style={styles.buttonText}>Create account</Text>}</Pressable>
      <Pressable onPress={()=>router.replace("/login")}><Text style={styles.back}>Already have an account? Sign in</Text></Pressable>
    </ScrollView>

    <Modal visible={countryOpen} transparent animationType="slide" onRequestClose={()=>setCountryOpen(false)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select your country</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close country selector" onPress={()=>setCountryOpen(false)}><Text style={styles.close}>✕</Text></Pressable>
          </View>
          <TextInput value={countrySearch} onChangeText={setCountrySearch} placeholder="Search country or code" placeholderTextColor="#777" autoCapitalize="none" style={styles.search}/>
          <ScrollView keyboardShouldPersistTaps="handled">
            {filteredCountries.map(item=><Pressable key={item.code} style={styles.countryRow} onPress={()=>{setCountry(item);setCountryOpen(false);}}>
              <Text style={styles.countryName}>{item.name}</Text><Text style={styles.countryCode}>{item.code}</Text>
            </Pressable>)}
            {filteredCountries.length===0?<Text style={styles.noResults}>No country found</Text>:null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
}
const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:"#000"},
 container:{flexGrow:1,backgroundColor:"#000",padding:24,paddingTop:58,paddingBottom:32,justifyContent:"center"},
 logo:{color:"#fff",fontSize:42,fontWeight:"900",textAlign:"center",marginBottom:8},
 title:{color:"#fff",fontSize:27,fontWeight:"900",textAlign:"center",marginBottom:8},
 subtitle:{color:"#aaa",fontSize:14,textAlign:"center",marginBottom:22,lineHeight:20},
 input:{backgroundColor:"#171717",borderWidth:1,borderColor:"#2d2d2d",borderRadius:12,color:"#fff",paddingHorizontal:16,paddingVertical:14,marginBottom:12,fontSize:16},
 countryButton:{backgroundColor:"#171717",borderWidth:1,borderColor:"#2d2d2d",borderRadius:12,paddingHorizontal:16,paddingVertical:12,marginBottom:12,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
 countryButtonMain:{flex:1},countryLabel:{color:"#777",fontSize:11,marginBottom:3},countryValue:{color:"#fff",fontSize:16,fontWeight:"600"},countryPlaceholder:{color:"#999",fontWeight:"500"},chevron:{color:"#F7C842",fontSize:24},
 button:{backgroundColor:"#F7C842",borderRadius:12,padding:15,alignItems:"center",marginTop:8},buttonText:{color:"#111",fontWeight:"900",fontSize:16},
 error:{color:"#ff7188",textAlign:"center",marginBottom:10},back:{color:"#aaa",textAlign:"center",marginTop:20},
 modalBackdrop:{flex:1,backgroundColor:"rgba(0,0,0,.72)",justifyContent:"flex-end"},modal:{height:"82%",backgroundColor:"#101010",borderTopLeftRadius:24,borderTopRightRadius:24,padding:20},
 modalHeader:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:14},modalTitle:{color:"#fff",fontSize:21,fontWeight:"900"},close:{color:"#fff",fontSize:20},
 search:{backgroundColor:"#1A1A1A",borderWidth:1,borderColor:"#303030",borderRadius:12,color:"#fff",paddingHorizontal:14,paddingVertical:13,marginBottom:10,fontSize:16},
 countryRow:{minHeight:50,borderBottomWidth:1,borderBottomColor:"#202020",flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
 countryName:{color:"#fff",fontSize:15},countryCode:{color:"#999",fontSize:13,fontWeight:"700"},noResults:{color:"#888",textAlign:"center",padding:30}
});
