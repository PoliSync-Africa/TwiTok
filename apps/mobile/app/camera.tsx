import { useEffect, useRef, useState } from "react";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Effect = "NONE" | "VIBRANT" | "WARM" | "COOL" | "NOIR" | "VINTAGE";
type Flash = "off" | "on" | "auto";
type Facing = "front" | "back";
type Mode = "VIDEO" | "PHOTO" | "TEXT";

const EFFECTS: Effect[] = ["NONE", "VIBRANT", "WARM", "COOL", "NOIR", "VINTAGE"];

const ICONS: Record<string, { ios: string; android: string; web: string }> = {
  "camera.fill": { ios: "camera.fill", android: "camera_alt", web: "camera_alt" },
  "mic.fill": { ios: "mic.fill", android: "mic", web: "mic" },
  xmark: { ios: "xmark", android: "close", web: "close" },
  "music.note": { ios: "music.note", android: "music_note", web: "music_note" },
  "camera.rotate": { ios: "camera.rotate", android: "flip_camera_android", web: "flip_camera_android" },
  "arrow.triangle.2.circlepath.camera": { ios: "arrow.triangle.2.circlepath.camera", android: "flip_camera_android", web: "flip_camera_android" },
  "wand.and.stars": { ios: "wand.and.stars", android: "auto_awesome", web: "auto_awesome" },
  "speaker.slash.fill": { ios: "speaker.slash.fill", android: "volume_off", web: "volume_off" },
  "speaker.wave.2.fill": { ios: "speaker.wave.2.fill", android: "volume_up", web: "volume_up" },
  timer: { ios: "timer", android: "timer", web: "timer" },
  "bolt.slash": { ios: "bolt.slash", android: "flash_off", web: "flash_off" },
  "bolt.fill": { ios: "bolt.fill", android: "flash_on", web: "flash_on" },
  grid: { ios: "grid", android: "grid_4x4", web: "grid_4x4" },
  "photo.on.rectangle": { ios: "photo.on.rectangle", android: "photo_library", web: "photo_library" },
};

function Icon({ name, size = 24, color = "#fff" }: { name: string; size?: number; color?: string }) {
  const icon = ICONS[name] ?? { ios: "circle", android: "circle", web: "circle" };
  return <SymbolView name={icon as any} tintColor={color} size={size} fallback={<Text style={{ color, fontSize: size, lineHeight: size }}>•</Text>} />;
}

