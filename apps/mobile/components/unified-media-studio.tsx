import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

export type StudioPlan = {
  quality: "ORIGINAL" | "CLEAN" | "HD" | "4K" | "8K" | "12K_AI";
  filter: string;
  faceFilter: string;
  background: string;
  transition: string;
  speed: number;
  crop: string;
  rotate: 0 | 90 | 180 | 270;
  mirror: boolean;
  aiTool: string;
  aiPrompt: string;
};

export const DEFAULT_STUDIO_PLAN: StudioPlan = {
  quality: "12K_AI", filter: "NONE", faceFilter: "NONE", background: "ORIGINAL",
  transition: "NONE", speed: 1, crop: "ORIGINAL", rotate: 0, mirror: false,
  aiTool: "NONE", aiPrompt: ""
};

type Props = { visible: boolean; mode: "VIDEO" | "PHOTO"; value: StudioPlan; onChange: (value: StudioPlan) => void; onClose: () => void; onRunAI: () => void; capabilities?: Set<string> };

const sections = (mode: "VIDEO" | "PHOTO") => [
  { title: "Pro Quality", items: [["CLEAN","Clean & Restore"],["HD","HD Enhance"],["4K","4K Pro"],["8K","8K Pro"],["12K_AI","12K AI Master"]] },
  { title: "Color & Look", items: [["VIVID","Vivid"],["CINEMATIC","Cinematic"],["PORTRAIT","Portrait Pro"],["WARM","Warm"],["COOL","Cool"],["NOIR","Noir"],["VINTAGE","Vintage"],["NATURAL","Natural Skin"]] },
  { title: "Face Filters", items: [["SMOOTH","Natural Smooth"],["GLOW","Soft Glow"],["MAKEUP","Studio Makeup"],["FACE_LIGHT","Face Light"],["BEAUTY","Beauty"],["NONE","Original Face"]] },
  { title: "Background Studio", items: [["BLUR","AI Blur"],["REPLACE","Replace Background"],["REMOVE","Remove Background"],["STUDIO","Studio Background"],["GREEN","Green Screen"],["ORIGINAL","Keep Original"]] },
  { title: "AI Studio — Free", items: [["RESTORE","Restore"],["RELIGHT","AI Relight"],["DETAIL","Super Detail"],["DENOISE","AI Denoise"],["COLORIZE","Colorize"],["AI_ART","AI Art"],["AI_EXPAND","AI Expand"],["OBJECT_REMOVE","Remove Object"],["SKY","AI Sky"],["FACE_REPAIR","Face Repair"]] },
  { title: "Frame & Motion", items: [["9:16","9:16"],["1:1","1:1"],["4:5","4:5"],["16:9","16:9"],["MIRROR","Mirror"],["ROTATE","Rotate"],["0.5","0.5×"],["0.75","0.75×"],["1","1×"],["1.5","1.5×"],["2","2×"]] },
  ...(mode === "VIDEO" ? [{ title: "Transitions", items: [["NONE","None"],["FADE","Fade"],["DISSOLVE","Dissolve"],["WIPELEFT","Wipe Left"],["WIPERIGHT","Wipe Right"],["SLIDELEFT","Slide Left"],["SLIDERIGHT","Slide Right"]] }] : [])
] as const;

const aiIds = new Set(["12K_AI","RESTORE","RELIGHT","DETAIL","DENOISE","COLORIZE","AI_ART","AI_EXPAND","OBJECT_REMOVE","SKY","FACE_REPAIR","REPLACE","REMOVE","STUDIO","GREEN","BLUR","SMOOTH","GLOW","MAKEUP","FACE_LIGHT","BEAUTY","PORTRAIT"]);

