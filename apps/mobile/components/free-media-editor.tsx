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

type Props = {
  visible: boolean;
  mode: "VIDEO" | "PHOTO" | "TEXT";
  value: MediaEditPlan;
  onChange: (value: MediaEditPlan) => void;
  onClose: () => void;
};

const sections = [
  { title: "Polish", items: [["CLEAN","Clean up"],["HD","HD Enhance"],["VIVID","Vivid"],["CINEMATIC","Cinematic"]] },
  { title: "Adjust", items: [["WARM","Warm"],["COOL","Cool"],["NOIR","B&W"],["VINTAGE","Vintage"]] },
  { title: "Frame", items: [["9:16","9:16"],["1:1","1:1"],["4:5","4:5"],["16:9","16:9"],["MIRROR","Mirror"],["ROTATE","Rotate 90°"]] },
  { title: "AI tools — Free", items: [["RESTORE","Restore"],["HD_ENHANCE","HD Enhance"],["RELIGHT","AI Light"],["CUTOUT","Cutout"],["AI_SKY","AI Sky"],["CLEAN_MIRROR","Clean Mirror"],["COLORIZE","Colorize"],["AI_ART","AI Art"],["AI_PORTRAIT","AI Portrait"],["AI_STYLES","AI Styles"],["AI_EXPAND","AI Expand"],["REMOVE_TEXT","Remove Text"],["CHANGE_POSE","Change Pose"]] }
] as const;