export default function CameraStudioScreen() {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView | null>(null);
  const recordingRef = useRef<Promise<{ uri: string } | undefined> | null>(null);
  const holdRef = useRef(false);
  const recordingStartedRef = useRef(false);
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
  const [error, setError] = useState("");
  const { soundId: incomingSoundId, soundTitle: incomingSoundTitle } = useLocalSearchParams<{ soundId?: string; soundTitle?: string }>();
  const [soundId, setSoundId] = useState(String(incomingSoundId ?? ""));
  const [soundTitle, setSoundTitle] = useState(String(incomingSoundTitle ?? ""));
  useEffect(() => { if (incomingSoundId) setSoundId(String(incomingSoundId)); if (incomingSoundTitle) setSoundTitle(String(incomingSoundTitle)); }, [incomingSoundId, incomingSoundTitle]);

  useEffect(() => {
    if (cameraPermission && !cameraPermission.granted) void requestCameraPermission();
  }, [cameraPermission?.granted]);

  useEffect(() => {
    if (mode === "VIDEO" && microphonePermission && !microphonePermission.granted) {
      void requestMicrophonePermission();
    }
  }, [mode, microphonePermission?.granted]);

  async function startRecording() {
    if (recording || countdown !== null || !cameraRef.current || mode !== "VIDEO") return;
    if (!microphonePermission?.granted) { setError("Microphone access is needed for video recording."); return; }
    if (!holdRef.current) return;
    setError("");
    if (timer > 0) {
      for (let value = timer; value > 0; value--) {
        if (!holdRef.current) return;
        setCountdown(value);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      setCountdown(null);
      if (!holdRef.current) return;
    }
    if (!cameraRef.current || !holdRef.current) return;
    setRecording(true);
    recordingStartedRef.current = true;
    const started = Date.now();
    recordingRef.current = cameraRef.current.recordAsync({ maxDuration: durationLimit });
    try {
      const result = await recordingRef.current;
      if (!result?.uri) throw new Error("Camera did not return a video.");
      const duration = Math.max(1, Math.min(durationLimit * 1000, Date.now() - started));
      router.replace({ pathname: "/create", params: {
        recordedUri: result.uri, recordedDuration: String(duration),
        recordedEffect: effect, recordedSpeed: String(speed),
        soundId, soundTitle, autoStudio: "1"
      }});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to record video.");
    } finally {
      recordingRef.current = null; recordingStartedRef.current = false; setRecording(false);
    }
  }

  function beginVideoHold() {
    if (mode !== "VIDEO" || recording || countdown !== null) return;
    holdRef.current = true;
    void startRecording();
  }

  function endVideoHold() {
    holdRef.current = false;
    if (countdown !== null && !recordingStartedRef.current) setCountdown(null);
    if (recordingStartedRef.current && cameraRef.current) cameraRef.current.stopRecording();
  }

  async function takePhoto() {
    if (!cameraRef.current || mode !== "PHOTO" || recording) return;
    setError("");
    try {
      const result = await cameraRef.current.takePictureAsync({ quality: 1, shutterSound: true });
      if (result?.uri) {
        router.replace({
          pathname: "/create",
          params: { aiOutputUri: result.uri, aiOutputMode: "PHOTO", aiOutputMimeType: "image/jpeg" },
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to take photo.");
    }
  }

  async function uploadFromGallery() {
    setError("");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: false,
      quality: 1,
      videoMaxDuration: 600,
    });
    if (result.canceled || !result.assets.length) return;
    const first = result.assets[0];
    const isPhoto = first.type === "image";
    if (isPhoto) {
      router.replace({ pathname: "/create", params: {
        aiOutputUri: first.uri,
        aiOutputMode: "PHOTO",
        aiOutputMimeType: first.mimeType ?? "image/jpeg",
        soundId, soundTitle, autoStudio: "1"
      }});
      return;
    }
    router.replace({ pathname: "/create", params: {
      recordedUri: first.uri,
      recordedDuration: String(first.duration ?? 0),
      recordedEffect: effect,
      recordedSpeed: String(speed),
      soundId, soundTitle, autoStudio: "1"
    }});
  }

  function selectMode(next: Mode) {
    setMode(next);
    setError("");
  }

  const cameraBlocked = !cameraPermission?.granted;
  const microphoneBlocked = mode === "VIDEO" && !microphonePermission?.granted;

  if (cameraBlocked || microphoneBlocked) {
    return (
      <View style={styles.permission}>
        <View style={styles.permissionIcon}><Icon name={cameraBlocked ? "camera.fill" : "mic.fill"} size={34} /></View>
        <Text style={styles.permissionTitle}>{cameraBlocked ? "Camera access" : "Microphone access"}</Text>
        <Text style={styles.permissionText}>
          {cameraBlocked
            ? "TwiTok needs camera access to create videos and photos."
            : "TwiTok needs microphone access to record video with sound."}
        </Text>
        <Pressable
          style={styles.primary}
          onPress={async () => {
            if (cameraBlocked) await requestCameraPermission();
            if (mode === "VIDEO" && microphoneBlocked) await requestMicrophonePermission();
          }}
        >
          <Text style={styles.primaryText}>Allow access</Text>
        </Pressable>
        <Pressable style={styles.settingsButton} onPress={() => void Linking.openSettings()}>
          <Text style={styles.settingsText}>Open Settings</Text>
        </Pressable>
        <Pressable onPress={() => router.back()}><Text style={styles.cancel}>Cancel</Text></Pressable>
      </View>
    );
  }

  const effectOverlay =
    effect === "VIBRANT" ? styles.effectVibrant :
    effect === "WARM" ? styles.effectWarm :
    effect === "COOL" ? styles.effectCool :
    effect === "NOIR" ? styles.effectNoir :
    effect === "VINTAGE" ? styles.effectVintage : null;

  return (
    <View style={styles.screen}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        mode={mode === "PHOTO" ? "picture" : "video"}
        flash={flash}
        mute={muted}
        zoom={zoom}
        mirror={facing === "front"}
        videoQuality="1080p"
        animateShutter
      />

      {effectOverlay ? <View pointerEvents="none" style={[styles.effectOverlay, effectOverlay]} /> : null}
      {grid ? (
        <View pointerEvents="none" style={styles.gridOverlay}>
          <View style={styles.gridV1} /><View style={styles.gridV2} />
          <View style={styles.gridH1} /><View style={styles.gridH2} />
        </View>
      ) : null}

      <View style={[styles.topBar, { paddingTop: Math.max(8, insets.top) }]}>
        <Pressable style={styles.close} onPress={() => router.back()} accessibilityLabel="Close camera">
          <Icon name="xmark" size={25} />
        </Pressable>
        <Pressable style={styles.soundPill} onPress={() => router.push({ pathname: "/sounds", params: { select: "1", returnTo: "/camera" } })}>
          <Icon name="music.note" size={17} />
          <Text style={styles.soundText} numberOfLines={1}>{soundTitle || "Add sound"}</Text>
        </Pressable>
        <Pressable style={styles.rotate} onPress={() => setFacing(v => v === "back" ? "front" : "back")} accessibilityLabel="Flip camera">
          <Icon name="camera.rotate" size={25} />
        </Pressable>
      </View>

      <View style={[styles.toolRail, { top: insets.top + 88 }]}>
        <Pressable style={styles.tool} onPress={() => setFacing(v => v === "back" ? "front" : "back")}>
          <Icon name="arrow.triangle.2.circlepath.camera" size={22} /><Text style={styles.toolText}>Flip</Text>
        </Pressable>
        <Pressable style={styles.tool} onPress={() => setSpeed(v => v === 2 ? .5 : v === .5 ? 1 : v === 1 ? 1.5 : 2)}>
          <Text style={styles.speedText}>{speed}×</Text><Text style={styles.toolText}>Speed</Text>
        </Pressable>
        <Pressable style={styles.tool} onPress={() => { const i = EFFECTS.indexOf(effect); setEffect(EFFECTS[(i + 1) % EFFECTS.length]); }}>
          <Icon name="wand.and.stars" size={22} /><Text style={styles.toolText}>Filters</Text>
        </Pressable>
        <Pressable style={styles.tool} onPress={() => setMuted(v => !v)}>
          <Icon name={muted ? "speaker.slash.fill" : "speaker.wave.2.fill"} size={22} /><Text style={styles.toolText}>{muted ? "Muted" : "Sound"}</Text>
        </Pressable>
        <Pressable style={styles.tool} onPress={() => setTimer(v => v === 0 ? 3 : v === 3 ? 10 : 0)}>
          <Icon name="timer" size={22} /><Text style={styles.toolText}>{timer ? timer + "s" : "Timer"}</Text>
        </Pressable>
        <Pressable style={styles.tool} onPress={() => setFlash(v => v === "off" ? "on" : v === "on" ? "auto" : "off")}>
          <Icon name={flash === "off" ? "bolt.slash" : "bolt.fill"} size={22} /><Text style={styles.toolText}>Flash</Text>
        </Pressable>
        <Pressable style={styles.tool} onPress={() => setGrid(v => !v)}>
          <Icon name="grid" size={22} /><Text style={styles.toolText}>Grid</Text>
        </Pressable>
      </View>

      {countdown !== null ? <View style={styles.countdown}><Text style={styles.countdownText}>{countdown}</Text></View> : null}
      {recording ? <View style={[styles.recordingProgress, { top: insets.top }]}><View style={styles.recordingProgressFill} /></View> : null}
      {error ? <View style={styles.errorBox}><Text style={styles.error}>{error}</Text></View> : null}

      <View style={styles.quickActions}>
        <Pressable style={[styles.quickAction, mode === "PHOTO" && styles.quickActionActive]} onPress={() => selectMode("PHOTO")} accessibilityLabel="Photo mode"><Icon name="camera.fill" size={21} /><Text style={styles.quickActionText}>Photo</Text></Pressable>
        <Pressable style={[styles.quickAction, mode === "VIDEO" && styles.quickActionActive]} onPress={() => selectMode("VIDEO")} accessibilityLabel="Video mode"><Icon name="camera.fill" size={21} /><Text style={styles.quickActionText}>Video</Text></Pressable>
        <Pressable style={styles.quickAction} onPress={uploadFromGallery} accessibilityLabel="Gallery upload"><Icon name="photo.on.rectangle" size={21} /><Text style={styles.quickActionText}>Gallery</Text></Pressable>
        <Pressable style={styles.quickAction} onPress={() => router.push("/create")} accessibilityLabel="Create"><Icon name="wand.and.stars" size={21} /><Text style={styles.quickActionText}>Create</Text></Pressable>
        <Pressable style={styles.quickAction} onPress={() => router.push("/live")} accessibilityLabel="LIVE"><Text style={styles.liveDot}>LIVE</Text><Text style={styles.quickActionText}>LIVE</Text></Pressable>
      </View>

      <View style={styles.bottomPanel}>
        <View style={styles.lengthRow}>
          {([["10m", 600], ["60s", 60], ["15s", 15]] as const).map(([label, value]) => (
            <Pressable key={label} onPress={() => { setMode("VIDEO"); setDurationLimit(value); }} style={[styles.lengthItem, mode === "VIDEO" && durationLimit === value && styles.lengthSelected]}>
              <Text style={mode === "VIDEO" && durationLimit === value ? styles.lengthSelectedText : styles.lengthText}>{label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => selectMode("PHOTO")} style={[styles.lengthItem, mode === "PHOTO" && styles.lengthSelected]}>
            <Text style={mode === "PHOTO" ? styles.lengthSelectedText : styles.lengthText}>PHOTO</Text>
          </Pressable>
          <Pressable onPress={() => selectMode("TEXT")} style={[styles.lengthItem, mode === "TEXT" && styles.lengthSelected]}>
            <Text style={mode === "TEXT" ? styles.lengthSelectedText : styles.lengthText}>TEXT</Text>
          </Pressable>
        </View>

        <View style={styles.captureRow}>
          <Pressable style={styles.sideAction} onPress={uploadFromGallery} accessibilityLabel="Upload from gallery">
            <Icon name="photo.on.rectangle" size={27} /><Text style={styles.sideText}>Upload</Text>
          </Pressable>

          <Pressable
            accessibilityLabel={mode === "PHOTO" ? "Take photo" : "Hold to record video"}
            onPress={mode === "PHOTO" ? takePhoto : undefined}
            onPressIn={mode === "VIDEO" ? beginVideoHold : undefined}
            onPressOut={mode === "VIDEO" ? endVideoHold : undefined}
            style={[styles.recordOuter, recording && styles.recordingOuter]}
          >
            <View style={[styles.recordInner, recording && styles.recordingInner]} />
          </Pressable>
          <Text style={styles.holdHint}>{mode === "VIDEO" ? (recording ? "Release to stop" : "Hold to record") : "Tap to capture"}</Text>

          <Pressable style={styles.sideAction} onPress={() => setEffect(EFFECTS[(EFFECTS.indexOf(effect) + 1) % EFFECTS.length])}>
            <Icon name="wand.and.stars" size={27} /><Text style={styles.sideText}>Effects</Text>
          </Pressable>
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
  permissionIcon:{width:74,height:74,borderRadius:37,backgroundColor:"#181818",alignItems:"center",justifyContent:"center",marginBottom:18},
  permissionTitle:{color:"#fff",fontSize:28,fontWeight:"900",marginBottom:10},
  permissionText:{color:"#aaa",textAlign:"center",lineHeight:21,marginBottom:24,maxWidth:340},
  primary:{backgroundColor:"#fe2c55",paddingHorizontal:28,paddingVertical:14,borderRadius:24},
  primaryText:{color:"#fff",fontWeight:"900"},
  settingsButton:{padding:14},
  settingsText:{color:"#fff",fontWeight:"800"},
  cancel:{color:"#777",fontWeight:"800",padding:14},
  topBar:{position:"absolute",top:0,left:14,right:14,flexDirection:"row",alignItems:"center",justifyContent:"space-between",zIndex:20},
  close:{width:44,height:44,alignItems:"center",justifyContent:"center"},
  soundPill:{paddingHorizontal:18,paddingVertical:11,borderRadius:28,backgroundColor:"rgba(25,25,25,.72)",minWidth:155,alignItems:"center",flexDirection:"row",justifyContent:"center",gap:7},
  soundText:{color:"#fff",fontSize:16,fontWeight:"900"},
  rotate:{width:44,height:44,alignItems:"center",justifyContent:"center"},
  toolRail:{position:"absolute",right:10,alignItems:"center",gap:14,zIndex:20},
  tool:{alignItems:"center",justifyContent:"center",minWidth:52},
  toolText:{color:"#fff",fontSize:10,fontWeight:"800",marginTop:3,textShadowColor:"#000",textShadowRadius:5},
  speedText:{color:"#fff",fontSize:16,fontWeight:"900",textShadowColor:"#000",textShadowRadius:6},
  bottomPanel:{position:"absolute",left:0,right:0,bottom:0,paddingBottom:18,paddingTop:12,backgroundColor:"rgba(0,0,0,.30)",zIndex:20},
  quickActions:{position:"absolute",left:10,right:10,bottom:205,flexDirection:"row",justifyContent:"space-around",alignItems:"center",paddingVertical:8,paddingHorizontal:6,borderRadius:18,backgroundColor:"rgba(0,0,0,.52)"},
  quickAction:{minWidth:58,alignItems:"center",justifyContent:"center",paddingVertical:6,paddingHorizontal:5,borderRadius:12},
  quickActionActive:{backgroundColor:"rgba(255,255,255,.18)"},
  quickActionText:{color:"#fff",fontSize:10,fontWeight:"900",marginTop:3},
  liveDot:{color:"#fe2c55",fontSize:11,fontWeight:"900"},
  lengthRow:{flexDirection:"row",justifyContent:"center",alignItems:"center",gap:16,marginBottom:16},
  lengthItem:{paddingHorizontal:4,paddingVertical:5},
  lengthText:{color:"rgba(255,255,255,.75)",fontSize:14,fontWeight:"800"},
  lengthSelected:{backgroundColor:"rgba(255,255,255,.96)",borderRadius:18,paddingHorizontal:12},
  lengthSelectedText:{color:"#050505",fontSize:14,fontWeight:"900"},
  captureRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:30},
  sideAction:{width:78,alignItems:"center",justifyContent:"center"},
  sideText:{color:"#fff",fontSize:12,fontWeight:"900",marginTop:4},
  holdHint:{position:"absolute",bottom:92,color:"rgba(255,255,255,.82)",fontSize:10,fontWeight:"800"},
  recordOuter:{width:84,height:84,borderRadius:42,borderWidth:5,borderColor:"#fff",alignItems:"center",justifyContent:"center"},
  recordInner:{width:66,height:66,borderRadius:33,backgroundColor:"#fe2c55"},
  recordingOuter:{borderColor:"#fff"},
  recordingInner:{width:34,height:34,borderRadius:8,backgroundColor:"#fe2c55"},
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
  gridV1:{position:"absolute",top:0,bottom:0,left:"33.333%",width:1,backgroundColor:"rgba(255,255,255,.35)"},
  gridV2:{position:"absolute",top:0,bottom:0,left:"66.666%",width:1,backgroundColor:"rgba(255,255,255,.35)"},
  gridH1:{position:"absolute",left:0,right:0,top:"33.333%",height:1,backgroundColor:"rgba(255,255,255,.35)"},
  gridH2:{position:"absolute",left:0,right:0,top:"66.666%",height:1,backgroundColor:"rgba(255,255,255,.35)"},
  effectVibrant:{backgroundColor:"rgba(255,180,80,.12)"},
  effectWarm:{backgroundColor:"rgba(255,140,40,.18)"},
  effectCool:{backgroundColor:"rgba(60,150,255,.16)"},
  effectNoir:{backgroundColor:"rgba(0,0,0,.42)"},
  effectVintage:{backgroundColor:"rgba(150,90,40,.20)"},
});