export default function UnifiedMediaStudio({ visible, mode, value, onChange, onClose, onRunAI, capabilities }: Props) {
  const [search, setSearch] = useState("");
  const update = (patch: Partial<StudioPlan>) => onChange({ ...value, ...patch });
  const filtered = useMemo(() => sections(mode).map(section => ({ ...section, items: section.items.filter(item => !search.trim() || item[1].toLowerCase().includes(search.toLowerCase())) })).filter(section => section.items.length), [mode, search]);
  const capabilityFor = (id: string) => ({REPLACE:"BACKGROUND_REPLACE",REMOVE:"BACKGROUND_REMOVE",BLUR:"AI_BLUR",STUDIO:"STUDIO",GREEN:"GREEN_SCREEN",RESTORE:"RESTORE",RELIGHT:"RELIGHT",DETAIL:"SUPER_DETAIL",COLORIZE:"COLORIZE",AI_ART:"AI_ART",AI_EXPAND:"AI_EXPAND",OBJECT_REMOVE:"REMOVE_OBJECT",SKY:"SKY",DENOISE:"DENOISE",FACE_REPAIR:"FACE_REPAIR",SMOOTH:"FACE_FILTER_SMOOTH",GLOW:"FACE_FILTER_GLOW",MAKEUP:"FACE_FILTER_MAKEUP",FACE_LIGHT:"FACE_FILTER_FACE_LIGHT",BEAUTY:"FACE_FILTER_BEAUTY",CLEAN:"CLEAN",HD:"HD","4K":"4K","8K":"8K","12K_AI":"12K_AI"} as Record<string,string>)[id];
  const unavailable = (id: string) => Boolean(capabilities && capabilities.has("__PROVIDER_BACKED__") && capabilityFor(id) && !capabilities.has(capabilityFor(id)!));
  const active = (id: string) =>
    value.quality === id || value.filter === id || value.faceFilter === id || value.background === id ||
    value.transition === id || value.crop === id || (id === "MIRROR" && value.mirror) ||
    (id === "ROTATE" && value.rotate !== 0) || value.aiTool === id || String(value.speed) === id;

  function select(id: string) {
    if (["CLEAN","HD","4K","8K","12K_AI"].includes(id)) return update({ quality: id as StudioPlan["quality"] });
    if (["VIVID","CINEMATIC","PORTRAIT","WARM","COOL","NOIR","VINTAGE","NATURAL"].includes(id)) return update({ filter: id });
    if (["SMOOTH","GLOW","MAKEUP","FACE_LIGHT","BEAUTY","NONE"].includes(id)) return update({ faceFilter: id });
    if (["BLUR","REPLACE","REMOVE","STUDIO","GREEN","ORIGINAL"].includes(id)) return update({ background: id });
    if (["FADE","DISSOLVE","WIPELEFT","WIPERIGHT","SLIDELEFT","SLIDERIGHT"].includes(id)) return update({ transition: id });
    if (["9:16","1:1","4:5","16:9"].includes(id)) return update({ crop: id });
    if (id === "MIRROR") return update({ mirror: !value.mirror });
    if (id === "ROTATE") return update({ rotate: value.rotate === 0 ? 90 : value.rotate === 90 ? 180 : value.rotate === 180 ? 270 : 0 });
    if (["0.5","0.75","1","1.5","2"].includes(id)) return update({ speed: Number(id) });
    update({ aiTool: id });
  }

  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <View style={styles.screen}>
      <View style={styles.header}>
        <View><Text style={styles.kicker}>TWITOK STUDIO</Text><Text style={styles.title}>{mode === "VIDEO" ? "Video" : "Photo"} Studio</Text></View>
        <Pressable style={styles.done} onPress={onClose}><Text style={styles.doneText}>Done</Text></Pressable>
      </View>
      <TextInput value={search} onChangeText={setSearch} placeholder="Search editing tools…" placeholderTextColor="#788492" style={styles.search}/>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}><Text style={styles.heroIcon}>✦</Text><View style={{flex:1}}><Text style={styles.heroTitle}>Pro quality. No editor paywall.</Text><Text style={styles.heroSub}>Enhance contrast, color, detail and clarity while preserving the original. AI tools are free to use.</Text></View></View>
        {filtered.map(section => <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.grid}>{section.items.map(([id,label]) => <Pressable key={id} onPress={() => !unavailable(id) && select(id)} style={[styles.tool, active(id) && styles.active, unavailable(id) && styles.disabled]}>
            <Text style={[styles.icon, active(id) && styles.activeText, unavailable(id) && styles.disabledText]}>{aiIds.has(id) ? "✦" : id === "MIRROR" ? "↔" : id === "ROTATE" ? "↻" : id === "NONE" ? "○" : "◇"}</Text>
            <Text style={[styles.label, active(id) && styles.activeText, unavailable(id) && styles.disabledText]}>{label}</Text>
            {unavailable(id) ? <Text style={styles.unavailable}>UNAVAILABLE</Text> : aiIds.has(id) ? <Text style={styles.free}>FREE</Text> : null}
          </Pressable>)}</View>
        </View>)}
        <View style={styles.promptBox}>
          <Text style={styles.sectionTitle}>Describe exactly what you want</Text>
          <Text style={styles.helper}>Examples: “natural studio lighting, richer contrast, clean skin texture, sharper eyes, premium cinematic color”; “replace the background with a modern Accra skyline”; “keep the face and clothing unchanged.”</Text>
          <TextInput value={value.aiPrompt} onChangeText={aiPrompt => update({aiPrompt})} multiline maxLength={1600} placeholder="Tell AI how to edit your media…" placeholderTextColor="#788492" style={styles.prompt}/>
          <Pressable style={styles.run} onPress={onRunAI}><Text style={styles.runText}>✦ Run AI Studio</Text></Pressable>
        </View>
        <Text style={styles.footer}>TwiTok keeps your original media unchanged. “12K AI” means the highest practical AI output requested from the configured generation provider; it cannot recover detail that was never captured without AI reconstruction.</Text>
      </ScrollView>
    </View>
  </Modal>;
}

