import { useEffect, useRef, useState } from "react";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Effect = "NONE" | "VIBRANT" | "WARM" | "COOL" | "NOIR" | "VINTAGE";
type Flash = "off" | "on" | "auto";
type Facing = "front" | "back";
type Mode = "VIDEO" | "PHOTO" | "TEXT";

const EFFECTS: Effect[] = ["NONE","VIBRANT","WARM","COOL","NOIR","VINTAGE"];

export default function CameraStudioScreen() {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView | null>(null);
  const recordingRef = useRef<Promise<{ uri: string } | undefined> | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const [facing, setFacing] = useState<Facing>("front");
  const [flash, setFlash] = useState<Flash>("off");
  const [muted, setMuted] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [timer, setTimer] = useState<0 | 3 | 10>(0);
  const [durationLimit, setDurationLimit] = useState<15 | 60 | 600>(60);
  const [speed, setSpeed] = useState<0.5 | 1 | 1.5 | 2>(1);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [effect, setEffect] = useState<Effect>("NONE");
  const [grid, setGrid] = useState(false);
  const [mode, setMode] = useState<Mode>("VIDEO");
  const [tool, setTool] = useState<"flip"|"speed"|"filters"|"enhance"|"timer"|"flash"|"grid">("flip");
  const [error, setError] = useState("");

  useEffect(() => {
    if (cameraPermission && !cameraPermission.granted) requestCameraPermission();
  }, [cameraPermission?.granted]);
  useEffect(() => {
    if (microphonePermission && !microphonePermission.granted) requestMicrophonePermission();
  }, [microphonePermission?.granted]);

  async function startRecording() {
    if (recording || countdown !== null || !cameraRef.current || mode !== "VIDEO") return;
    setError("");
    if (timer > 0) {
      for (let value = timer; value > 0; value--) {
        setCountdown(value);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      setCountdown(null);
    }
    if (!cameraRef.current) return;
    setRecording(true);
    const started = Date.now();
    recordingRef.current = cameraRef.current.recordAsync({ maxDuration: durationLimit });
    try {
      const result = await recordingRef.current;
      if (!result?.uri) throw new Error("Camera did not return a video.");
      const duration = Math.max(1, Math.min(durationLimit * 1000, Date.now() - started));
      router.replace({ pathname: "/create", params: {
        recordedUri: result.uri,
        recordedDuration: String(duration),
        recordedEffect: effect,
        recordedSpeed: String(speed)
      }});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to record video.");
    } finally {
      recordingRef.current = null;
      setRecording(false);
    }
  }

  async function takePhoto() {
    if (!cameraRef.current || mode !== "PHOTO" || recording) return;
    try {
      const result = await cameraRef.current.takePictureAsync({ quality: 1, shutterSound: true });
      if (result?.uri) {
        router.replace({ pathname: "/create", params: { aiOutputUri: result.uri, aiOutputMode: "PHOTO", aiOutputMimeType: "image/jpeg" } });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to take photo.");
    }
  }

  async function uploadFromGallery() {
    const mediaTypes = mode === "PHOTO" ? "images" : "videos";
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      allowsMultipleSelection: mode === "PHOTO",
      selectionLimit: mode === "PHOTO" ? 35 : 10,
      quality: 1,
      videoMaxDuration: 600
    });
    if (result.canceled || !result.assets.length) return;
    const first = result.assets[0];
    if (mode === "PHOTO") {
      router.replace({ pathname: "/create", params: { aiOutputUri: first.uri, aiOutputMode: "PHOTO", aiOutputMimeType: first.mimeType ?? "image/jpeg" }});
    } else {
      router.replace({ pathname: "/create", params: { recordedUri: first.uri, recordedDuration: String(first.duration ?? 0), recordedEffect: effect, recordedSpeed: String(speed) }});
    }
  }

  function selectMode(next: Mode) {
    setMode(next);
    setError("");
  }

  if (!cameraPermission?.granted || !microphonePermission?.granted) {
    return (
      <View style={styles.permission}>
        <Text style={styles.permissionTitle}>Camera access</Text>
        <Text style={styles.permissionText}>TwiTok needs camera and microphone access to create videos.</Text>
        <Pressable style={styles.primary} onPress={async () => { await requestCameraPermission(); await requestMicrophonePermission(); }}>
          <Text style={styles.primaryText}>Allow camera & microphone</Text>
        </Pressable>
        <Pressable onPress={() => router.back()}><Text style={styles.cancel}>Cancel</Text></Pressable>
      </View>
    );
  }

  const durationLabel = durationLimit === 600 ? "10m" : durationLimit + "s";
  const effectOverlay = effect === "VIBRANT" ? styles.effectVibrant : effect === "WARM" ? styles.effectWarm : effect === "COOL" ? styles.effectCool : effect === "NOIR" ? styles.effectNoir : effect === "VINTAGE" ? styles.effectVintage : null;

  return (
    <View style={styles.screen}>
      <CameraView ref={cameraRef} style={styles.camera} facing={facing} mode={mode === "PHOTO" ? "picture" : "video"} flash={flash} mute={muted} zoom={zoom} mirror={facing === "front"} videoQuality="1080p" animateShutter />
      {effectOverlay ? <View pointerEvents="none" style={[styles.effectOverlay, effectOverlay]} /> : null}
      {grid ? <View pointerEvents="none" style={styles.gridOverlay}><View style={styles.gridV1}/><View style={styles.gridV2}/><View style={styles.gridH1}/><View style={styles.gridH2}/></View> : null}

      <View style={[styles.topBar, { paddingTop: Math.max(8, insets.top) }]}>
        <Pressable style={styles.close} onPress={() => router.back()}><Text style={styles.closeText}>×</Text></Pressable>
        <Pressable style={styles.soundPill} onPress={() => router.push({ pathname: "/sounds", params: { select: "1" } })}><Text style={styles.soundText}>♫  Add sound</Text></Pressable>
        <Pressable style={styles.rotate} onPress={() => setFacing(v => v === "back" ? "front" : "back")}><Text style={styles.rotateText}>↻</Text></Pressable>
      </View>

      <View style={[styles.toolRail, { top: insets.top + 88 }]}>
        <Pressable style={styles.tool} onPress={() => { setFacing(v => v === "back" ? "front" : "back"); setTool("flip"); }}><Text style={styles.toolIcon}>↻</Text><Text style={styles.toolText}>Flip</Text></Pressable>
        <Pressable style={styles.tool} onPress={() => { setSpeed(v => v === 2 ? .5 : v === .5 ? 1 : v === 1 ? 1.5 : 2); setTool("speed"); }}><Text style={styles.toolIcon}>{speed}×</Text><Text style={styles.toolText}>Speed</Text></Pressable>
        <Pressable style={styles.tool} onPress={() => { const i = EFFECTS.indexOf(effect); setEffect(EFFECTS[(i + 1) % EFFECTS.length]); setTool("filters"); }}><Text style={styles.toolIcon}>✦</Text><Text style={styles.toolText}>Filters</Text></Pressable>
        <Pressable style={styles.tool} onPress={() => setTool("enhance")}><Text style={styles.toolIcon}>✧</Text><Text style={styles.toolText}>Enhance</Text></Pressable>
        <Pressable style={styles.tool} onPress={() => { setTimer(v => v === 0 ? 3 : v === 3 ? 10 : 0); setTool("timer"); }}><Text style={styles.toolIcon}>◷</Text><Text style={styles.toolText}>{timer ? timer + "s" : "Timer"}</Text></Pressable>
        <Pressable style={styles.tool} onPress={() => { setFlash(v => v === "off" ? "on" : v === "on" ? "auto" : "off"); setTool("flash"); }}><Text style={styles.toolIcon}>{flash === "off" ? "⚡̸" : "⚡"}</Text><Text style={styles.toolText}>Flash</Text></Pressable>
        <Pressable style={styles.tool} onPress={() => { setGrid(v => !v); setTool("grid"); }}><Text style={styles.toolIcon}>▦</Text><Text style={styles.toolText}>Grid</Text></Pressable>
      </View>

      {countdown !== null ? <View style={styles.countdown}><Text style={styles.countdownText}>{countdown}</Text></View> : null}
      {recording ? <View style={[styles.recordingProgress, { top: insets.top }]}><View style={styles.recordingProgressFill}/></View> : null}
      {error ? <View style={styles.errorBox}><Text style={styles.error}>{error}</Text></View> : null}

      <View style={styles.bottomPanel}>
        <View style={styles.lengthRow}>
          {([["10m",600],["60s",60],["15s",15]] as const).map(([label,value]) =>
            <Pressable key={label} onPress={() => { setMode("VIDEO"); setDurationLimit(value); }} style={[styles.lengthItem, mode === "VIDEO" && durationLimit === value && styles.lengthSelected]}>
              <Text style={mode === "VIDEO" && durationLimit === value ? styles.lengthSelectedText : styles.lengthText}>{label}</Text>
            </Pressable>
          )}
          <Pressable onPress={() => selectMode("PHOTO")} style={[styles.lengthItem, mode === "PHOTO" && styles.lengthSelected]}><Text style={mode === "PHOTO" ? styles.lengthSelectedText : styles.lengthText}>PHOTO</Text></Pressable>
          <Pressable onPress={() => selectMode("TEXT")} style={[styles.lengthItem, mode === "TEXT" && styles.lengthSelected]}><Text style={mode === "TEXT" ? styles.lengthSelectedText : styles.lengthText}>TEXT</Text></Pressable>
        </View>

        <View style={styles.captureRow}>
          <Pressable style={styles.galleryButton} onPress={uploadFromGallery} accessibilityLabel="Upload from gallery"><Text style={styles.galleryIcon}>▣</Text><Text style={styles.galleryText}>Upload</Text></Pressable>
          <Pressable accessibilityLabel={mode === "PHOTO" ? "Take photo" : "Record video"} onPress={mode === "PHOTO" ? takePhoto : startRecording} style={[styles.recordOuter, recording && styles.recordingOuter]}>
            <View style={[styles.recordInner, recording && styles.recordingInner]} />
          </Pressable>
          <Pressable style={styles.effectsButton} onPress={() => setEffect(EFFECTS[(EFFECTS.indexOf(effect) + 1) % EFFECTS.length])}><Text style={styles.effectsIcon}>✦</Text><Text style={styles.effectsText}>Effects</Text></Pressable>
        </View>

        <View style={styles.cameraTabs}>
          <Pressable style={styles.cameraTabActive}><Text style={styles.cameraTabActiveText}>Camera</Text></Pressable>
          <Pressable onPress={() => router.push("/live")}><Text style={styles.cameraTabText}>LIVE</Text></Pressable>
          <Pressable onPress={() => router.push("/create")}><Text style={styles.cameraTabText}>Create</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:"#000"},
  camera:{flex:1},
  permission:{flex:1,backgroundColor:"#000",alignItems:"center",justifyContent:"center",padding:28},
  permissionTitle:{color:"#fff",fontSize:28,fontWeight:"900",marginBottom:10},
  permissionText:{color:"#aaa",textAlign:"center",lineHeight:21,marginBottom:24},
  primary:{backgroundColor:"#fe2c55",paddingHorizontal:20,paddingVertical:14,borderRadius:24},
  primaryText:{color:"#fff",fontWeight:"900"},
  cancel:{color:"#aaa",fontWeight:"800",padding:20},
  topBar:{position:"absolute",top:0,left:14,right:14,flexDirection:"row",alignItems:"center",justifyContent:"space-between",zIndex:20},
  close:{width:44,height:44,alignItems:"center",justifyContent:"center"},
  closeText:{color:"#fff",fontSize:42,fontWeight:"300",lineHeight:42,textShadowColor:"#000",textShadowRadius:8},
  soundPill:{paddingHorizontal:20,paddingVertical:12,borderRadius:28,backgroundColor:"rgba(70,70,70,.72)",minWidth:160,alignItems:"center"},
  soundText:{color:"#fff",fontSize:17,fontWeight:"900"},
  rotate:{width:44,height:44,alignItems:"center",justifyContent:"center"},
  rotateText:{color:"#fff",fontSize:34,textShadowColor:"#000",textShadowRadius:8},
  toolRail:{position:"absolute",right:10,alignItems:"center",gap:14,zIndex:20},
  tool:{alignItems:"center",justifyContent:"center",minWidth:48},
  toolIcon:{color:"#fff",fontSize:23,fontWeight:"800",textShadowColor:"#000",textShadowRadius:7},
  toolText:{color:"#fff",fontSize:10,fontWeight:"800",marginTop:2,textShadowColor:"#000",textShadowRadius:5},
  bottomPanel:{position:"absolute",left:0,right:0,bottom:0,paddingBottom:18,paddingTop:12,backgroundColor:"rgba(0,0,0,.30)",zIndex:20},
  lengthRow:{flexDirection:"row",justifyContent:"center",alignItems:"center",gap:16,marginBottom:16},
  lengthItem:{paddingHorizontal:4,paddingVertical:5},
  lengthText:{color:"rgba(255,255,255,.75)",fontSize:14,fontWeight:"800"},
  lengthSelected:{backgroundColor:"rgba(255,255,255,.96)",borderRadius:18,paddingHorizontal:12},
  lengthSelectedText:{color:"#050505",fontSize:14,fontWeight:"900"},
  captureRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:30},
  galleryButton:{width:78,alignItems:"center",justifyContent:"center"},
  galleryIcon:{color:"#fff",fontSize:28,textShadowColor:"#000",textShadowRadius:6},
  galleryText:{color:"#fff",fontSize:12,fontWeight:"900",marginTop:3},
  recordOuter:{width:84,height:84,borderRadius:42,borderWidth:5,borderColor:"#fff",alignItems:"center",justifyContent:"center"},
  recordInner:{width:66,height:66,borderRadius:33,backgroundColor:"#fe2c55"},
  recordingOuter:{borderColor:"#fff"},
  recordingInner:{width:34,height:34,borderRadius:8,backgroundColor:"#fe2c55"},
  effectsButton:{width:78,alignItems:"center",justifyContent:"center"},
  effectsIcon:{color:"#fff",fontSize:28,textShadowColor:"#000",textShadowRadius:6},
  effectsText:{color:"#fff",fontSize:12,fontWeight:"900",marginTop:3},
  cameraTabs:{flexDirection:"row",justifyContent:"center",gap:34,marginTop:14},
  cameraTabActive:{borderBottomWidth:2,borderBottomColor:"#fff",paddingBottom:4},
  cameraTabActiveText:{color:"#fff",fontSize:13,fontWeight:"900"},
  cameraTabText:{color:"rgba(255,255,255,.65)",fontSize:13,fontWeight:"800"},
  countdown:{position:"absolute",top:"38%",left:0,right:0,alignItems:"center",zIndex:30},
  countdownText:{color:"#fff",fontSize:96,fontWeight:"900",textShadowColor:"#000",textShadowRadius:10},
  recordingProgress:{position:"absolute",left:0,right:0,height:4,backgroundColor:"rgba(255,255,255,.22)",zIndex:40},
  recordingProgressFill:{height:"100%",width:"100%",backgroundColor:"#fe2c55"},
  errorBox:{position:"absolute",left:18,right:18,bottom:210,padding:12,borderRadius:12,backgroundColor:"rgba(0,0,0,.72)",zIndex:50},
  error:{color:"#fff",fontSize:12,textAlign:"center"},
  effectOverlay:{position:"absolute",top:0,bottom:0,left:0,right:0,zIndex:5},
  gridOverlay:{position:"absolute",top:0,bottom:0,left:0,right:0,zIndex:6},
  gridV1:{position:"absolute",top:0,bottom:0,left:"33.333%",width:1,backgroundColor:"rgba(255,255,255,.35)"},gridV2:{position:"absolute",top:0,bottom:0,left:"66.666%",width:1,backgroundColor:"rgba(255,255,255,.35)"},gridH1:{position:"absolute",left:0,right:0,top:"33.333%",height:1,backgroundColor:"rgba(255,255,255,.35)"},gridH2:{position:"absolute",left:0,right:0,top:"66.666%",height:1,backgroundColor:"rgba(255,255,255,.35)"},
  effectVibrant:{backgroundColor:"rgba(255,180,80,.12)"},effectWarm:{backgroundColor:"rgba(255,140,40,.18)"},effectCool:{backgroundColor:"rgba(60,150,255,.16)"},effectNoir:{backgroundColor:"rgba(0,0,0,.42)"},effectVintage:{backgroundColor:"rgba(150,90,40,.20)"}
});