import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Colors, Typography } from "../theme/typography";
import { getAuthToken } from "../lib/auth";
import { configureRevenueCat, getCoinPackages, purchaseCoinPackage } from "../lib/revenuecat";
import type { PurchasesPackage } from "react-native-purchases";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

type Wallet = { coinBalance?: number; diamondBalance?: number; cashBalanceUsd?: number };
type Gift = { giftName: string; quantity: number; coinsSpent: number; diamondsAwarded: number; createdAt?: string };
type Withdrawal = { withdrawalId: string; amountUsd: number; payoutAmount: number; payoutCurrency: string; type: string; status: string; createdAt?: string };
type CoinPackage = { sku: string; coins: number; priceUsd: number };
const GIFT_CATALOG=[["🌹","Rose","1"],["💖","Heart","5"],["👏","Clap","10"],["🧵","Kente","50"],["🥁","Golden Drum","100"],["👑","Royal Crown","500"],["🦁","Golden Lion","1,000"],["💎","Diamond Kingdom","5,000"],["🧢","TwiTok Cap","100,000"],["💸","Money Gun","500,000"],["💍","Wedding Rings","1,000,000"],["👼","Flying Angel","2,000,000"],["🛥️","Luxury Yacht","5,000,000"],["✈️","Private Jet","10,000,000"],["🏡","Luxury Mansion","20,000,000"],["🏎️","Super Car","30,000,000"]];

