import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

type Wallet = { coinBalance?: number; diamondBalance?: number; cashBalanceUsd?: number };
type Gift = { giftName: string; quantity: number; coinsSpent: number; diamondsAwarded: number; createdAt?: string };
type Withdrawal = { withdrawalId: string; amountUsd: number; payoutAmount: number; payoutCurrency: string; type: string; status: string; createdAt?: string };

export default function WalletScreen() {
  const [wallet,setWallet]=useState<Wallet>({});
  const [gifts,setGifts]=useState<Gift[]>([]);
  const [withdrawals,setWithdrawals]=useState<Withdrawal[]>([]);
  const [amount,setAmount]=useState("");
  const [type,setType]=useState<"BANK"|"MOBILE_MONEY">("MOBILE_MONEY");
  const [name,setName]=useState("");
  const [account,setAccount]=useState("");
  const [code,setCode]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);

  async function load(){
    setLoading(true);
    try{
      const token=await getAuthToken();
      if(!token){ Alert.alert("Sign in","Please sign in to view your wallet."); router.back(); return; }
      const h={Authorization:"Bearer "+token};
      const [w,g,wd]=await Promise.all([
        fetch(API+"/wallet/me",{headers:h}),
        fetch(API+"/wallet/me/gifts?limit=20",{headers:h}),
        fetch(API+"/wallet/me/withdrawals?limit=20",{headers:h})
      ]);
      const [wj,gj,wdj]=await Promise.all([w.json(),g.json(),wd.json()]);
      if(!w.ok) throw new Error(wj.error??"Wallet unavailable");
      setWallet(wj); setGifts(gj.gifts??[]); setWithdrawals(wdj.withdrawals??[]);
    }catch(e){ Alert.alert("Wallet",e instanceof Error?e.message:"Unable to load wallet"); }
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);

  async function withdraw(){
    const token=await getAuthToken(); const value=Number(amount);
    if(!token||!Number.isFinite(value)||value<10){Alert.alert("Withdrawal","Minimum cashout is $10.");return;}
    if(!name.trim()||!account.trim()||!code.trim()){Alert.alert("Payout details","Complete all payout fields.");return;}
    setBusy(true);
    try{
      const r=await fetch(API+"/wallet/withdrawals",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({countryCode:"GH",type,amountUsd:value,destination:{name:name.trim(),accountNumber:account.trim(),bankCode:code.trim(),currency:"GHS"}})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error??"Withdrawal failed");
      Alert.alert("Withdrawal submitted","Your payout request is now "+String(d.status??"pending").toLowerCase()+".");
      setAmount(""); void load();
    }catch(e){Alert.alert("Withdrawal",e instanceof Error?e.message:"Withdrawal failed");}
    finally{setBusy(false);}
  }

  if(loading) return <View style={styles.center}><ActivityIndicator color="#fff"/></View>;
  const cash=Number(wallet.cashBalanceUsd??0);
  return <View style={styles.screen}>
    <View style={styles.header}><Pressable onPress={()=>router.back()}><Text style={styles.back}>‹</Text></Pressable><Text style={styles.title}>Wallet & Earnings</Text><Pressable onPress={()=>void load()}><Text style={styles.refresh}>↻</Text></Pressable></View>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}><Text style={styles.heroLabel}>AVAILABLE EARNINGS</Text><Text style={styles.heroCash}>{"$"+cash.toFixed(2)}</Text><Text style={styles.heroHint}>Minimum cashout: $10.00</Text></View>
      <View style={styles.stats}>
        <Stat label="Coins" value={String(Math.floor(wallet.coinBalance??0))}/>
        <Stat label="Diamonds" value={String(Number(wallet.diamondBalance??0).toFixed(2))}/>
      </View>
      <Pressable style={styles.buyCard} onPress={()=>Alert.alert("Coins","Coin purchases in the mobile app will use the App Store / Google Play purchase flow. Your verified purchase is credited by the server.")}>
        <View><Text style={styles.buyTitle}>Buy Coins</Text><Text style={styles.buySub}>Use secure in-app purchases</Text></View><Text style={styles.arrow}>›</Text>
      </Pressable>
      <Section title="Recent gifts">
        {gifts.length?gifts.map((g,i)=><View style={styles.row} key={i}><View><Text style={styles.rowTitle}>{g.giftName} × {g.quantity}</Text><Text style={styles.rowSub}>{g.createdAt?new Date(g.createdAt).toLocaleString():""}</Text></View><Text style={styles.positive}>+{Number(g.diamondsAwarded).toFixed(2)} ♦</Text></View>):<Text style={styles.empty}>No gifts received yet.</Text>}
      </Section>
      <Section title="Cash out">
        <View style={styles.switchRow}><Pressable onPress={()=>setType("MOBILE_MONEY")} style={[styles.switch,type==="MOBILE_MONEY"&&styles.switchActive]}><Text style={styles.switchText}>Mobile Money</Text></Pressable><Pressable onPress={()=>setType("BANK")} style={[styles.switch,type==="BANK"&&styles.switchActive]}><Text style={styles.switchText}>Bank</Text></Pressable></View>
        <Field placeholder="Account name" value={name} onChangeText={setName}/>
        <Field placeholder={type==="MOBILE_MONEY"?"MoMo number":"Bank account number"} value={account} onChangeText={setAccount} keyboardType="phone-pad"/>
        <Field placeholder={type==="MOBILE_MONEY"?"Provider code":"Bank code"} value={code} onChangeText={setCode}/>
        <Field placeholder="Amount in USD (minimum $10)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad"/>
        <Pressable disabled={busy} onPress={()=>void withdraw()} style={styles.withdraw}><Text style={styles.withdrawText}>{busy?"Submitting…":"Withdraw earnings"}</Text></Pressable>
      </Section>
      <Section title="Withdrawal history">
        {withdrawals.length?withdrawals.map(w=><View style={styles.row} key={w.withdrawalId}><View><Text style={styles.rowTitle}>{w.status}</Text><Text style={styles.rowSub}>{w.type} · {w.createdAt?new Date(w.createdAt).toLocaleString():""}</Text></View><Text style={styles.rowTitle}>{"$"+Number(w.amountUsd).toFixed(2)}</Text></View>):<Text style={styles.empty}>No withdrawals yet.</Text>}
      </Section>
    </ScrollView>
  </View>;
}

