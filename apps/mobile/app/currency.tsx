import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";

const CURRENCIES = [
  ["AED","United Arab Emirates Dirham"],["AFN","Afghan Afghani"],["ALL","Albanian Lek"],["AMD","Armenian Dram"],["ANG","Netherlands Antillean Guilder"],["AOA","Angolan Kwanza"],["ARS","Argentine Peso"],["AUD","Australian Dollar"],["AWG","Aruban Florin"],["AZN","Azerbaijani Manat"],
  ["BAM","Bosnia-Herzegovina Convertible Mark"],["BBD","Barbadian Dollar"],["BDT","Bangladeshi Taka"],["BGN","Bulgarian Lev"],["BHD","Bahraini Dinar"],["BIF","Burundian Franc"],["BMD","Bermudian Dollar"],["BND","Brunei Dollar"],["BOB","Bolivian Boliviano"],["BRL","Brazilian Real"],["BSD","Bahamian Dollar"],["BTN","Bhutanese Ngultrum"],["BWP","Botswanan Pula"],["BYN","Belarusian Ruble"],["BZD","Belize Dollar"],
  ["CAD","Canadian Dollar"],["CDF","Congolese Franc"],["CHF","Swiss Franc"],["CLP","Chilean Peso"],["CNY","Chinese Yuan"],["COP","Colombian Peso"],["CRC","Costa Rican Colón"],["CUP","Cuban Peso"],["CVE","Cape Verdean Escudo"],["CZK","Czech Koruna"],
  ["DJF","Djiboutian Franc"],["DKK","Danish Krone"],["DOP","Dominican Peso"],["DZD","Algerian Dinar"],
  ["EGP","Egyptian Pound"],["ERN","Eritrean Nakfa"],["ETB","Ethiopian Birr"],["EUR","Euro"],
  ["GBP","British Pound"],["GEL","Georgian Lari"],["GHS","Ghanaian Cedi"],["GMD","Gambian Dalasi"],["GNF","Guinean Franc"],["GTQ","Guatemalan Quetzal"],["GYD","Guyanese Dollar"],
  ["HKD","Hong Kong Dollar"],["HNL","Honduran Lempira"],["HRK","Croatian Kuna"],["HTG","Haitian Gourde"],["HUF","Hungarian Forint"],
  ["IDR","Indonesian Rupiah"],["ILS","Israeli New Shekel"],["INR","Indian Rupee"],["IQD","Iraqi Dinar"],["IRR","Iranian Rial"],["ISK","Icelandic Króna"],
  ["JMD","Jamaican Dollar"],["JOD","Jordanian Dinar"],["JPY","Japanese Yen"],
  ["KES","Kenyan Shilling"],["KGS","Kyrgyzstani Som"],["KHR","Cambodian Riel"],["KMF","Comorian Franc"],["KRW","South Korean Won"],["KWD","Kuwaiti Dinar"],["KYD","Cayman Islands Dollar"],["KZT","Kazakhstani Tenge"],
  ["LAK","Lao Kip"],["LBP","Lebanese Pound"],["LKR","Sri Lankan Rupee"],["LRD","Liberian Dollar"],["LSL","Lesotho Loti"],["LYD","Libyan Dinar"],
  ["MAD","Moroccan Dirham"],["MDL","Moldovan Leu"],["MGA","Malagasy Ariary"],["MKD","Macedonian Denar"],["MMK","Myanmar Kyat"],["MNT","Mongolian Tögrög"],["MOP","Macanese Pataca"],["MRU","Mauritanian Ouguiya"],["MUR","Mauritian Rupee"],["MVR","Maldivian Rufiyaa"],["MWK","Malawian Kwacha"],["MXN","Mexican Peso"],["MYR","Malaysian Ringgit"],["MZN","Mozambican Metical"],
  ["NAD","Namibian Dollar"],["NGN","Nigerian Naira"],["NIO","Nicaraguan Córdoba"],["NOK","Norwegian Krone"],["NPR","Nepalese Rupee"],["NZD","New Zealand Dollar"],
  ["OMR","Omani Rial"],["PAB","Panamanian Balboa"],["PEN","Peruvian Sol"],["PGK","Papua New Guinean Kina"],["PHP","Philippine Peso"],["PKR","Pakistani Rupee"],["PLN","Polish Złoty"],["PYG","Paraguayan Guarani"],
  ["QAR","Qatari Riyal"],["RON","Romanian Leu"],["RSD","Serbian Dinar"],["RUB","Russian Ruble"],["RWF","Rwandan Franc"],
  ["SAR","Saudi Riyal"],["SBD","Solomon Islands Dollar"],["SCR","Seychellois Rupee"],["SDG","Sudanese Pound"],["SEK","Swedish Krona"],["SGD","Singapore Dollar"],["SLL","Sierra Leonean Leone"],["SOS","Somali Shilling"],["SRD","Surinamese Dollar"],["SSP","South Sudanese Pound"],["STN","São Tomé and Príncipe Dobra"],["SVC","Salvadoran Colón"],["SYP","Syrian Pound"],
  ["THB","Thai Baht"],["TJS","Tajikistani Somoni"],["TMT","Turkmenistani Manat"],["TND","Tunisian Dinar"],["TOP","Tongan Paʻanga"],["TRY","Turkish Lira"],["TTD","Trinidad and Tobago Dollar"],["TWD","New Taiwan Dollar"],["TZS","Tanzanian Shilling"],
  ["UAH","Ukrainian Hryvnia"],["UGX","Ugandan Shilling"],["USD","US Dollar"],["UYU","Uruguayan Peso"],["UZS","Uzbekistani Som"],
  ["VES","Venezuelan Bolívar Soberano"],["VND","Vietnamese Dong"],["VUV","Vanuatu Vatu"],
  ["WST","Samoan Tala"],["XAF","Central African CFA Franc"],["XCD","East Caribbean Dollar"],["XOF","West African CFA Franc"],["XPF","CFP Franc"],["YER","Yemeni Rial"],["ZAR","South African Rand"],["ZMW","Zambian Kwacha"],["ZWL","Zimbabwean Dollar"],
] as const;

