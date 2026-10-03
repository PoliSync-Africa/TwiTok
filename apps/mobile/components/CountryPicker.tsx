import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { COUNTRIES, type Country } from "../lib/countries";

export function CountryPicker({ value, onChange }: { value: Country; onChange: (country: Country) => void }) {
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState("");
  const items=useMemo(()=>{const q=query.trim().toLowerCase();return q?COUNTRIES.filter(c=>c.name.toLowerCase().includes(q)||c.iso.toLowerCase()===q||c.dialCode.includes(q)):COUNTRIES},[query]);
  return <><Pressable style={styles.button} onPress={()=>setOpen(true)}><Text style={styles.text}>{value.flag} {value.dialCode}</Text></Pressable>
    <Modal visible={open} animationType="slide" onRequestClose={()=>setOpen(false)}><View style={styles.modal}>
      <Text style={styles.title}>Select country</Text>
      <TextInput style={styles.search} value={query} onChangeText={setQuery} placeholder="Search country or code" placeholderTextColor="#777"/>
      <FlatList data={items} keyExtractor={x=>x.iso} renderItem={({item})=><Pressable style={styles.row} onPress={()=>{onChange(item);setOpen(false);setQuery("")}}><Text style={styles.flag}>{item.flag}</Text><Text style={styles.name}>{item.name}</Text><Text style={styles.dial}>{item.dialCode}</Text></Pressable>}/>
      <Pressable style={styles.close} onPress={()=>setOpen(false)}><Text style={styles.closeText}>Close</Text></Pressable>
    </View></Modal></>;
}
const styles=StyleSheet.create({button:{backgroundColor:"#171717",borderWidth:1,borderColor:"#2d2d2d",borderRadius:12,paddingHorizontal:13,justifyContent:"center"},text:{color:"#fff",fontSize:16,fontWeight:"700"},modal:{flex:1,backgroundColor:"#000",padding:20,paddingTop:60},title:{color:"#fff",fontSize:24,fontWeight:"800",marginBottom:16},search:{backgroundColor:"#171717",borderWidth:1,borderColor:"#2d2d2d",borderRadius:12,color:"#fff",padding:14,fontSize:16,marginBottom:10},row:{flexDirection:"row",alignItems:"center",paddingVertical:14,borderBottomWidth:1,borderBottomColor:"#222"},flag:{fontSize:25,width:42},name:{color:"#fff",fontSize:16,flex:1},dial:{color:"#aaa"},close:{backgroundColor:"#ff2d55",borderRadius:12,padding:15,alignItems:"center",marginTop:12},closeText:{color:"#fff",fontWeight:"800"}});