function Stat({label,value}:{label:string;value:string}){return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>}
function Section({title,children}:{title:string;children:React.ReactNode}){return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>}
function Field(props:React.ComponentProps<typeof TextInput>){return <TextInput {...props} placeholderTextColor="#777" style={styles.input}/>}

const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:"#000"},center:{flex:1,backgroundColor:"#000",alignItems:"center",justifyContent:"center"},
 header:{height:58,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:"#222"},back:{color:"#fff",fontSize:40},title:{color:"#fff",fontSize:18,fontWeight:"900"},refresh:{color:"#fff",fontSize:28},
 content:{padding:16,paddingBottom:40},hero:{backgroundColor:"#171717",borderRadius:20,padding:24,borderWidth:1,borderColor:"#292929",marginBottom:12},heroLabel:{color:"#999",fontSize:11,fontWeight:"900",letterSpacing:1.5},heroCash:{color:"#fff",fontSize:38,fontWeight:"900",marginTop:7},heroHint:{color:"#888",marginTop:5},
 stats:{flexDirection:"row",gap:12,marginBottom:12},stat:{flex:1,backgroundColor:"#151515",borderRadius:16,padding:18},statValue:{color:"#fff",fontSize:24,fontWeight:"900"},statLabel:{color:"#999",marginTop:4},
 buyCard:{backgroundColor:"#ff2d55",borderRadius:15,padding:18,flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:12},buyTitle:{color:"#fff",fontSize:17,fontWeight:"900"},buySub:{color:"#ffe1e8",marginTop:3},arrow:{color:"#fff",fontSize:30},
 section:{backgroundColor:"#111",borderRadius:16,borderWidth:1,borderColor:"#242424",padding:16,marginBottom:12},sectionTitle:{color:"#fff",fontSize:17,fontWeight:"900",marginBottom:12},
 row:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",paddingVertical:11,borderTopWidth:1,borderTopColor:"#222"},rowTitle:{color:"#fff",fontWeight:"800"},rowSub:{color:"#777",fontSize:11,marginTop:3},positive:{color:"#72e06a",fontWeight:"900"},empty:{color:"#777"},
 switchRow:{flexDirection:"row",gap:8,marginBottom:10},switch:{flex:1,padding:11,borderRadius:10,backgroundColor:"#1a1a1a",alignItems:"center"},switchActive:{backgroundColor:"#333",borderWidth:1,borderColor:"#fff"},switchText:{color:"#fff",fontWeight:"800"},input:{backgroundColor:"#181818",borderWidth:1,borderColor:"#333",borderRadius:10,padding:13,color:"#fff",marginBottom:9},withdraw:{backgroundColor:"#fff",borderRadius:10,padding:14,alignItems:"center"},withdrawText:{color:"#000",fontWeight:"900"}
});