import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

export type MediaEditPlan = {
  quality: "ORIGINAL" | "CLEAN" | "HD";
  filter: "NONE" | "VIVID" | "WARM" | "COOL" | "NOIR" | "VINTAGE" | "CINEMATIC";
  crop: "ORIGINAL" | "9:16" | "1:1" | "4:5" | "16:9";
  rotate: 0 | 90 | 180 | 270;
  mirror: boolean;
  speed: 0.5 | 0.75 | 1 | 1.5 | 2;
  aiTool: "NONE" | "RESTORE" | "HD_ENHANCE" | "RELIGHT" | "AI_SKY" | "CUTOUT" | "CLEAN_MIRROR" | "COLORIZE" | "AI_ART" | "AI_PORTRAIT" | "AI_STYLES" | "AI_EXPAND" | "REMOVE_TEXT" | "CHANGE_POSE";
  aiPrompt: string;
};

export const DEFAULT_MEDIA_EDIT_PLAN: MediaEditPlan = {
  quality: "HD", filter: "NONE", crop: "ORIGINAL", rotate: 0, mirror: false, speed: 1, aiTool: "NONE", aiPrompt: ""
};

type Tool = { id: string; label: string; section: string };
type Props = { visible: boolean; mode: "VIDEO" | "PHOTO" | "TEXT"; value: MediaEditPlan; onChange: (value: MediaEditPlan) => void; onClose: () => void };

const TOOLS: Tool[] = [
  {section:"Polish",id:"CLEAN",label:"Clean up"},{section:"Polish",id:"HD",label:"HD Enhance"},{section:"Polish",id:"VIVID",label:"Vivid"},{section:"Polish",id:"CINEMATIC",label:"Cinematic"},
  {section:"Adjust",id:"WARM",label:"Warm"},{section:"Adjust",id:"COOL",label:"Cool"},{section:"Adjust",id:"NOIR",label:"B&W"},{section:"Adjust",id:"VINTAGE",label:"Vintage"},
  {section:"Frame",id:"9:16",label:"9:16"},{section:"Frame",id:"1:1",label:"1:1"},{section:"Frame",id:"4:5",label:"4:5"},{section:"Frame",id:"16:9",label:"16:9"},{section:"Frame",id:"MIRROR",label:"Mirror"},{section:"Frame",id:"ROTATE",label:"Rotate"},
  {section:"AI tools — Free",id:"RESTORE",label:"Restore"},{section:"AI tools — Free",id:"HD_ENHANCE",label:"HD Enhance"},{section:"AI tools — Free",id:"RELIGHT",label:"AI Light"},{section:"AI tools — Free",id:"CUTOUT",label:"Cutout"},{section:"AI tools — Free",id:"AI_SKY",label:"AI Sky"},{section:"AI tools — Free",id:"CLEAN_MIRROR",label:"Clean Mirror"},{section:"AI tools — Free",id:"COLORIZE",label:"Colorize"},{section:"AI tools — Free",id:"AI_ART",label:"AI Art"},{section:"AI tools — Free",id:"AI_PORTRAIT",label:"AI Portrait"},{section:"AI tools — Free",id:"AI_STYLES",label:"AI Styles"},{section:"AI tools — Free",id:"AI_EXPAND",label:"AI Expand"},{section:"AI tools — Free",id:"REMOVE_TEXT",label:"Remove Text"},{section:"AI tools — Free",id:"CHANGE_POSE",label:"Change Pose"}
];

const AI_IDS = new Set(["RESTORE","HD_ENHANCE","RELIGHT","CUTOUT","AI_SKY","CLEAN_MIRROR","COLORIZE","AI_ART","AI_PORTRAIT","AI_STYLES","AI_EXPAND","REMOVE_TEXT","CHANGE_POSE"]);

