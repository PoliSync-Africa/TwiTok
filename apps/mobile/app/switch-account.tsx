import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

export default function SwitchAccountScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={()=>router.back()}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.title}>Switch account</Text>
        <View style={{width:40}} />
      </View>
      <View style={styles.body}>
        <Text style={styles.heading}>Choose an account</Text>
        <Text style={styles.sub}>Sign in to another TwiTok account on this device. Your current account stays secure.</Text>
        <Pressable style={styles.primary} onPress={()=>router.push("/login")}><Text style={styles.primaryText}>Sign in to another account</Text></Pressable>
        <Pressable style={styles.secondary} onPress={()=>router.push("/register")}><Text style={styles.secondaryText}>Create a new account</Text></Pressable>
        <Pressable onPress={()=>Alert.alert("Switch account","Your current session remains available until you sign out.")}><Text style={styles.help}>How switching works</Text></Pressable>
      </View>
    </View>
  );
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:"#f5f5f5"},
  header:{height:96,paddingTop:42,paddingHorizontal:18,backgroundColor:"#fff",flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  back:{fontSize:42,color:"#111",fontWeight:"300"},
  title:{fontSize:21,fontWeight:"900",color:"#111"},
  body:{padding:24},
  heading:{fontSize:28,fontWeight:"900",color:"#111"},
  sub:{fontSize:15,lineHeight:22,color:"#777",marginTop:8,marginBottom:28},
  primary:{height:54,borderRadius:28,backgroundColor:"#ff2d55",alignItems:"center",justifyContent:"center"},
  primaryText:{color:"#fff",fontSize:17,fontWeight:"800"},
  secondary:{height:54,borderRadius:28,backgroundColor:"#fff",alignItems:"center",justifyContent:"center",marginTop:12,borderWidth:1,borderColor:"#ddd"},
  secondaryText:{color:"#111",fontSize:17,fontWeight:"800"},
  help:{textAlign:"center",color:"#777",fontSize:14,marginTop:22},
});