export default function WalletScreen() {
  const [wallet,setWallet]=useState<Wallet>({});
  const [gifts,setGifts]=useState<Gift[]>([]);
  const [withdrawals,setWithdrawals]=useState<Withdrawal[]>([]);
  const [amount,setAmount]=useState("");
  const [type,setType]=useState<"BANK"|"MOBILE_MONEY">("MOBILE_MONEY");
  const [name,setName]=useState("");
  const [account,setAccount]=useState("");
  const [code,setCode]=useState("");
  const [branchCode,setBranchCode]=useState("");
  const [providers,setProviders]=useState<{name:string;code:string;active?:boolean}[]>([]);
  const [payoutProvider,setPayoutProvider]=useState<"PAYSTACK"|"FLUTTERWAVE"|"">("");
  const [availablePayoutProviders,setAvailablePayoutProviders]=useState<("PAYSTACK"|"FLUTTERWAVE")[]>([]);
  const [countryCode,setCountryCode]=useState("");
  const [payoutCurrency,setPayoutCurrency]=useState("");
  const [providersLoading,setProvidersLoading]=useState(false);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [coinPackages,setCoinPackages]=useState<CoinPackage[]>([]);
  const [purchasing,setPurchasing]=useState(false);
  const [rcPackages,setRcPackages]=useState<PurchasesPackage[]>([]);
  const [showCoinPicker,setShowCoinPicker]=useState(false);
  const [monetizationEnabled,setMonetizationEnabled]=useState(false);
  const [monetizationBusy,setMonetizationBusy]=useState(false);

  async function load(){
    setLoading(true);
    try{
      const token=await getAuthToken();
      if(!token){ Alert.alert("Sign in","Please sign in to view your wallet."); router.back(); return; }
      const h={Authorization:"Bearer "+token};
      const rc=await fetch(API+"/wallet/revenuecat/config",{headers:h});
      const rcJson=await rc.json().catch(()=>({}));
      if(rc.ok && rcJson.appUserId) configureRevenueCat(String(rcJson.appUserId));
      const [w,g,wd,m]=await Promise.all([
        fetch(API+"/wallet/me",{headers:h}),
        fetch(API+"/wallet/me/gifts?limit=20",{headers:h}),
        fetch(API+"/wallet/me/withdrawals?limit=20",{headers:h}),
        fetch(API+"/wallet/monetization",{headers:h})
      ]);
      const [wj,gj,wdj,mj]=await Promise.all([w.json(),g.json(),wd.json(),m.json()]);
      if(!w.ok) throw new Error(wj.error??"Wallet unavailable");
      setWallet(wj); setGifts(gj.gifts??[]); setWithdrawals(wdj.withdrawals??[]); setMonetizationEnabled(mj.monetizationEnabled===true);
      const catalog=await fetch(API+"/wallet/catalog",{headers:h});
      const catalogJson=await catalog.json().catch(()=>({}));
      setCoinPackages(catalogJson.coinPackages??[]);
    }catch(e){ Alert.alert("Wallet",e instanceof Error?e.message:"Unable to load wallet"); }
    finally{setLoading(false);}
  }
  async function loadProviders(nextType:"BANK"|"MOBILE_MONEY"){
    const token=await getAuthToken(); if(!token)return;
    setProvidersLoading(true);
    try{
      const opts=await fetch(API+"/payments/options",{headers:{Authorization:"Bearer "+token}});
      const options=await opts.json().catch(()=>({}));
      const cc=String(options.countryCode??"").toUpperCase();
      setCountryCode(cc); setPayoutCurrency(String(options.providers?.[0]?.currency??""));
      const payoutProviders=(options.payoutProviders??[]) as ("PAYSTACK"|"FLUTTERWAVE")[];
      setAvailablePayoutProviders(payoutProviders);
      const preferred=(payoutProvider && payoutProviders.includes(payoutProvider)) ? payoutProvider : (payoutProviders[0] as "PAYSTACK"|"FLUTTERWAVE"|undefined);
      if(preferred) setPayoutProvider(preferred);
      let list:any[]=[];
      if(preferred==="FLUTTERWAVE"){
        const r=await fetch(API+"/wallet/payout/flutterwave/options?type="+nextType,{headers:{Authorization:"Bearer "+token}});
        const d=await r.json().catch(()=>({})); list=d.providers??[];
      }else if(preferred==="PAYSTACK" && cc==="GH"){
        const q=nextType==="MOBILE_MONEY"?"mobile_money":"bank";
        const r=await fetch(API+"/wallet/payout/ghana/options?type="+q,{headers:{Authorization:"Bearer "+token}});
        const d=await r.json().catch(()=>({})); list=d.providers??[];
      }
      list=list.filter((p:any)=>p.active!==false);
      setProviders(list);
      if(list.length&&!list.some((p:any)=>p.code===code))setCode(String(list[0].code??""));
    } finally{setProvidersLoading(false);}
  }
  useEffect(()=>{void load();},[]);
  useEffect(()=>{void loadProviders(type);},[type]);

  async function buyCoins(){
    try{
      const packages=await getCoinPackages();
      const matched=packages.filter(pkg=>coinPackages.some(p=>p.sku===pkg.product.identifier));
      if(!matched.length){
        Alert.alert("Coin purchases","RevenueCat has no configured TwiTok Coin products for this build yet. Configure the five approved SKUs in RevenueCat/App Store/Google Play first.");
        return;
      }
      setRcPackages(matched);
      setShowCoinPicker(true);
    }catch(e){
      Alert.alert("Coin purchases",e instanceof Error?e.message:"Unable to load Coin packages");
    }
  }

  async function purchaseSelectedCoinPackage(pkg: PurchasesPackage){
    setPurchasing(true);
    try{
      await purchaseCoinPackage(pkg);
      setShowCoinPicker(false);
      Alert.alert("Purchase complete","Your verified Coins will appear in your TwiTok wallet.");
      await load();
    }catch(e){
      Alert.alert("Purchase",e instanceof Error?e.message:"Purchase was cancelled or failed");
    }finally{
      setPurchasing(false);
    }
  }

  async function withdraw(){
    const token=await getAuthToken(); const value=Number(amount);
    if(!token||!Number.isFinite(value)||value<10){Alert.alert("Withdrawal","Minimum cashout is $10.");return;}
    if(!name.trim()||!account.trim()||!code.trim()||(type==="BANK"&&payoutProvider==="FLUTTERWAVE"&&countryCode==="GH"&&!branchCode.trim())){Alert.alert("Payout details","Choose your provider and complete all payout fields.");return;}
    setBusy(true);
    try{
      const r=await fetch(API+"/wallet/withdrawals",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token,"Idempotency-Key":String(Date.now())+"-"+Math.random().toString(36).slice(2)},body:JSON.stringify({countryCode,type,amountUsd:value,provider:payoutProvider,destination:{name:name.trim(),accountNumber:account.trim(),bankCode:code.trim(),providerCode:code.trim(),branchCode:branchCode.trim()||undefined,currency:payoutCurrency}})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error??"Withdrawal failed");
      Alert.alert("Withdrawal submitted","Your payout request is now "+String(d.status??"pending").toLowerCase()+".");
      setAmount(""); void load();
    }catch(e){Alert.alert("Withdrawal",e instanceof Error?e.message:"Withdrawal failed");}
    finally{setBusy(false);}
  }

  async function toggleMonetization(){
    const token=await getAuthToken(); if(!token||monetizationBusy)return;
    if(!monetizationEnabled){
      Alert.alert("Turn on Monetization","This lets eligible viewers send Gifts to you and enables eligible creator earnings. You can turn it off later.",[
        {text:"Cancel",style:"cancel"},
        {text:"Turn On",onPress:async()=>{
          setMonetizationBusy(true);
          try{const r=await fetch(API+"/wallet/monetization",{method:"PATCH",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({enabled:true,termsVersion:"2026-09-30"})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error??"Unable to turn Monetization on");setMonetizationEnabled(true);Alert.alert("Monetization on","Your account can now receive eligible creator Gifts.");}catch(e){Alert.alert("Monetization",e instanceof Error?e.message:"Unable to update Monetization");}finally{setMonetizationBusy(false)}}}
      ]);
    }else{
      Alert.alert("Turn off Monetization","New creator Gifts and creator earnings will stop. Existing wallet funds will remain.",[
        {text:"Cancel",style:"cancel"},
        {text:"Turn Off",style:"destructive",onPress:async()=>{
          setMonetizationBusy(true);
          try{const r=await fetch(API+"/wallet/monetization",{method:"PATCH",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({enabled:false})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error??"Unable to turn Monetization off");setMonetizationEnabled(false);Alert.alert("Monetization off","New creator Gifts are now disabled.");}catch(e){Alert.alert("Monetization",e instanceof Error?e.message:"Unable to update Monetization");}finally{setMonetizationBusy(false)}}}
      ]);
    }
  }

  if(loading) return <View style={styles.center}><ActivityIndicator color="#fff"/></View>;

  const coinPicker = <Modal visible={showCoinPicker} transparent animationType="slide" onRequestClose={()=>!purchasing&&setShowCoinPicker(false)}>
    <View style={styles.modalBackdrop}>
      <View style={styles.coinSheet}>
        <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Buy TwiTok Coins</Text><Pressable disabled={purchasing} onPress={()=>setShowCoinPicker(false)}><Text style={styles.close}>×</Text></Pressable></View>
        <Text style={styles.sheetHint}>Choose a Coin package. Payment is processed by the App Store or Google Play.</Text>
        {rcPackages.map(pkg=>{
          const match=coinPackages.find(p=>p.sku===pkg.product.identifier);
          if(!match) return null;
          return <Pressable key={pkg.identifier} disabled={purchasing} style={styles.coinOption} onPress={()=>void purchaseSelectedCoinPackage(pkg)}>
            <View><Text style={styles.coinAmount}>{match.coins.toLocaleString()} Coins</Text><Text style={styles.coinSku}>{match.sku}</Text></View>
            <Text style={styles.coinPrice}>{pkg.product.priceString || "$"+match.priceUsd.toFixed(2)}</Text>
          </Pressable>;
        })}
        {purchasing&&<View style={styles.processing}><ActivityIndicator color="#fff"/><Text style={styles.processingText}>Processing purchase…</Text></View>}
      </View>
    </View>
  </Modal>;


  const cash=Number(wallet.cashBalanceUsd??0);
  return <View style={styles.screen}>\n    {coinPicker}
    <View style={styles.header}><Pressable onPress={()=>router.back()}><Text style={styles.back}>‹</Text></Pressable><Text style={styles.title}>Wallet & Earnings</Text><Pressable onPress={()=>void load()}><Text style={styles.refresh}>↻</Text></Pressable></View>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}><Text style={styles.heroLabel}>AVAILABLE EARNINGS</Text><Text style={styles.heroCash}>{"$"+cash.toFixed(2)}</Text><Text style={styles.heroHint}>Minimum cashout: $10.00</Text></View>\n      <View style={styles.section}><View style={styles.monetizationHeader}><View style={{flex:1}}><Text style={styles.sectionTitle}>Creator Monetization</Text><Text style={styles.rowSub}>{monetizationEnabled?"On — eligible viewers can send Gifts to you.":"Off — your account is not receiving creator Gifts."}</Text></View><Pressable disabled={monetizationBusy} onPress={()=>void toggleMonetization()} style={[styles.monetizationButton,monetizationEnabled&&styles.monetizationButtonOff]}><Text style={styles.monetizationButtonText}>{monetizationBusy?"…":monetizationEnabled?"Turn Off":"Turn On"}</Text></Pressable></View></View>
      <View style={styles.stats}>
        <Stat label="Coins" value={String(Math.floor(wallet.coinBalance??0))}/>
        <Stat label="Diamonds" value={String(Number(wallet.diamondBalance??0).toFixed(2))}/>
      </View>
      <Pressable style={styles.buyCard} disabled={purchasing} onPress={()=>void buyCoins()}>
        <View><Text style={styles.buyTitle}>{purchasing?"Processing…":"Buy Coins"}</Text><Text style={styles.buySub}>Apple App Store / Google Play</Text></View><Text style={styles.arrow}>›</Text>
      </Pressable>
      <View style={styles.giftHeader}><View><Text style={styles.giftTitle}>🎁 TwiTok Gifts</Text><Text style={styles.giftSub}>Support creators • Stand out • Celebrate</Text></View><Pressable style={styles.coinPill} onPress={()=>void buyCoins()}><Text style={styles.coinPillText}>🪙 {Math.floor(wallet.coinBalance??0).toLocaleString()} +</Text></Pressable></View>
      <Text style={styles.giftCategory}>Popular Gifts</Text>
      <View style={styles.giftGrid}>{GIFT_CATALOG.map(([icon,name,price])=><Pressable key={name} style={styles.giftCard} onPress={()=>void buyCoins()}><Text style={styles.giftIcon}>{icon}</Text><Text style={styles.giftName}>{name}</Text><Text style={styles.giftPrice}>🪙 {price}</Text></Pressable>)}</View>
      <Section title="Recent gifts">
        {gifts.length?gifts.map((g,i)=><View style={styles.row} key={i}><View><Text style={styles.rowTitle}>{g.giftName} × {g.quantity}</Text><Text style={styles.rowSub}>{g.createdAt?new Date(g.createdAt).toLocaleString():""}</Text></View><Text style={styles.positive}>+{Number(g.diamondsAwarded).toFixed(2)} ♦</Text></View>):<Text style={styles.empty}>No gifts received yet.</Text>}
      </Section>
      <Section title="Cash out">
        <View style={styles.switchRow}><Pressable onPress={()=>setType("MOBILE_MONEY")} style={[styles.switch,type==="MOBILE_MONEY"&&styles.switchActive]}><Text style={styles.switchText}>Mobile Money</Text></Pressable><Pressable onPress={()=>setType("BANK")} style={[styles.switch,type==="BANK"&&styles.switchActive]}><Text style={styles.switchText}>Bank</Text></Pressable></View>
        <Field placeholder="Account name" value={name} onChangeText={setName}/>
        <Field placeholder={type==="MOBILE_MONEY"?"MoMo number":"Bank account number"} value={account} onChangeText={setAccount} keyboardType="phone-pad"/>
        <Text style={styles.providerLabel}>Country: {countryCode || "—"} · Currency: {payoutCurrency || "—"}</Text><Text style={styles.providerLabel}>Payout provider</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.providerRow}>{availablePayoutProviders.map(p=><Pressable key={p} onPress={()=>{setPayoutProvider(p);setCode("");void loadProviders(type)}} style={[styles.provider, payoutProvider===p&&styles.providerActive]}><Text style={styles.providerText}>{p}</Text></Pressable>)}</ScrollView><Text style={styles.providerLabel}>{type==="MOBILE_MONEY"?"Mobile Money provider":"Bank"}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.providerRow}>{providersLoading?<ActivityIndicator color="#fff"/>:providers.map(p=><Pressable key={p.code} onPress={()=>setCode(p.code)} style={[styles.provider,code===p.code&&styles.providerActive]}><Text style={styles.providerText}>{p.name}</Text></Pressable>)}</ScrollView><Field placeholder={type==="MOBILE_MONEY"?"Provider code":"Bank code"} value={code} editable={false} onChangeText={setCode}/>{type==="BANK"&&payoutProvider==="FLUTTERWAVE"&&countryCode==="GH"&&<Field placeholder="Bank branch code" value={branchCode} onChangeText={setBranchCode}/>}
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
 giftHeader:{marginHorizontal:16,marginTop:8,marginBottom:10,padding:15,borderRadius:16,borderWidth:1,borderColor:Colors.border,backgroundColor:"#0d0d0d",flexDirection:"row",alignItems:"center",justifyContent:"space-between"},giftTitle:{color:Colors.text,...Typography.section},giftSub:{color:Colors.textSecondary,...Typography.caption,marginTop:3},coinPill:{backgroundColor:"#211907",borderWidth:1,borderColor:Colors.gold,borderRadius:18,paddingHorizontal:12,paddingVertical:8},coinPillText:{color:Colors.gold,...Typography.captionMedium},giftCategory:{color:Colors.gold,...Typography.section,marginHorizontal:16,marginTop:6,marginBottom:8},giftGrid:{flexDirection:"row",flexWrap:"wrap",paddingHorizontal:12,gap:8},giftCard:{width:"23.5%",minHeight:108,borderRadius:12,borderWidth:1,borderColor:Colors.border,backgroundColor:Colors.surface,alignItems:"center",justifyContent:"center",padding:7},giftIcon:{fontSize:34},giftName:{color:Colors.text,...Typography.captionMedium,textAlign:"center",marginTop:5},giftPrice:{color:Colors.gold,fontSize:11,fontWeight:"800",marginTop:4},
 screen:{flex:1,backgroundColor:"#000"},center:{flex:1,backgroundColor:"#000",alignItems:"center",justifyContent:"center"},
 header:{height:58,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:"#222"},back:{color:"#fff",fontSize:40},title:{color:"#fff",fontSize:18,fontWeight:"900"},refresh:{color:"#fff",fontSize:28},
 content:{padding:16,paddingBottom:40},hero:{backgroundColor:"#171717",borderRadius:20,padding:24,borderWidth:1,borderColor:"#292929",marginBottom:12},heroLabel:{color:"#999",fontSize:11,fontWeight:"900",letterSpacing:1.5},heroCash:{color:"#fff",fontSize:38,fontWeight:"900",marginTop:7},heroHint:{color:"#888",marginTop:5},
 stats:{flexDirection:"row",gap:12,marginBottom:12},stat:{flex:1,backgroundColor:"#151515",borderRadius:16,padding:18},statValue:{color:"#fff",fontSize:24,fontWeight:"900"},statLabel:{color:"#999",marginTop:4},
 buyCard:{backgroundColor:"#ff2d55",borderRadius:15,padding:18,flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:12},buyTitle:{color:"#fff",fontSize:17,fontWeight:"900"},buySub:{color:"#ffe1e8",marginTop:3},arrow:{color:"#fff",fontSize:30},
 section:{backgroundColor:"#111",borderRadius:16,borderWidth:1,borderColor:"#242424",padding:16,marginBottom:12},sectionTitle:{color:"#fff",fontSize:17,fontWeight:"900",marginBottom:12},
 row:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",paddingVertical:11,borderTopWidth:1,borderTopColor:"#222"},rowTitle:{color:"#fff",fontWeight:"800"},rowSub:{color:"#777",fontSize:11,marginTop:3},positive:{color:"#72e06a",fontWeight:"900"},empty:{color:"#777"},
 monetizationHeader:{flexDirection:"row",alignItems:"center",gap:12},monetizationButton:{backgroundColor:"#fff",borderRadius:10,paddingHorizontal:14,paddingVertical:10},monetizationButtonOff:{backgroundColor:"#222",borderWidth:1,borderColor:"#555"},monetizationButtonText:{color:"#000",fontWeight:"900"},switchRow:{flexDirection:"row",gap:8,marginBottom:10},switch:{flex:1,padding:11,borderRadius:10,backgroundColor:"#1a1a1a",alignItems:"center"},switchActive:{backgroundColor:"#333",borderWidth:1,borderColor:"#fff"},switchText:{color:"#fff",fontWeight:"800"},providerLabel:{color:"#999",fontSize:11,fontWeight:"800",marginBottom:6},providerRow:{gap:8,paddingBottom:9},provider:{backgroundColor:"#1a1a1a",borderRadius:10,paddingHorizontal:12,paddingVertical:9,borderWidth:1,borderColor:"#333"},providerActive:{borderColor:"#fff",backgroundColor:"#333"},providerText:{color:"#fff",fontSize:11,fontWeight:"800"},input:{backgroundColor:"#181818",borderWidth:1,borderColor:"#333",borderRadius:10,padding:13,color:"#fff",marginBottom:9},withdraw:{backgroundColor:"#fff",borderRadius:10,padding:14,alignItems:"center"},withdrawText:{color:"#000",fontWeight:"900"},
 modalBackdrop:{flex:1,backgroundColor:"rgba(0,0,0,0.72)",justifyContent:"flex-end"},coinSheet:{backgroundColor:"#111",borderTopLeftRadius:24,borderTopRightRadius:24,padding:18,paddingBottom:32,borderWidth:1,borderColor:"#292929"},sheetHeader:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},sheetTitle:{color:"#fff",fontSize:21,fontWeight:"900"},close:{color:"#fff",fontSize:32,lineHeight:32},sheetHint:{color:"#888",fontSize:12,lineHeight:18,marginTop:4,marginBottom:12},coinOption:{backgroundColor:"#1a1a1a",borderRadius:14,borderWidth:1,borderColor:"#292929",padding:15,marginTop:8,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},coinAmount:{color:"#fff",fontSize:17,fontWeight:"900"},coinSku:{color:"#777",fontSize:10,marginTop:3},coinPrice:{color:"#fff",fontSize:17,fontWeight:"900"},processing:{flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8,paddingTop:14},processingText:{color:"#aaa"}
});