export default function FreeMediaEditor({ visible, mode, value, onChange, onClose }: Props) {
  const [query, setQuery] = useState("");
  const update = (patch: Partial<MediaEditPlan>) => onChange({ ...value, ...patch });

  const active = (id: string) => {
    if (id === "MIRROR") return value.mirror;
    if (id === "ROTATE") return value.rotate !== 0;
    if (id === "CLEAN" || id === "HD") return value.quality === id;
    if (["VIVID","WARM","COOL","NOIR","VINTAGE","CINEMATIC"].includes(id)) return value.filter === id;
    if (["9:16","1:1","4:5","16:9"].includes(id)) return value.crop === id;
    return value.aiTool === id;
  };

  const select = (id: string) => {
    if (id === "MIRROR") return update({ mirror: !value.mirror });
    if (id === "ROTATE") return update({ rotate: value.rotate === 0 ? 90 : value.rotate === 90 ? 180 : value.rotate === 180 ? 270 : 0 });
    if (id === "CLEAN" || id === "HD") return update({ quality: id as MediaEditPlan["quality"] });
    if (["VIVID","WARM","COOL","NOIR","VINTAGE","CINEMATIC"].includes(id)) return update({ filter: id as MediaEditPlan["filter"] });
    if (["9:16","1:1","4:5","16:9"].includes(id)) return update({ crop: id as MediaEditPlan["crop"] });
    if (AI_IDS.has(id)) return update({ aiTool: id as MediaEditPlan["aiTool"] });
  };

  const visibleTools = TOOLS.filter(tool => !query.trim() || tool.label.toLowerCase().includes(query.toLowerCase()));
  const sections = Array.from(new Set(visibleTools.map(tool => tool.section)));

  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <View style={styles.screen}>
      <View style={styles.header}>
        <View><Text style={styles.kicker}>TWITOK EDITOR</Text><Text style={styles.title}>Edit {mode === "VIDEO" ? "video" : mode === "PHOTO" ? "photo" : "post"}</Text></View>
        <Pressable onPress={onClose} style={styles.done}><Text style={styles.doneText}>Done</Text></Pressable>
      </View>
      <View style={styles.search}><Text style={styles.searchIcon}>⌕</Text><TextInput value={query} onChangeText={setQuery} placeholder="Search tools" placeholderTextColor="#7d8795" style={styles.searchInput}/></View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.freeBanner}><Text style={styles.freeIcon}>✦</Text><View style={styles.flex}><Text style={styles.freeTitle}>Everything here is free</Text><Text style={styles.freeSub}>No editor paywall. AI tools are optional.</Text></View></View>
        {sections.map(section => <View key={section} style={styles.section}>
          <Text style={styles.sectionTitle}>{section}</Text>
          <View style={styles.grid}>
            {visibleTools.filter(tool => tool.section === section).map(tool => <Pressable key={tool.id} style={[styles.tool, active(tool.id) && styles.toolActive]} onPress={() => select(tool.id)}>
              <Text style={[styles.toolIcon, active(tool.id) && styles.toolIconActive]}>{tool.id === "HD" || tool.id === "HD_ENHANCE" ? "HD" : AI_IDS.has(tool.id) ? "✦" : tool.id === "MIRROR" ? "↔" : tool.id === "ROTATE" ? "↻" : "✧"}</Text>
              <Text style={[styles.toolLabel, active(tool.id) && styles.toolLabelActive]}>{tool.label}</Text>
              {AI_IDS.has(tool.id) ? <Text style={styles.freePill}>FREE</Text> : null}
            </Pressable>)}
          </View>
        </View>)}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI restyle prompt</Text>
          <Text style={styles.helper}>Describe the look you want, or leave it empty for the selected AI preset.</Text>
          <TextInput value={value.aiPrompt} onChangeText={aiPrompt => update({ aiPrompt })} multiline placeholder="Describe your AI restyle…" placeholderTextColor="#7d8795" style={styles.prompt}/>
        </View>
      </ScrollView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:"#0a0d12"},header:{paddingHorizontal:20,paddingTop:18,paddingBottom:12,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},kicker:{fontSize:11,fontWeight:"800",letterSpacing:1.4,color:"#54b8df"},title:{fontSize:25,fontWeight:"800",color:"#fff",marginTop:3},done:{backgroundColor:"#2b9dcc",paddingHorizontal:18,paddingVertical:10,borderRadius:20},doneText:{color:"#fff",fontWeight:"800"},search:{marginHorizontal:20,marginBottom:10,height:48,borderRadius:14,borderWidth:1,borderColor:"#28313d",backgroundColor:"#111720",flexDirection:"row",alignItems:"center",paddingHorizontal:14},searchIcon:{fontSize:28,color:"#b9c4d0"},searchInput:{flex:1,color:"#fff",fontSize:16,marginLeft:8},content:{padding:20,paddingBottom:50},freeBanner:{flexDirection:"row",alignItems:"center",backgroundColor:"#10222c",borderWidth:1,borderColor:"#21576d",padding:14,borderRadius:16,marginBottom:22},freeIcon:{fontSize:25,color:"#63c9ec",marginRight:12},freeTitle:{color:"#fff",fontSize:16,fontWeight:"800"},freeSub:{color:"#9eafbc",fontSize:12,marginTop:3},flex:{flex:1},section:{marginBottom:24},sectionTitle:{fontSize:19,fontWeight:"800",color:"#fff",marginBottom:12},helper:{color:"#9eafbc",fontSize:13,lineHeight:19,marginBottom:10},grid:{flexDirection:"row",flexWrap:"wrap"},tool:{width:"31%",minHeight:92,borderRadius:16,borderWidth:1,borderColor:"#252f3a",backgroundColor:"#111720",alignItems:"center",justifyContent:"center",padding:8,marginRight:"2%",marginBottom:10},toolActive:{borderColor:"#49b7df",backgroundColor:"#102b38"},toolIcon:{fontSize:25,color:"#d6dee7",fontWeight:"800",marginBottom:7},toolIconActive:{color:"#67caed"},toolLabel:{color:"#c1cbd6",fontSize:12,fontWeight:"700",textAlign:"center"},toolLabelActive:{color:"#fff"},freePill:{marginTop:4,fontSize:8,fontWeight:"900",color:"#5bc7ea"},prompt:{minHeight:100,borderRadius:14,borderWidth:1,borderColor:"#293440",backgroundColor:"#111720",color:"#fff",padding:14,textAlignVertical:"top"}
});