export default function FreeMediaEditor({ visible, mode, value, onChange, onClose }: Props) {
  const [query, setQuery] = useState("");
  const update = (patch: Partial<MediaEditPlan>) => onChange({ ...value, ...patch });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View><Text style={styles.kicker}>TWITOK EDITOR</Text><Text style={styles.title}>Edit {mode === "VIDEO" ? "video" : mode === "PHOTO" ? "photo" : "post"}</Text></View>
          <Pressable onPress={onClose} style={styles.done}><Text style={styles.doneText}>Done</Text></Pressable>
        </View>
        <View style={styles.search}><Text style={styles.searchIcon}>⌕</Text><TextInput value={query} onChangeText={setQuery} placeholder="Search tools" placeholderTextColor="#7d8795" style={styles.searchInput}/></View>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.freeBanner}><Text style={styles.freeIcon}>✦</Text><View style={{flex:1}}><Text style={styles.freeTitle}>Everything here is free</Text><Text style={styles.freeSub}>No editor paywall. AI tools are optional.</Text></View></View>
          {sections.map(section => {
            const items = section.items.filter(([,label]) => !query.trim() || label.toLowerCase().includes(query.toLowerCase()));
            if (!items.length) return null;
            return <View key={section.title} style={styles.section}><Text style={styles.sectionTitle}>{section.title}</Text><View style={styles.grid}>
              {items.map(([id,label]) => {
                const active = id === "MIRROR" ? value.mirror : id === "ROTATE" ? value.rotate === 90 : id === "CLEAN" || id === "HD" ? value.quality === id : id === "VIVID" || id === "WARM" || id === "COOL" || id === "NOIR" || id === "VINTAGE" || id === "CINEMATIC" ? value.filter === id : id === "9:16" || id === "1:1" || id === "4:5" || id === "16:9" ? value.crop === id : value.aiTool === id;
                return <Pressable key={id} style={[styles.tool, active && styles.toolActive]} onPress={() => {
                  if (id === "MIRROR") return update({ mirror: !value.mirror });
                  if (id === "ROTATE") return update({ rotate: value.rotate === 90 ? 180 : value.rotate === 180 ? 270 : value.rotate === 270 ? 0 : 90 });
                  if (id === "CLEAN" || id === "HD") return update({ quality: id as MediaEditPlan["quality"] });
                  if (id === "VIVID" || id === "WARM" || id === "COOL" || id === "NOIR" || id === "VINTAGE" || id === "CINEMATIC") return update({ filter: id as MediaEditPlan["filter"] });
                  if (id === "9:16" || id === "1:1" || id === "4:5" || id === "16:9") return update({ crop: id as MediaEditPlan["crop"] });
                  update({ aiTool: id as MediaEditPlan["aiTool"] });
                }}>
                  <Text style={[styles.toolIcon, active && styles.toolIconActive]}>{id === "HD" || id === "HD_ENHANCE" ? "HD" : id === "AI_ART" || id === "AI_STYLES" || id === "AI_PORTRAIT" ? "✦" : id === "MIRROR" ? "↔" : id === "ROTATE" ? "↻" : id === "CUTOUT" ? "⌗" : "✧"}</Text>
                  <Text style={[styles.toolLabel, active && styles.toolLabelActive]}>{label}</Text>
                  {section.title === "AI tools — Free" ? <Text style={styles.freePill}>FREE</Text> : null}
                </Pressable>;
              })}
            </View></View>;
          })}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>AI restyle prompt</Text>
            <Text style={styles.helper}>Describe the look you want. Example: “cinematic Ghana street scene, natural skin tones, soft evening light”.</Text>
            <TextInput value={value.aiPrompt} onChangeText={aiPrompt => update({ aiPrompt })} multiline placeholder="Describe your AI restyle…" placeholderTextColor="#7d8795" style={styles.prompt}/>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:"#0a0d12"},header:{paddingHorizontal:20,paddingTop:18,paddingBottom:12,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},kicker:{fontSize:11,fontWeight:"800",letterSpacing:1.4,color:"#54b8df"},title:{fontSize:25,fontWeight:"800",color:"#fff",marginTop:3},done:{backgroundColor:"#2b9dcc",paddingHorizontal:18,paddingVertical:10,borderRadius:20},doneText:{color:"#fff",fontWeight:"800"},search:{marginHorizontal:20,marginBottom:10,height:48,borderRadius:14,borderWidth:1,borderColor:"#28313d",backgroundColor:"#111720",flexDirection:"row",alignItems:"center",paddingHorizontal:14},searchIcon:{fontSize:28,color:"#b9c4d0"},searchInput:{flex:1,color:"#fff",fontSize:16,marginLeft:8},content:{padding:20,paddingBottom:50},freeBanner:{flexDirection:"row",alignItems:"center",backgroundColor:"#10222c",borderWidth:1,borderColor:"#21576d",padding:14,borderRadius:16,marginBottom:22},freeIcon:{fontSize:25,color:"#63c9ec",marginRight:12},freeTitle:{color:"#fff",fontSize:16,fontWeight:"800"},freeSub:{color:"#9eafbc",fontSize:12,marginTop:3},section:{marginBottom:24},sectionTitle:{fontSize:19,fontWeight:"800",color:"#fff",marginBottom:12},helper:{color:"#9eafbc",fontSize:13,lineHeight:19,marginBottom:10},grid:{flexDirection:"row",flexWrap:"wrap",gap:10},tool:{width:"30%",minHeight:92,borderRadius:16,borderWidth:1,borderColor:"#252f3a",backgroundColor:"#111720",alignItems:"center",justifyContent:"center",padding:8},toolActive:{borderColor:"#49b7df",backgroundColor:"#102b38"},toolIcon:{fontSize:25,color:"#d6dee7",fontWeight:"800",marginBottom:7},toolIconActive:{color:"#67caed"},toolLabel:{color:"#c1cbd6",fontSize:12,fontWeight:"700",textAlign:"center"},toolLabelActive:{color:"#fff"},freePill:{marginTop:4,fontSize:8,fontWeight:"900",color:"#5bc7ea"},prompt:{minHeight:100,borderRadius:14,borderWidth:1,borderColor:"#293440",backgroundColor:"#111720",color:"#fff",padding:14,textAlignVertical:"top"}
});
