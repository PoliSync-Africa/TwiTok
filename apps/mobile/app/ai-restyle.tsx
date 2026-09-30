import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

const STYLES = ["CLEAN","CINEMATIC","VIBRANT","PORTRAIT","PORTRAIT_PRO","ANIME","ILLUSTRATION","REALISTIC"] as const;

export default function AiRestyleScreen() {
  const params = useLocalSearchParams<{ uri?: string; mimeType?: string; mediaType?: string; duration?: string; presetStyle?: string; presetPrompt?: string }>();
  const sourceUri = String(params.uri ?? "");
  const sourceMime = String(params.mimeType ?? "");
  const mode = String(params.mediaType ?? "VIDEO").toUpperCase() === "PHOTO" ? "IMAGE" : "VIDEO";
  const [style, setStyle] = useState<(typeof STYLES)[number]>(() => (STYLES as readonly string[]).includes(String(params.presetStyle ?? "")) ? String(params.presetStyle) as (typeof STYLES)[number] : "CLEAN");
  const [prompt, setPrompt] = useState(String(params.presetPrompt ?? ""));
  const [busy, setBusy] = useState(false);
  const [targetResolution, setTargetResolution] = useState<"SOURCE_MAX"|"4K"|"8K"|"48K_AI">("SOURCE_MAX");

  async function start() {
    setBusy(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Please sign in again.");
      let sourceObjectKey: string | undefined;

      if (sourceUri) {
        const blob = await (await fetch(sourceUri)).blob();
        const mimeType = sourceMime || blob.type || (mode === "IMAGE" ? "image/jpeg" : "video/mp4");
        const endpoint = mode === "IMAGE" ? "/video/photos/uploads" : "/video/uploads";
        const body = mode === "IMAGE"
          ? { mimeType, sizeBytes: blob.size }
          : { mimeType, sizeBytes: blob.size, durationMs: Number(params.duration ?? 0) || undefined };
        const sessionResponse = await fetch(API + endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify(body)
        });
        const session = await sessionResponse.json().catch(() => ({}));
        if (!sessionResponse.ok || !session.uploadId || !session.uploadUrl) throw new Error(session.error || "Unable to prepare media for AI.");
        const uploadResponse = await fetch(session.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: blob });
        if (!uploadResponse.ok) throw new Error("Media upload for AI failed.");
        const completeEndpoint = mode === "IMAGE"
          ? "/video/photos/uploads/" + session.uploadId + "/complete"
          : "/video/uploads/" + session.uploadId + "/complete";
        const completeResponse = await fetch(API + completeEndpoint, { method: "POST", headers: { Authorization: "Bearer " + token } });
        if (!completeResponse.ok) throw new Error("Unable to verify media for AI.");
        sourceObjectKey = session.objectKey;
      }

      const response = await fetch(API + "/ai-media/restyle", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ mode, style, prompt: prompt.trim(), sourceObjectKey, targetResolution })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to start AI generation.");
      if (!data.outputUrl) throw new Error("AI generation has started. The result is not ready yet. Please try again when processing finishes.");
      router.replace({ pathname: "/create", params: { aiOutputUri: data.outputUrl, aiOutputMimeType: mode === "IMAGE" ? "image/jpeg" : "video/mp4", aiOutputDuration: String(params.duration ?? "") } });
    } catch (e) {
      Alert.alert("AI Media", e instanceof Error ? e.message : "Unable to generate media.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.title}>AI Media Studio</Text>
        <View style={{ width: 32 }} />
      </View>
      <Text style={styles.hero}>{sourceUri ? "Restyle your media" : "Create with AI"}</Text>
      <Text style={styles.helper}>AI is optional. Your original media stays unchanged. Choose a style and describe what you want.</Text>
      <View style={styles.row}>{STYLES.map(item => <Pressable key={item} style={[styles.chip, style === item && styles.selected]} onPress={() => setStyle(item)}><Text style={styles.chipText}>{item}</Text></Pressable>)}</View>
      <Text style={styles.resolutionLabel}>Output quality</Text><View style={styles.row}>{(["SOURCE_MAX","4K","8K","48K_AI"] as const).map(item => <Pressable key={item} style={[styles.chip, targetResolution === item && styles.selected]} onPress={() => setTargetResolution(item)}><Text style={styles.chipText}>{item === "SOURCE_MAX" ? "Best source" : item}</Text></Pressable>)}</View><TextInput value={prompt} onChangeText={setPrompt} placeholder={sourceUri ? "Example: cleaner skin tones, cinematic lighting, natural detail" : "Describe the image or video you want"} placeholderTextColor="#777" style={styles.input} multiline maxLength={1200} />
      <Pressable style={[styles.generate, busy && styles.disabled]} onPress={() => void start()} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.generateText}>{sourceUri ? "Restyle with AI" : "Generate with AI"}</Text>}
      </Pressable>
      <Text style={styles.note}>TwiTok will preserve the original upload and only use the AI result if you choose it.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:"#000",padding:20,paddingTop:54},
  header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:34},
  back:{color:"#fff",fontSize:42,lineHeight:42},
  title:{color:"#fff",fontSize:20,fontWeight:"800"},
  hero:{color:"#fff",fontSize:28,fontWeight:"900",marginBottom:10},
  helper:{color:"#aaa",fontSize:15,lineHeight:22,marginBottom:20},
  row:{flexDirection:"row",flexWrap:"wrap",gap:8,marginBottom:20},
  chip:{borderWidth:1,borderColor:"#333",borderRadius:20,paddingHorizontal:14,paddingVertical:9},
  selected:{backgroundColor:"#20B2AA",borderColor:"#20B2AA"},
  chipText:{color:"#fff",fontSize:12,fontWeight:"800"},
  resolutionLabel:{color:"#aaa",fontSize:13,fontWeight:"800",marginBottom:8},input:{minHeight:130,borderWidth:1,borderColor:"#333",borderRadius:16,padding:16,color:"#fff",fontSize:16,textAlignVertical:"top",marginBottom:18},
  generate:{backgroundColor:"#20B2AA",borderRadius:16,padding:16,alignItems:"center"},
  disabled:{opacity:.6},
  generateText:{color:"#fff",fontWeight:"900",fontSize:16},
  note:{color:"#777",fontSize:12,lineHeight:18,textAlign:"center",marginTop:16}
});