export default function CurrencyScreen() {
  const [query,setQuery]=useState("");
  const [selected,setSelected]=useState("USD");
  useEffect(()=>{SecureStore.getItemAsync("twitok.balance.currency").then(v=>{if(v)setSelected(v)}).catch(()=>undefined)},[]);
  const filtered=useMemo(()=>CURRENCIES.filter(([code,name])=>(code+" "+name).toLowerCase().includes(query.trim().toLowerCase())),[query]);
  async function choose(code:string){setSelected(code);await SecureStore.setItemAsync("twitok.balance.currency",code);}
  return <View style={styles.screen}>
    <View style={styles.header}><Pressable onPress={()=>router.back()}><Text style={styles.cancel}>Cancel</Text></Pressable><Text style={styles.title}>Select a currency</Text><Pressable onPress={()=>router.back()}><Text style={[styles.done,!selected&&styles.disabled]}>Done</Text></Pressable></View>
    <View style={styles.searchWrap}><Text style={styles.searchIcon}>⌕</Text><TextInput value={query} onChangeText={setQuery} placeholder="Search" placeholderTextColor="#a0a0a0" style={styles.search}/></View>
    <ScrollView contentContainerStyle={styles.list}>
      {filtered.map(([code,name])=><Pressable key={code} onPress={()=>void choose(code)} style={styles.item}><Text style={styles.itemText}>{code} - {name}</Text><View style={[styles.radio,selected===code&&styles.radioSelected]}>{selected===code?<View style={styles.radioDot}/>:null}</View></Pressable>)}
    </ScrollView>
  </View>;
}
const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:"#fff"},
 header:{height:92,paddingTop:42,paddingHorizontal:18,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
 cancel:{fontSize:17,color:"#111"},title:{fontSize:19,fontWeight:"900",color:"#111"},done:{fontSize:17,color:"#aaa",fontWeight:"800"},disabled:{opacity:.4},
 searchWrap:{marginHorizontal:18,height:54,borderRadius:17,backgroundColor:"#f1f1f1",flexDirection:"row",alignItems:"center",paddingHorizontal:16},searchIcon:{fontSize:32,color:"#111",marginRight:10},search:{flex:1,fontSize:18,color:"#111"},
 list:{paddingHorizontal:36,paddingBottom:50},item:{minHeight:66,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},itemText:{fontSize:18,color:"#111",fontWeight:"600",flex:1,paddingRight:14},radio:{width:30,height:30,borderRadius:15,borderWidth:3,borderColor:"#d7d7d7",alignItems:"center",justifyContent:"center"},radioSelected:{borderColor:"#ff2d55"},radioDot:{width:12,height:12,borderRadius:6,backgroundColor:"#ff2d55"}
});
