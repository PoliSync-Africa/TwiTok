import { useEffect, useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, Image, Alert, TextInput } from "react-native";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "";

type Product = { id: string; name: string; priceMinor: number; currency: string; images?: string[]; stock: number; pinned?: boolean };

export default function LiveShopScreen() {
  const { streamId, mode } = useLocalSearchParams<{ streamId?: string; mode?: string }>();
  const isHost = mode === "host";
  const [products, setProducts] = useState<Product[]>([]);
  const [featuredProductId, setFeaturedProductId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [search, setSearch] = useState("");

  async function load() {
    if (!streamId) return;
    const token = await getAuthToken();
    if (!token) return;
    const r = await fetch(API + "/shop/live/" + encodeURIComponent(streamId) + "/products", {
      headers: { Authorization: "Bearer " + token }
    });
    if (!r.ok) return;
    const d = await r.json();
    setProducts(d.products ?? []);
    setFeaturedProductId(d.featuredProductId ?? null);
    setLastSyncedAt(new Date());
    setLoading(false);
  }

  useEffect(() => {
    void load();
    if (!streamId) return;
    const timer = setInterval(() => { void load(); }, isHost ? 5000 : 3000);
    return () => clearInterval(timer);
  }, [streamId, isHost]);

  async function track(event: string, productId: string) {
    if (!streamId) return;
    const token = await getAuthToken();
    if (!token) return;
    void fetch(API + "/shop/live/" + encodeURIComponent(streamId) + "/shop-events", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ event, productId })
    }).catch(() => {});
  }

  async function openPicker() {
    if (!isHost) return;
    const token = await getAuthToken();
    if (!token) return;
    setPickerOpen(true);
    try {
      const r = await fetch(API + "/shop/commerce/products", { headers: { Authorization: "Bearer " + token } });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setCatalog(d.products ?? []);
    } catch { Alert.alert("TwiTok Shop", "Could not load your Shop catalog."); }
  }

  async function attach(productId: string) {
    if (!streamId) return;
    const token = await getAuthToken();
    if (!token) return;
    setBusy(productId);
    try {
      const r = await fetch(API + "/shop/live/" + encodeURIComponent(streamId) + "/products", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ productId })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Could not add product");
      setPickerOpen(false);
      setSearch("");
      await load();
    } catch (e) { Alert.alert("TwiTok Shop", e instanceof Error ? e.message : "Could not add product."); }
    finally { setBusy(null); }
  }

  async function pin(productId: string) {
    if (!streamId) return;
    const token = await getAuthToken();
    if (!token) return;
    setBusy(productId);
    try {
      const r = await fetch(API + "/shop/live/" + encodeURIComponent(streamId) + "/products/" + encodeURIComponent(productId) + "/pin", {
        method: "POST",
        headers: { Authorization: "Bearer " + token }
      });
      if (!r.ok) throw new Error();
      setFeaturedProductId(productId);
      void track("FEATURE_PIN", productId);
      setProducts(items => items.map(p => ({ ...p, pinned: p.id === productId })));
    } catch { Alert.alert("TwiTok Shop", "Could not feature this product."); }
    finally { setBusy(null); }
  }

  async function remove(productId: string) {
    if (!streamId) return;
    const token = await getAuthToken();
    if (!token) return;
    setBusy(productId);
    try {
      const r = await fetch(API + "/shop/live/" + encodeURIComponent(streamId) + "/products/" + encodeURIComponent(productId), {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token }
      });
      if (!r.ok) throw new Error();
      await load();
    } catch { Alert.alert("TwiTok Shop", "Could not remove this product."); }
    finally { setBusy(null); }
  }

  async function addToCart(productId: string) {
    const token = await getAuthToken();
    if (!token) return;
    setBusy(productId);
    try {
      void track("ADD_TO_CART", productId);
      const r = await fetch(API + "/shop/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ productId, quantity: 1 })
      });
      if (!r.ok) throw new Error();
      Alert.alert("Added to cart", "The product was added to your TwiTok Shop cart.", [
        { text: "Continue", style: "cancel" },
        { text: "Open cart", onPress: () => router.push("/shop?tab=cart") }
      ]);
    } catch { Alert.alert("TwiTok Shop", "Could not add this product to cart."); }
    finally { setBusy(null); }
  }

  if (!streamId) return <View style={styles.center}><Text style={styles.error}>LIVE session not found.</Text></View>;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View><Text style={styles.title}>LIVE Shopping</Text><Text style={styles.sub}>{isHost ? "Manage products during your LIVE" : "Shop products featured in this LIVE"}</Text></View>
        <Pressable onPress={() => router.back()}><Text style={styles.close}>×</Text></Pressable>
      </View>

      {!isHost && featuredProductId ? (() => {
        const featured = products.find(p => p.id === String(featuredProductId));
        return featured ? <View style={styles.featured}>
          {featured.images?.[0] ? <Image source={{ uri: featured.images[0] }} style={styles.featuredImage} /> : null}
          <View style={styles.featuredInfo}><Text style={styles.badge}>FEATURED</Text><Text style={styles.featuredName} numberOfLines={2}>{featured.name}</Text><Text style={styles.price}>{featured.currency} {(featured.priceMinor / 100).toFixed(2)}</Text><Text style={styles.stock}>{featured.stock > 0 ? "In stock" : "Out of stock"}</Text></View>
          <View style={styles.featuredActions}>
            <Pressable disabled={!featured.stock} style={styles.buySecondary} onPress={() => { void track("BUY_NOW", featured.id); router.push({ pathname: "/shop", params: { productId: featured.id } }); }}><Text style={styles.buySecondaryText}>Buy Now</Text></Pressable>
            <Pressable disabled={!featured.stock || busy === featured.id} style={styles.buy} onPress={() => void addToCart(featured.id)}><Text style={styles.buyText}>{busy === featured.id ? "Adding…" : "Add to Cart"}</Text></Pressable>
          </View>
        </View> : null;
      })() : null}

      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>{isHost ? "LIVE product tray" : "All LIVE products"}</Text><Text style={styles.count}>{products.length}/20{lastSyncedAt ? " · Live sync" : ""}</Text></View>{isHost ? <Pressable style={styles.addProductButton} onPress={() => void openPicker()}><Text style={styles.addProductText}>+ Add Product</Text></Pressable> : null}</View>
      {loading ? <Text style={styles.muted}>Loading products…</Text> : <ScrollView contentContainerStyle={styles.list}>
        {products.map(product => <View key={product.id} style={styles.card}>
          {product.images?.[0] ? <Image source={{ uri: product.images[0] }} style={styles.thumb} /> : <View style={styles.thumb} />}
          <View style={styles.info}><Text style={styles.name} numberOfLines={2}>{product.name}</Text><Text style={styles.itemPrice}>{product.currency} {(product.priceMinor / 100).toFixed(2)}</Text><Text style={styles.stock}>{product.stock > 0 ? product.stock + " in stock" : "Out of stock"}</Text></View>
          {isHost ? <View style={styles.actions}>
            <Pressable disabled={busy === product.id} style={[styles.pin, product.pinned && styles.pinned]} onPress={() => void pin(product.id)}><Text style={styles.pinText}>{product.pinned ? "Pinned" : "Pin"}</Text></Pressable>
            <Pressable disabled={busy === product.id} style={styles.remove} onPress={() => void remove(product.id)}><Text style={styles.removeText}>Remove</Text></Pressable>
          </View> : <Pressable disabled={!product.stock || busy === product.id} style={styles.add} onPress={() => void addToCart(product.id)}><Text style={styles.addText}>{busy === product.id ? "…" : "Add"}</Text></Pressable>}
        </View>)}
        {!products.length && <Text style={styles.muted}>{isHost ? "No products attached to this LIVE yet." : "No Shop products are featured yet."}</Text>}
      </ScrollView>}
      {!isHost && <Pressable style={styles.shopButton} onPress={() => router.push("/shop")}><Text style={styles.shopText}>Open TwiTok Shop</Text></Pressable>}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalBackdrop}><View style={styles.modalPanel}>
          <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Add Shop product</Text><Text style={styles.modalSub}>Choose an active product for this LIVE</Text></View><Pressable onPress={() => setPickerOpen(false)}><Text style={styles.close}>×</Text></Pressable></View>
          <TextInput value={search} onChangeText={setSearch} placeholder="Search products" placeholderTextColor="#777" style={styles.search} />
          <ScrollView contentContainerStyle={styles.modalList}>
            {catalog.filter(p => !products.some(x => x.id === p.id) && p.name.toLowerCase().includes(search.trim().toLowerCase())).map(product => <Pressable key={product.id} style={styles.catalogItem} disabled={busy === product.id} onPress={() => void attach(product.id)}>
              {product.images?.[0] ? <Image source={{uri:product.images[0]}} style={styles.catalogImage}/> : <View style={styles.catalogImage}/>}
              <View style={styles.info}><Text style={styles.name} numberOfLines={2}>{product.name}</Text><Text style={styles.itemPrice}>{product.currency} {(product.priceMinor/100).toFixed(2)}</Text><Text style={styles.stock}>{product.stock > 0 ? product.stock + " in stock" : "Out of stock"}</Text></View>
              <Text style={styles.attachText}>{busy === product.id ? "Adding…" : "Add"}</Text>
            </Pressable>)}
            {!catalog.length && <Text style={styles.muted}>No active Shop products found.</Text>}
          </ScrollView>
        </View></View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:"#050505",paddingTop:52,paddingHorizontal:14},
  center:{flex:1,backgroundColor:"#050505",alignItems:"center",justifyContent:"center"},
  error:{color:"#fff",fontSize:16,fontWeight:"800"},
  header:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:16},
  title:{color:"#fff",fontSize:21,fontWeight:"900"},
  sub:{color:"#888",fontSize:11,marginTop:3},
  close:{color:"#fff",fontSize:30,paddingHorizontal:6},
  featured:{backgroundColor:"#1b1b1b",borderRadius:16,padding:11,flexDirection:"row",alignItems:"center",gap:10,marginBottom:16,borderWidth:1,borderColor:"#ff2d55"},
  featuredImage:{width:72,height:72,borderRadius:10,backgroundColor:"#292929"},
  featuredInfo:{flex:1},
  badge:{color:"#ff2d55",fontSize:9,fontWeight:"900"},
  featuredName:{color:"#fff",fontSize:13,fontWeight:"900",marginTop:3},
  price:{color:"#fff",fontSize:13,fontWeight:"900",marginTop:4},
  featuredActions:{gap:6},
  buySecondary:{borderWidth:1,borderColor:"#666",borderRadius:9,paddingHorizontal:10,paddingVertical:8,alignItems:"center"},
  buySecondaryText:{color:"#fff",fontSize:10,fontWeight:"900"},
  buy:{backgroundColor:"#ff2d55",borderRadius:9,paddingHorizontal:10,paddingVertical:9,alignItems:"center"},
  buyText:{color:"#fff",fontSize:10,fontWeight:"900"},
  stock:{color:"#888",fontSize:10,marginTop:2},
  sectionHeader:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:8},
  sectionTitle:{color:"#fff",fontSize:15,fontWeight:"900"},
  count:{color:"#777",fontSize:11},
  list:{paddingBottom:100},
  card:{backgroundColor:"#181818",borderRadius:13,padding:9,flexDirection:"row",alignItems:"center",gap:9,marginBottom:8},
  thumb:{width:58,height:58,borderRadius:9,backgroundColor:"#292929"},
  info:{flex:1},
  name:{color:"#fff",fontSize:12,fontWeight:"800"},
  itemPrice:{color:"#fff",fontSize:12,fontWeight:"900",marginTop:3},
  actions:{gap:6},
  pin:{borderWidth:1,borderColor:"#555",borderRadius:8,paddingHorizontal:10,paddingVertical:7},
  pinned:{borderColor:"#ff2d55",backgroundColor:"#35131e"},
  pinText:{color:"#fff",fontSize:10,fontWeight:"800"},
  remove:{borderWidth:1,borderColor:"#333",borderRadius:8,paddingHorizontal:10,paddingVertical:7},
  removeText:{color:"#bbb",fontSize:10,fontWeight:"800"},
  add:{backgroundColor:"#ff2d55",borderRadius:8,paddingHorizontal:11,paddingVertical:9},
  addText:{color:"#fff",fontSize:10,fontWeight:"900"},
  addProductButton:{backgroundColor:"#ff2d55",borderRadius:9,paddingHorizontal:11,paddingVertical:8},
  addProductText:{color:"#fff",fontSize:11,fontWeight:"900"},
  shopButton:{position:"absolute",left:14,right:14,bottom:22,backgroundColor:"#ff2d55",borderRadius:12,paddingVertical:14,alignItems:"center"},
  modalBackdrop:{flex:1,backgroundColor:"rgba(0,0,0,0.6)",justifyContent:"flex-end"},
  modalPanel:{backgroundColor:"#111",borderTopLeftRadius:22,borderTopRightRadius:22,padding:16,paddingBottom:26,maxHeight:"82%"},
  modalHeader:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:12},
  modalTitle:{color:"#fff",fontSize:19,fontWeight:"900"},
  modalSub:{color:"#888",fontSize:11,marginTop:3},
  search:{backgroundColor:"#202020",borderRadius:10,color:"#fff",paddingHorizontal:12,paddingVertical:11,marginBottom:10},
  modalList:{paddingBottom:20},
  catalogItem:{backgroundColor:"#1b1b1b",borderRadius:12,padding:9,flexDirection:"row",alignItems:"center",gap:9,marginBottom:8},
  catalogImage:{width:54,height:54,borderRadius:8,backgroundColor:"#292929"},
  attachText:{color:"#ff2d55",fontSize:12,fontWeight:"900",paddingHorizontal:5},
  shopText:{color:"#fff",fontSize:13,fontWeight:"900"},
  muted:{color:"#777",fontSize:12,paddingVertical:18}
});
