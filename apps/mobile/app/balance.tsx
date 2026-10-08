import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

type Wallet = { coinBalance?: number; cashBalanceUsd?: number; diamondBalance?: number };
type Gift = { giftName?: string; coinsSpent?: number; diamondsAwarded?: number; createdAt?: string };

export default function BalanceScreen() {
  const [wallet, setWallet] = useState<Wallet>({});
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [loading, setLoading] = useState(true);
  const [welcome, setWelcome] = useState(false);
  const [currency, setCurrency] = useState("USD");

  async function load() {
    const token = await getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const [w, g] = await Promise.all([
        fetch(API + "/wallet/me", { headers: { Authorization: "Bearer " + token } }),
        fetch(API + "/wallet/me/gifts?limit=20", { headers: { Authorization: "Bearer " + token } }),
      ]);
      const wj = await w.json().catch(() => ({}));
      const gj = await g.json().catch(() => ({}));
      setWallet(wj);
      setGifts(Array.isArray(gj.gifts) ? gj.gifts : []);
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => {
    void load();
    (async () => {
      const c = await SecureStore.getItemAsync("twitok.balance.currency");
      if (c) setCurrency(c);
      const seen = await SecureStore.getItemAsync("twitok.balance.welcome");
      if (!seen) setWelcome(true);
    })();
  }, []);

  async function dismissWelcome() {
    setWelcome(false);
    await SecureStore.setItemAsync("twitok.balance.welcome", "1");
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color="#111" /></View>;

  const cash = Number(wallet.cashBalanceUsd ?? 0);
  const coin = Math.floor(Number(wallet.coinBalance ?? 0));
  const recent = gifts.slice(0, 3);

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} style={styles.topButton}><Text style={styles.back}>‹</Text></Pressable>
        <View style={styles.heading}><Text style={styles.balanceTitle}>Balance</Text><Text style={styles.secure}>♢ Secure</Text></View>
        <Pressable onPress={() => router.push("/currency")} style={styles.topButton}><Text style={styles.gear}>⚙</Text></Pressable>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Text style={styles.estimate}>Estimated balance {currency}  ◉</Text>
        <Text style={styles.amount}>{currency === "USD" ? "$" : ""}{cash.toFixed(2)} <Text style={styles.amountArrow}>›</Text></Text>
        <Pressable style={styles.coinPill} onPress={() => router.push("/wallet")}>
          <Text style={styles.coinIcon}>◉</Text><Text style={styles.coinLabel}>Coins <Text style={styles.coinNumber}>{coin.toLocaleString()}</Text></Text>
          <View style={styles.divider} /><Text style={styles.getCoins}>🎁 Get Coins →</Text>
        </Pressable>

        <View style={styles.card}><View style={styles.cardHeader}><Text style={styles.cardTitle}>Transactions</Text><Pressable onPress={() => router.push("/wallet")}><Text style={styles.viewAll}>View all ›</Text></Pressable></View>
          {recent.length ? recent.map((g,i)=><View key={i} style={styles.transaction}><Text style={styles.transactionName}>{g.giftName ?? "Gift"}</Text><Text style={styles.transactionValue}>+{Number(g.diamondsAwarded ?? 0).toLocaleString()} Diamonds</Text></View>) : <Text style={styles.empty}>No transactions yet.</Text>}
        </View>

        <Pressable style={styles.offer} onPress={() => router.push("/wallet")}><View style={styles.offerText}><Text style={styles.offerTitle}>First recharge offer ›</Text><Text style={styles.offerSub}>Get Gifts and bonus Coins</Text></View><View style={styles.giftBadge}><Text style={styles.giftEmoji}>🎁</Text></View></Pressable>

        <Text style={styles.serviceTitle}>Services</Text>
        <View style={styles.services}>
          <Pressable style={styles.service} onPress={() => router.push("/wallet")}><Text style={styles.serviceIcon}>$</Text><Text style={styles.serviceText}>LIVE rewards</Text></Pressable>
          <Pressable style={styles.service} onPress={() => router.push("/wallet")}><Text style={styles.serviceIcon}>▥</Text><Text style={styles.serviceText}>Monetisation</Text></Pressable>
          <Pressable style={styles.service} onPress={() => router.push("/settings-detail?kind=activity&title=Subscriptions%20Manager")}><Text style={styles.serviceIcon}>★</Text><Text style={styles.serviceText}>Subscriptions{String.fromCharCode(10)}Manager</Text></Pressable>
        </View>
        <Text style={styles.disclaimer}>Balance is not a financial product. Details shown are for information purposes only.</Text>
      </ScrollView>

      <Modal visible={welcome} transparent animationType="fade" onRequestClose={() => void dismissWelcome()}>
        <View style={styles.modalBackdrop}><View style={styles.modal}>
          <Pressable style={styles.modalClose} onPress={() => void dismissWelcome()}><Text style={styles.close}>×</Text></Pressable>
          <View style={styles.illustration}><Text style={styles.illustrationText}>$</Text></View>
          <Text style={styles.modalTitle}>Welcome to Balance</Text>
          <View style={styles.bullet}><Text style={styles.bulletIcon}>$</Text><View style={styles.bulletCopy}><Text style={styles.bulletTitle}>See all your rewards at once</Text><Text style={styles.bulletSub}>Check your rewards from monetisation programmes and more.</Text></View></View>
          <View style={styles.bullet}><Text style={styles.bulletIcon}>▣</Text><View style={styles.bulletCopy}><Text style={styles.bulletTitle}>Manage your Coins</Text><Text style={styles.bulletSub}>Get Coins to send Gifts to creators' LIVE.</Text></View></View>
          <Pressable style={styles.gotIt} onPress={() => void dismissWelcome()}><Text style={styles.gotItText}>Got it</Text></Pressable>
        </View></View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:"#f4f8fa"},
  top:{height:96,paddingTop:42,paddingHorizontal:12,backgroundColor:"#fff",flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  topButton:{width:46,height:46,alignItems:"center",justifyContent:"center"},
  back:{fontSize:42,color:"#111",fontWeight:"300"},
  gear:{fontSize:26,color:"#111"},
  heading:{alignItems:"center"},
  balanceTitle:{fontSize:21,fontWeight:"900",color:"#111"},
  secure:{fontSize:15,color:"#888",marginTop:1},
  content:{paddingHorizontal:18,paddingTop:28,paddingBottom:60},
  estimate:{textAlign:"center",color:"#888",fontSize:21,fontWeight:"600"},
  amount:{textAlign:"center",color:"#111",fontSize:58,fontWeight:"900",marginTop:8},
  amountArrow:{fontSize:40,fontWeight:"400"},
  coinPill:{alignSelf:"center",minWidth:310,paddingHorizontal:20,paddingVertical:14,borderRadius:32,backgroundColor:"rgba(255,255,255,.82)",borderWidth:1,borderColor:"#fff",flexDirection:"row",alignItems:"center",justifyContent:"center",marginTop:16},
  coinIcon:{fontSize:22,color:"#ffb300",marginRight:8},
  coinLabel:{fontSize:17,color:"#888",fontWeight:"700"},
  coinNumber:{color:"#111",fontWeight:"900"},
  divider:{height:26,width:1,backgroundColor:"#ddd",marginHorizontal:14},
  getCoins:{fontSize:17,color:"#ff2d55",fontWeight:"900"},
  card:{marginTop:24,backgroundColor:"#fff",borderRadius:20,padding:20},
  cardHeader:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
  cardTitle:{fontSize:19,fontWeight:"900",color:"#111"},
  viewAll:{fontSize:17,color:"#777"},
  transaction:{paddingVertical:11,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:"#eee",flexDirection:"row",justifyContent:"space-between"},
  transactionName:{color:"#222",fontSize:15,fontWeight:"700"},
  transactionValue:{color:"#666",fontSize:14},
  empty:{color:"#999",paddingTop:14},
  offer:{marginTop:18,backgroundColor:"#fff",borderRadius:20,padding:22,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  offerText:{flex:1}, offerTitle:{fontSize:18,fontWeight:"900",color:"#111"}, offerSub:{fontSize:15,color:"#888",marginTop:6},
  giftBadge:{width:68,height:68,borderRadius:34,backgroundColor:"#ff6177",alignItems:"center",justifyContent:"center"},giftEmoji:{fontSize:32},
  serviceTitle:{fontSize:20,color:"#777",fontWeight:"800",marginTop:26,marginLeft:4},
  services:{marginTop:10,backgroundColor:"#fff",borderRadius:20,padding:16,flexDirection:"row",justifyContent:"space-around"},
  service:{width:"31%",alignItems:"center",paddingVertical:8},serviceIcon:{width:54,height:54,textAlign:"center",textAlignVertical:"center",borderRadius:15,overflow:"hidden",backgroundColor:"#f6f6f6",fontSize:28,color:"#111",paddingTop:10},serviceText:{fontSize:14,color:"#111",fontWeight:"800",textAlign:"center",marginTop:10},
  disclaimer:{textAlign:"center",color:"#aaa",fontSize:13,lineHeight:18,marginTop:54},
  center:{flex:1,backgroundColor:"#f4f8fa",alignItems:"center",justifyContent:"center"},
  modalBackdrop:{flex:1,backgroundColor:"rgba(0,0,0,.55)",justifyContent:"flex-end"},
  modal:{backgroundColor:"#fff",borderTopLeftRadius:34,borderTopRightRadius:34,padding:28,paddingBottom:34},
  modalClose:{position:"absolute",right:20,top:20,width:42,height:42,borderRadius:21,backgroundColor:"#f7f7f7",alignItems:"center",justifyContent:"center"},
  close:{fontSize:30,color:"#666"},
  illustration:{alignSelf:"center",width:92,height:92,borderRadius:30,backgroundColor:"#d9fbf5",alignItems:"center",justifyContent:"center",marginTop:12},
  illustrationText:{fontSize:44,color:"#6d4cff",fontWeight:"900"},
  modalTitle:{fontSize:38,lineHeight:43,fontWeight:"900",color:"#111",marginTop:22,marginBottom:26},
  bullet:{flexDirection:"row",marginBottom:22},bulletIcon:{width:48,fontSize:25,color:"#111",fontWeight:"900"},bulletCopy:{flex:1},bulletTitle:{fontSize:20,fontWeight:"800",color:"#111"},bulletSub:{fontSize:16,lineHeight:22,color:"#777",marginTop:4},
  gotIt:{height:58,borderRadius:30,backgroundColor:"#ff2d55",alignItems:"center",justifyContent:"center",marginTop:8},gotItText:{color:"#fff",fontSize:20,fontWeight:"600"},
});
