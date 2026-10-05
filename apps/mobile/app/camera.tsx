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
  "rectangle.3.group": { ios: "rectangle.3.group", android: "dashboard", web: "dashboard" },
  "person.crop.circle.badge.plus": { ios: "person.crop.circle.badge.plus", android: "person_add", web: "person_add" },
  "doc.text": { ios: "doc.text", android: "description", web: "description" },
  "chevron.up": { ios: "chevron.up", android: "expand_less", web: "expand_less" },
  "chevron.down": { ios: "chevron.down", android: "expand_more", web: "expand_more" },
  "camera.aperture": { ios: "camera.aperture", android: "camera", web: "camera" },
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
  const [timerOpen, setTimerOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [retouch, setRetouch] = useState(true);
  const [teleprompter, setTeleprompter] = useState(false);
  const [railExpanded, setRailExpanded] = useState(true);
  const [selectedLayout, setSelectedLayout] = useState<"OFF" | "2" | "3" | "4" | "6">("OFF");
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
            setError("");
            try {
              if (cameraBlocked) {
                const result = await requestCameraPermission();
                if (!result.granted) return;
              }
              if (mode === "VIDEO" && microphoneBlocked) {
                await requestMicrophonePermission();
              }
            } catch (e) {
              setError(e instanceof Error ? e.message : "Unable to request camera permission.");
            }
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

      <View style={[styles.toolRail, { top: insets.top + 84 }]}>
        <Pressable style={styles.tool} onPress={() => setFacing(v => v === "back" ? "front" : "back")} accessibilityLabel="Flip camera">
          <Icon name="arrow.triangle.2.circlepath.camera" size={31} />
        </Pressable>
        {railExpanded ? <>
          <Pressable style={styles.tool} onPress={() => setFlash(v => v === "off" ? "on" : v === "on" ? "auto" : "off")}>
            <Icon name={flash === "off" ? "bolt.slash" : "bolt.fill"} size={29} /><Text style={styles.toolText}>Flash</Text>
          </Pressable>
          <Pressable style={styles.tool} onPress={() => setTimerOpen(v => !v)}>
            <Icon name="timer" size={29} /><Text style={styles.toolText}>{timer ? timer + "s" : "Timer"}</Text>
          </Pressable>
          <Pressable style={styles.tool} onPress={() => setLayoutOpen(v => !v)}>
            <Icon name="rectangle.3.group" size={30} /><Text style={styles.toolText}>Layout</Text>
            {selectedLayout !== "OFF" ? <View style={styles.toolBadge}><Text style={styles.toolBadgeText}>✓</Text></View> : null}
          </Pressable>
          <Pressable style={styles.tool} onPress={() => setRetouch(v => !v)}>
            <Icon name="person.crop.circle.badge.plus" size={30} /><Text style={styles.toolText}>Retouch</Text>
            {retouch ? <View style={styles.toolBadge}><Text style={styles.toolBadgeText}>✓</Text></View> : null}
          </Pressable>
          <Pressable style={styles.tool} onPress={() => setTeleprompter(v => !v)}>
            <Icon name="doc.text" size={30} /><Text style={styles.toolText}>Teleprompter</Text>
          </Pressable>
          <Pressable style={styles.tool} onPress={() => { const i = EFFECTS.indexOf(effect); setEffect(EFFECTS[(i + 1) % EFFECTS.length]); }}>
            <Icon name="wand.and.stars" size={30} /><Text style={styles.toolText}>Filters</Text>
          </Pressable>
        </> : null}
        <Pressable style={styles.expandButton} onPress={() => setRailExpanded(v => !v)} accessibilityLabel={railExpanded ? "Collapse camera tools" : "Expand camera tools"}>
          <Icon name={railExpanded ? "chevron.up" : "chevron.down"} size={28} />
        </Pressable>
      </View>

      {countdown !== null ? <View style={styles.countdown}><Text style={styles.countdownText}>{countdown}</Text></View> : null}
      {recording ? <View style={[styles.recordingProgress, { top: insets.top }]}><View style={styles.recordingProgressFill} /></View> : null}
      {error ? <View style={styles.errorBox}><Text style={styles.error}>{error}</Text></View> : null}

      <View style={styles.bottomCameraUi}>
        <View style={styles.effectStrip}>
          {EFFECTS.slice(0, 4).map(item => (
            <Pressable key={item} onPress={() => setEffect(item)} style={[styles.effectThumb, effect === item && styles.effectThumbSelected]}>
              <View style={[styles.effectThumbFill, item === "VIBRANT" && styles.effectVibrant, item === "WARM" && styles.effectWarm, item === "COOL" && styles.effectCool, item === "NOIR" && styles.effectNoir]} />
            </Pressable>
          ))}
        </View>
        <View style={styles.captureRow}>
          <Pressable style={styles.galleryButton} onPress={uploadFromGallery} accessibilityLabel="Open gallery">
            <View style={styles.galleryThumb}><Icon name="photo.on.rectangle" size={27} /></View>
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
          <Pressable style={styles.cameraModeButton} onPress={() => setMode(v => v === "VIDEO" ? "PHOTO" : "VIDEO")}>
            <Text style={styles.cameraModeText}>{mode === "PHOTO" ? "Photo" : "Camera"}</Text>
          </Pressable>
        </View>
        <View style={styles.modeRow}>
          {([["10m",600],["60s",60],["15s",15]] as const).map(([label,value]) => (
            <Pressable key={label} onPress={() => { setMode("VIDEO"); setDurationLimit(value); }} style={styles.modeItem}>
              <Text style={mode === "VIDEO" && durationLimit === value ? styles.modeSelected : styles.modeText}>{label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => selectMode("PHOTO")} style={styles.modeItem}><Text style={mode === "PHOTO" ? styles.modeSelected : styles.modeText}>Photo</Text></Pressable>
          <Pressable onPress={() => setMode("TEXT")} style={styles.modeItem}><Text style={mode === "TEXT" ? styles.modeSelected : styles.modeText}>Text</Text></Pressable>
        </View>
      </View>

      {timerOpen ? <View style={styles.bottomSheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setTimerOpen(false)} />
        <View style={styles.bottomSheet}>
          <Text style={styles.sheetTitle}>Set countdown</Text>
          <View style={styles.segmented}>
            {[0,3,10].map(value => <Pressable key={value} onPress={() => { setTimer(value as 0|3|10); setTimerOpen(false); }} style={[styles.segment, timer === value && styles.segmentSelected]}><Text style={timer === value ? styles.segmentSelectedText : styles.segmentText}>{value === 0 ? "Off" : value + "s"}</Text></Pressable>)}
          </View>
          <Text style={styles.sheetLabel}>Recording limit</Text>
          <View style={styles.durationChoices}>{[15,60,600].map(value => <Pressable key={value} onPress={() => setDurationLimit(value as 15|60|600)} style={[styles.durationChoice, durationLimit === value && styles.durationChoiceSelected]}><Text style={styles.durationChoiceText}>{value === 600 ? "10m" : value + "s"}</Text></Pressable>)}</View>
          <Pressable style={styles.sheetPrimary} onPress={() => setTimerOpen(false)}><Text style={styles.sheetPrimaryText}>Done</Text></Pressable>
        </View>
      </View> : null}

      {layoutOpen ? <View style={styles.layoutPopover}>
        {(["OFF","2","3","4","6"] as const).map(value => <Pressable key={value} onPress={() => { setSelectedLayout(value); setGrid(value !== "OFF"); setLayoutOpen(false); }} style={[styles.layoutChoice, selectedLayout === value && styles.layoutChoiceSelected]}>
          <View style={value === "OFF" ? styles.layoutIconOff : styles.layoutIcon}><Text style={styles.layoutIconText}>{value === "OFF" ? "—" : value === "2" ? "▥" : value === "3" ? "▤" : value === "4" ? "⊞" : "▦"}</Text></View>
        </Pressable>)}
      </View> : null}

      {teleprompter ? <View style={styles.teleprompter}><Text style={styles.teleprompterTitle}>Teleprompter</Text><Text style={styles.teleprompterText}>Add your script before recording.</Text><Pressable onPress={() => setTeleprompter(false)} style={styles.teleprompterClose}><Text style={styles.teleprompterCloseText}>Close</Text></Pressable></View> : null}
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
  toolBadge:{position:"absolute",right:0,top:0,width:18,height:18,borderRadius:9,backgroundColor:"#fe2c55",alignItems:"center",justifyContent:"center"},
  toolBadgeText:{color:"#fff",fontSize:11,fontWeight:"900"},
  expandButton:{width:50,height:42,alignItems:"center",justifyContent:"center",marginTop:2},
  quickActions:{position:"absolute",left:10,right:10,bottom:205,flexDirection:"row",justifyContent:"space-around",alignItems:"center",paddingVertical:8,paddingHorizontal:6,borderRadius:18,backgroundColor:"rgba(0,0,0,.52)",zIndex:25},
  quickAction:{minWidth:58,alignItems:"center",justifyContent:"center",paddingVertical:6,paddingHorizontal:5,borderRadius:12},
  quickActionActive:{backgroundColor:"rgba(255,255,255,.18)"},
  quickActionText:{color:"#fff",fontSize:10,fontWeight:"900",marginTop:3},
  liveDot:{color:"#fe2c55",fontSize:11,fontWeight:"900"},
  bottomPanel:{position:"absolute",left:0,right:0,bottom:0,paddingBottom:18,paddingTop:12,backgroundColor:"rgba(0,0,0,.30)",zIndex:20},
  lengthRow:{flexDirection:"row",justifyContent:"center",alignItems:"center",gap:16,marginBottom:16},
  lengthItem:{paddingHorizontal:4,paddingVertical:5},
  lengthText:{color:"rgba(255,255,255,.75)",fontSize:14,fontWeight:"800"},
  lengthSelected:{backgroundColor:"rgba(255,255,255,.96)",borderRadius:18,paddingHorizontal:12},
  lengthSelectedText:{color:"#050505",fontSize:14,fontWeight:"900"},
  bottomCameraUi:{position:"absolute",left:0,right:0,bottom:0,paddingBottom:18,paddingTop:8,backgroundColor:"rgba(0,0,0,.18)",zIndex:20},
  effectStrip:{flexDirection:"row",justifyContent:"center",gap:12,marginBottom:12},
  effectThumb:{width:42,height:42,borderRadius:21,borderWidth:2,borderColor:"rgba(255,255,255,.65)",overflow:"hidden",backgroundColor:"#333"},
  effectThumbSelected:{borderColor:"#fff",borderWidth:3},
  effectThumbFill:{flex:1,backgroundColor:"#333"},
  captureRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:24},
  sideAction:{width:78,alignItems:"center",justifyContent:"center"},
  sideText:{color:"#fff",fontSize:12,fontWeight:"900",marginTop:4},
  holdHint:{position:"absolute",bottom:92,color:"rgba(255,255,255,.82)",fontSize:10,fontWeight:"800"},
  cameraTabs:{flexDirection:"row",justifyContent:"center",gap:34,marginTop:14},
  cameraTabActive:{borderBottomWidth:2,borderBottomColor:"#fff",paddingBottom:4},
  cameraTabActiveText:{color:"#fff",fontSize:13,fontWeight:"900"},
  cameraTabText:{color:"rgba(255,255,255,.65)",fontSize:13,fontWeight:"800"},
  galleryButton:{width:72,alignItems:"center",justifyContent:"center"},
  galleryThumb:{width:54,height:54,borderRadius:10,borderWidth:2,borderColor:"#fff",backgroundColor:"rgba(0,0,0,.48)",alignItems:"center",justifyContent:"center"},
  cameraModeButton:{width:72,alignItems:"center",justifyContent:"center"},
  cameraModeText:{color:"#fff",fontSize:14,fontWeight:"800"},
  recordOuter:{width:92,height:92,borderRadius:46,borderWidth:5,borderColor:"#fff",alignItems:"center",justifyContent:"center",backgroundColor:"rgba(255,255,255,.08)"},
  recordInner:{width:72,height:72,borderRadius:36,backgroundColor:"#fff"},
  recordingOuter:{borderColor:"#fff"},
  recordingInner:{width:38,height:38,borderRadius:9,backgroundColor:"#fe2c55"},
  modeRow:{flexDirection:"row",justifyContent:"center",alignItems:"center",gap:17,marginTop:10},
  modeItem:{paddingVertical:5,paddingHorizontal:3},
  modeText:{color:"rgba(255,255,255,.72)",fontSize:12,fontWeight:"800"},
  modeSelected:{color:"#fff",fontSize:12,fontWeight:"900"},
  bottomSheetBackdrop:{position:"absolute",inset:0,zIndex:60,backgroundColor:"rgba(0,0,0,.22)",justifyContent:"flex-end"},
  bottomSheet:{backgroundColor:"#2b2b2d",borderTopLeftRadius:28,borderTopRightRadius:28,padding:24,paddingBottom:32},
  sheetTitle:{color:"#fff",fontSize:22,fontWeight:"900",marginBottom:18},
  segmented:{flexDirection:"row",backgroundColor:"#444",borderRadius:18,padding:3},
  segment:{flex:1,paddingVertical:12,alignItems:"center",borderRadius:15},
  segmentSelected:{backgroundColor:"#fff"},
  segmentText:{color:"#aaa",fontSize:16,fontWeight:"800"},
  segmentSelectedText:{color:"#111",fontSize:16,fontWeight:"900"},
  sheetLabel:{color:"#fff",fontSize:18,fontWeight:"800",marginTop:24,marginBottom:12},
  durationChoices:{flexDirection:"row",gap:10},
  durationChoice:{flex:1,borderWidth:1,borderColor:"#666",borderRadius:14,paddingVertical:13,alignItems:"center"},
  durationChoiceSelected:{backgroundColor:"#fff",borderColor:"#fff"},
  durationChoiceText:{color:"#fff",fontWeight:"900"},
  durationChoiceSelectedText:{color:"#111"},
  sheetPrimary:{marginTop:22,backgroundColor:"#fe2c55",borderRadius:16,paddingVertical:15,alignItems:"center"},
  sheetPrimaryText:{color:"#fff",fontWeight:"900",fontSize:16},
  layoutPopover:{position:"absolute",right:68,top:210,zIndex:70,backgroundColor:"#252526",borderRadius:18,padding:8,gap:5},
  layoutChoice:{width:88,height:56,alignItems:"center",justifyContent:"center",borderRadius:5},
  layoutChoiceSelected:{backgroundColor:"#fff"},
  layoutIcon:{width:38,height:38,borderWidth:2,borderColor:"#fff",alignItems:"center",justifyContent:"center",borderRadius:6},
  layoutIconOff:{width:38,height:38,alignItems:"center",justifyContent:"center"},
  layoutIconText:{color:"#fff",fontSize:27,fontWeight:"700"},
  teleprompter:{position:"absolute",left:20,right:80,top:120,zIndex:55,backgroundColor:"rgba(20,20,20,.9)",borderRadius:18,padding:20},
  teleprompterTitle:{color:"#fff",fontSize:18,fontWeight:"900"},
  teleprompterText:{color:"#bbb",marginTop:8},
  teleprompterClose:{alignSelf:"flex-end",marginTop:15},
  teleprompterCloseText:{color:"#fff",fontWeight:"900"},
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