const styles=StyleSheet.create({
screen:{flex:1,backgroundColor:"#080b10"},header:{paddingTop:18,paddingHorizontal:18,paddingBottom:12,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},kicker:{color:"#62c8e9",fontSize:10,fontWeight:"900",letterSpacing:1.8},title:{color:"#fff",fontSize:26,fontWeight:"900",marginTop:3},done:{backgroundColor:"#20b2aa",paddingHorizontal:18,paddingVertical:10,borderRadius:22},doneText:{color:"#fff",fontWeight:"900"},search:{marginHorizontal:18,marginBottom:12,height:48,borderRadius:14,borderWidth:1,borderColor:"#29333e",backgroundColor:"#111720",color:"#fff",paddingHorizontal:15,fontSize:15},content:{padding:18,paddingBottom:60},hero:{flexDirection:"row",alignItems:"center",backgroundColor:"#102630",borderWidth:1,borderColor:"#20586b",borderRadius:18,padding:15,marginBottom:20},heroIcon:{fontSize:30,color:"#67d0ed",marginRight:12},heroTitle:{color:"#fff",fontSize:16,fontWeight:"900"},heroSub:{color:"#a5b7c3",fontSize:12,lineHeight:18,marginTop:4},section:{marginBottom:22},sectionTitle:{color:"#fff",fontSize:18,fontWeight:"900",marginBottom:11},grid:{flexDirection:"row",flexWrap:"wrap",gap:8},tool:{width:"31.5%",minHeight:88,borderRadius:15,borderWidth:1,borderColor:"#26313c",backgroundColor:"#111720",alignItems:"center",justifyContent:"center",padding:7},active:{borderColor:"#5ac7e8",backgroundColor:"#12303c"},icon:{color:"#d6dee7",fontSize:23,fontWeight:"900",marginBottom:5},label:{color:"#c4ced8",fontSize:11,fontWeight:"800",textAlign:"center"},activeText:{color:"#fff"},disabled:{opacity:0.42},disabledText:{color:"#6f7a84"},unavailable:{color:"#788492",fontSize:7,fontWeight:"900",marginTop:4},free:{color:"#5ac7e8",fontSize:8,fontWeight:"900",marginTop:4},promptBox:{borderRadius:18,borderWidth:1,borderColor:"#284252",backgroundColor:"#0e2029",padding:15},helper:{color:"#9fb0bc",fontSize:12,lineHeight:18,marginBottom:10},prompt:{minHeight:110,borderRadius:14,borderWidth:1,borderColor:"#30404d",backgroundColor:"#0a1015",color:"#fff",padding:13,textAlignVertical:"top"},run:{marginTop:12,borderRadius:14,backgroundColor:"#20b2aa",padding:15,alignItems:"center"},runText:{color:"#fff",fontSize:15,fontWeight:"900"},footer:{color:"#66727d",fontSize:11,lineHeight:17,textAlign:"center",marginTop:18}
});