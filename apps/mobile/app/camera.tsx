import { useEffect, useRef, useState } from "react";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

const EFFECTS = ["NONE","VIBRANT","WARM","COOL","NOIR","VINTAGE"] as const;
type Effect = typeof EFFECTS[number];
type Flash = "off" | "on" | "auto";
type Facing = "front" | "back";

export default function CameraStudioScreen() {
  const cameraRef = useRef<CameraView | null>(null);
  const recordingRef = useRef<Promise<{ uri: string } | undefined> | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const [facing, setFacing] = useState<Facing>("back");
  const [flash, setFlash] = useState<Flash>("off");
  const [muted, setMuted] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [timer, setTimer] = useState<0 | 3 | 10>(0);
  const [durationLimit, setDurationLimit] = useState<15 | 60 | 600>(60);
  const [speed, setSpeed] = useState<0.5 | 1 | 1.5 | 2>(1);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const recordingStartedAt = useRef<number | null>(null);
  const [effect, setEffect] = useState<Effect>("NONE");
  const [grid, setGrid] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!recording) {
      setElapsedMs(0);
      recordingStartedAt.current = null;
      return;
    }
    recordingStartedAt.current = Date.now();
    const interval = setInterval(() => {
      const started = recordingStartedAt.current;
      if (started) setElapsedMs(Math.min(durationLimit * 1000, Date.now() - started));
    }, 100);
    return () => clearInterval(interval);
  }, [recording, durationLimit]);

  useEffect(() => {
    if (cameraPermission && !cameraPermission.granted) requestCameraPermission();
  }, [cameraPermission?.granted]);

  useEffect(() => {
    if (microphonePermission && !microphonePermission.granted) requestMicrophonePermission();
  }, [microphonePermission?.granted]);

  async function startRecording() {
    if (recording || countdown !== null || !cameraRef.current) return;
    setError("");

    if (timer > 0) {
      for (let value = timer; value > 0; value--) {
        setCountdown(value);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      setCountdown(null);
    }

    if (!cameraRef.current) return;
    setElapsedMs(0);
    setRecording(true);
    recordingRef.current = cameraRef.current.recordAsync({ maxDuration: durationLimit });
    try {
      const result = await recordingRef.current;
      if (!result?.uri) throw new Error("Camera did not return a video.");
      router.replace({
        pathname: "/create",
        params: {
          recordedUri: result.uri,
          recordedDuration: String(Math.max(1, Math.round(elapsedMs || durationLimit * 1000))),
          recordedEffect: effect,
          recordedSpeed: String(speed)
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to record video.");
    } finally {
      recordingRef.current = null;
      setRecording(false);
    }
  }

  function stopRecording() {
    if (!recording) return;
    cameraRef.current?.stopRecording();
  }

  if (!cameraPermission?.granted || !microphonePermission?.granted) {
    return (
      <View style={styles.permission}>
        <Text style={styles.permissionTitle}>Camera access</Text>
        <Text style={styles.permissionText}>
          TwiTok needs camera and microphone access to record videos.
        </Text>
        <Pressable style={styles.primary} onPress={async () => {
          await requestCameraPermission();
          await requestMicrophonePermission();
        }}>
          <Text style={styles.primaryText}>Allow camera & microphone</Text>
        </Pressable>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  const durationLabel = durationLimit === 600 ? "10m" : durationLimit + "s";

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
        mode="video"
        flash={flash}
        mute={muted}
        zoom={zoom}
        mirror={facing === "front"}
        videoQuality="1080p"
        animateShutter
      />
      {effectOverlay ? <View pointerEvents="none" style={[styles.effectOverlay, effectOverlay]} /> : null}
      {grid ? <View pointerEvents="none" style={styles.gridOverlay}><View style={styles.gridV1}/><View style={styles.gridV2}/><View style={styles.gridH1}/><View style={styles.gridH2}/></View> : null}

      <View style={styles.topBar}>
        <Pressable style={styles.circle} onPress={() => router.back()}>
          <Text style={styles.icon}>×</Text>
        </Pressable>
        <Text style={styles.title}>Camera</Text>
        <Pressable style={styles.circle} onPress={() => setFlash(v => v === "off" ? "on" : v === "on" ? "auto" : "off")}>
          <Text style={styles.icon}>{flash === "on" ? "⚡" : flash === "auto" ? "A" : "↯"}</Text>
          <Pressable onPress={()=>setGrid(v=>!v)} accessibilityLabel="Toggle camera grid"><Text style={styles.icon}>{grid ? "▦" : "⊞"}</Text></Pressable>
        </Pressable>
      </View>

      <View style={styles.sideControls}>
        <Pressable style={styles.tool} onPress={() => setFacing(v => v === "back" ? "front" : "back")}>
          <Text style={styles.toolIcon}>↻</Text>
          <Text style={styles.toolText}>Flip</Text>
        </Pressable>
        <Pressable style={styles.tool} onPress={() => setMuted(v => !v)}>
          <Text style={styles.toolIcon}>{muted ? "🔇" : "🎙"}</Text>
          <Text style={styles.toolText}>{muted ? "Muted" : "Sound"}</Text>
        </Pressable>
        <Pressable style={styles.tool} onPress={() => setZoom(v => v >= 1 ? 0 : Math.min(1, Number((v + 0.25).toFixed(2))))}>
          <Text style={styles.toolIcon}>{zoom === 0 ? "1×" : zoom === 0.25 ? "1.25×" : zoom === 0.5 ? "1.5×" : zoom === 0.75 ? "1.75×" : "2×"}</Text>
          <Text style={styles.toolText}>Zoom</Text>
        </Pressable>
      </View>

      {recording ? <View pointerEvents="none" style={styles.recordingProgress}><View style={[styles.recordingProgressFill,{width:`${Math.min(100,(elapsedMs/(durationLimit*1000))*100)}%`}]}/></View> : null}
      {recording ? <View style={styles.recordingTime}><Text style={styles.recordingTimeText}>{Math.floor(elapsedMs/60000)}:{String(Math.floor((elapsedMs%60000)/1000)).padStart(2,"0")}</Text></View> : null}
      {countdown !== null ? (
        <View style={styles.countdown}>
          <Text style={styles.countdownText}>{countdown}</Text>
        </View>
      ) : null}

      <View style={styles.bottom}>
        <Text style={styles.sectionLabel}>Filters</Text>
        <View style={styles.effectsRow}>
          {EFFECTS.map(item => (
            <Pressable key={item} onPress={() => setEffect(item)} style={[styles.effectChip, effect === item && styles.effectChipActive]}>
              <Text style={styles.effectText}>{item}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Length</Text>
        <View style={styles.timerRow}>
          {[15,60,600].map(value => (
            <Pressable key={"length"+value} onPress={() => setDurationLimit(value as 15|60|600)} style={[styles.timerChip, durationLimit === value && styles.timerActive]}>
              <Text style={styles.timerText}>{value === 600 ? "10m" : value + "s"}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Speed</Text>
        <View style={styles.timerRow}>
          {[0.5,1,1.5,2].map(value => (
            <Pressable key={"speed"+value} onPress={() => setSpeed(value as 0.5|1|1.5|2)} style={[styles.timerChip, speed === value && styles.timerActive]}>
              <Text style={styles.timerText}>{value}×</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Timer</Text>
        <View style={styles.timerRow}>
          {[0,3,10].map(value => (
            <Pressable key={value} onPress={() => setTimer(value as 0|3|10)} style={[styles.timerChip, timer === value && styles.timerActive]}>
              <Text style={styles.timerText}>{value === 0 ? "Timer Off" : value + "s"}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.captureRow}>
          <View style={styles.spacer} />
          <Pressable
            accessibilityLabel={recording ? "Stop recording" : "Record video"}
            onPress={recording ? stopRecording : startRecording}
            style={[styles.recordOuter, recording && styles.recordingOuter]}
          >
            <View style={[styles.recordInner, recording && styles.recordingInner]} />
          </Pressable>
          <View style={styles.spacer} />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.hint}>{recording ? "Tap to stop" : "Tap to record • up to 10 minutes"}</Text>
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
  primary:{backgroundColor:"#ff2d55",paddingHorizontal:20,paddingVertical:14,borderRadius:24},
  primaryText:{color:"#fff",fontWeight:"900"},
  cancel:{color:"#aaa",fontWeight:"800",padding:20},
  topBar:{position:"absolute",top:54,left:16,right:16,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
  circle:{width:42,height:42,borderRadius:21,backgroundColor:"rgba(0,0,0,.42)",alignItems:"center",justifyContent:"center"},
  icon:{color:"#fff",fontSize:25,fontWeight:"700"},
  title:{color:"#fff",fontSize:18,fontWeight:"900"},
  sideControls:{position:"absolute",right:14,top:150,gap:16},
  tool:{alignItems:"center",gap:3},
  toolIcon:{color:"#fff",fontSize:23,fontWeight:"800"},
  toolText:{color:"#fff",fontSize:11,fontWeight:"800"},
  recordingProgress:{position:"absolute",top:0,left:0,right:0,height:4,backgroundColor:"rgba(255,255,255,.2)"},recordingProgressFill:{height:"100%",backgroundColor:"#ff2d55"},recordingTime:{position:"absolute",top:64,left:0,right:0,alignItems:"center"},recordingTimeText:{color:"#fff",fontSize:13,fontWeight:"900",backgroundColor:"rgba(0,0,0,.45)",paddingHorizontal:9,paddingVertical:4,borderRadius:10},countdown:{position:"absolute",top:"38%",left:0,right:0,alignItems:"center"},
  countdownText:{color:"#fff",fontSize:96,fontWeight:"900",textShadowColor:"#000",textShadowRadius:10},
  bottom:{position:"absolute",left:0,right:0,bottom:0,paddingBottom:26,paddingTop:14,backgroundColor:"rgba(0,0,0,.38)"},
  effectsRow:{flexDirection:"row",gap:7,paddingHorizontal:12,marginBottom:12},
  effectChip:{borderWidth:1,borderColor:"rgba(255,255,255,.35)",borderRadius:16,paddingHorizontal:10,paddingVertical:7},
  effectChipActive:{backgroundColor:"#ff2d55",borderColor:"#ff2d55"},
  effectText:{color:"#fff",fontSize:10,fontWeight:"800"},
  sectionLabel:{color:"#fff",fontSize:11,fontWeight:"900",textAlign:"center",marginBottom:6,textTransform:"uppercase"},
  timerRow:{flexDirection:"row",justifyContent:"center",gap:8,marginBottom:10},
  timerChip:{borderWidth:1,borderColor:"rgba(255,255,255,.35)",borderRadius:16,paddingHorizontal:12,paddingVertical:7},
  timerActive:{backgroundColor:"rgba(255,255,255,.18)",borderColor:"#fff"},
  timerText:{color:"#fff",fontSize:12,fontWeight:"800"},
  captureRow:{flexDirection:"row",justifyContent:"center",alignItems:"center"},
  spacer:{width:80},
  recordOuter:{width:76,height:76,borderRadius:38,borderWidth:5,borderColor:"#fff",alignItems:"center",justifyContent:"center"},
  recordInner:{width:58,height:58,borderRadius:29,backgroundColor:"#ff2d55"},
  recordingOuter:{borderColor:"#ff2d55"},
  recordingInner:{width:30,height:30,borderRadius:7,backgroundColor:"#ff2d55"},
  error:{color:"#ffb3c1",textAlign:"center",marginTop:8,paddingHorizontal:16},
  hint:{color:"#fff",textAlign:"center",fontSize:12,fontWeight:"700",marginTop:8},
  effectOverlay:{position:"absolute",top:0,bottom:0,left:0,right:0},
  gridOverlay:{position:"absolute",top:0,bottom:0,left:0,right:0},gridV1:{position:"absolute",top:0,bottom:0,left:"33.333%",width:1,backgroundColor:"rgba(255,255,255,.35)"},gridV2:{position:"absolute",top:0,bottom:0,left:"66.666%",width:1,backgroundColor:"rgba(255,255,255,.35)"},gridH1:{position:"absolute",left:0,right:0,top:"33.333%",height:1,backgroundColor:"rgba(255,255,255,.35)"},gridH2:{position:"absolute",left:0,right:0,top:"66.666%",height:1,backgroundColor:"rgba(255,255,255,.35)"} ,
  effectVibrant:{backgroundColor:"rgba(255,180,80,0.12)"},
  effectWarm:{backgroundColor:"rgba(255,140,40,0.18)"},
  effectCool:{backgroundColor:"rgba(60,150,255,0.16)"},
  effectNoir:{backgroundColor:"rgba(0,0,0,0.42)"},
  effectVintage:{backgroundColor:"rgba(150,90,40,0.20)"},
});
