import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { AudioSession, LiveKitRoom, VideoTrack, useRoomContext, useTracks } from "@livekit/react-native";
import { Track } from "livekit-client";
import { getAuthToken, requireAuth } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

type TokenPayload = { serverUrl: string; participantToken: string; roomName: string; streamId: string };
type Stream = { streamId: string; title: string; status: "SCHEDULED" | "LIVE" | "ENDED"; viewerCount?: number };
type LiveMode = "DEVICE_CAMERA" | "MOBILE_GAMING" | "LIVE_STUDIO";

const WHITE = "#fff";
const MUTED = "#9d9d9d";
const RED = "#fe2c55";
const DARK = "#151515";
const PILL = "rgba(30,30,30,.82)";

export default function LiveScreen() {
  const [mode, setMode] = useState<LiveMode>("DEVICE_CAMERA");
  const [showHowTo, setShowHowTo] = useState(false);
  const [showPractice, setShowPractice] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [token, setToken] = useState<TokenPayload | null>(null);
  const [stream, setStream] = useState<Stream | null>(null);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);

  async function request(path: string, init: RequestInit = {}) {
    const auth = await getAuthToken();
    if (!auth) throw new Error("Sign in required");
    const response = await fetch(API + path, {
      ...init,
      headers: { Authorization: "Bearer " + auth, "Content-Type": "application/json", ...(init.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "LIVE request failed");
    return data;
  }

  async function startDeviceLive() {
    setPreparing(true);
    setError("");
    try {
      const auth = await requireAuth();
      if (!auth) return;
      const created = await request("/live/streams", {
        method: "POST",
        body: JSON.stringify({ title: title.trim() || "LIVE on TwiTok" })
      });
      const credentials = await request("/live/streams/" + encodeURIComponent(created.streamId) + "/token", { method: "POST" });
      setStream(created);
      setToken(credentials);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to start LIVE.");
    } finally {
      setPreparing(false);
    }
  }

  useEffect(() => {
    void AudioSession.startAudioSession().catch(() => undefined);
    return () => { void AudioSession.stopAudioSession(); };
  }, []);

  async function endLive() {
    if (!stream) {
      router.back();
      return;
    }
    try {
      await request("/live/streams/" + encodeURIComponent(stream.streamId) + "/status", {
        method: "POST",
        body: JSON.stringify({ status: "ENDED" })
      });
    } catch {}
    setToken(null);
    setStream(null);
  }

  if (token && stream) {
    return (
      <LiveKitRoom
        serverUrl={token.serverUrl}
        token={token.participantToken}
        connect
        audio
        video
        options={{ adaptiveStream: true, dynacast: true }}
        onConnected={() => {
          void request("/live/streams/" + encodeURIComponent(token.streamId) + "/status", {
            method: "POST",
            body: JSON.stringify({ status: "LIVE" })
          }).then(setStream).catch(e => setError(e instanceof Error ? e.message : "Unable to start LIVE."));
        }}
        onDisconnected={() => {
          if (stream.status === "LIVE") {
            void request("/live/streams/" + encodeURIComponent(stream.streamId) + "/status", {
              method: "POST",
              body: JSON.stringify({ status: "ENDED" })
            }).catch(() => undefined);
          }
        }}
      >
        <LiveBroadcastView stream={stream} onEnd={endLive} error={error} setError={setError} />
      </LiveKitRoom>
    );
  }

  if (showPractice) {
    return (
      <View style={styles.practiceScreen}>
        <Pressable style={styles.close} onPress={() => setShowPractice(false)}><Text style={styles.closeText}>×</Text></Pressable>
        <LiveCentrePill />
        <View style={styles.practiceContent}>
          <Text style={styles.practiceTitle}>Warm up for your LIVE:</Text>
          <Text style={styles.practiceTitle}>Practice privately before you go LIVE</Text>
          <Pressable style={styles.practiceButton} onPress={() => setShowPractice(false)}><Text style={styles.practiceButtonText}>Practice now</Text></Pressable>
        </View>
        <PracticeTools />
      </View>
    );
  }

  if (showHowTo) {
    return (
      <View style={styles.howToScreen}>
        <Pressable style={styles.close} onPress={() => setShowHowTo(false)}><Text style={styles.closeText}>×</Text></Pressable>
        <LiveCentrePill />
        <View style={styles.howToCard}>
          <Text style={styles.howToIcon}>▣</Text>
          <Text style={styles.howToTitle}>How to go LIVE</Text>
          <Text style={styles.howToText}>Prepare your title, choose your LIVE mode, check your camera and microphone, then tap Go LIVE.</Text>
        </View>
        <PracticeTools />
      </View>
    );
  }

  if (mode !== "DEVICE_CAMERA") {
    return (
      <View style={styles.modeScreen}>
        <Pressable style={styles.close} onPress={() => setMode("DEVICE_CAMERA")}><Text style={styles.closeText}>×</Text></Pressable>
        <LiveCentrePill />
        {mode === "LIVE_STUDIO" ? (
          <View style={styles.studioAccess}>
            <Text style={styles.studioBrand}>TwiTok <Text style={styles.studioBadge}>LIVE Studio</Text></Text>
            <View style={styles.studioPreview}><Text style={styles.studioPreviewIcon}>▣</Text><Text style={styles.studioPreviewText}>LIVE Studio</Text></View>
            <Text style={styles.studioDescription}>Create content and share magical moments with the streaming software designed specifically for the TwiTok LIVE experience.</Text>
            <Pressable style={styles.getAccess} onPress={() => Alert.alert("LIVE Studio", "LIVE Studio access will be available when your creator account is enabled.")}><Text style={styles.getAccessText}>Get access</Text></Pressable>
          </View>
        ) : (
          <View style={styles.studioAccess}>
            <Text style={styles.modeTitle}>Mobile gaming</Text>
            <View style={styles.studioPreview}><Text style={styles.gameIcon}>▣</Text><Text style={styles.studioPreviewText}>Share your screen</Text></View>
            <Text style={styles.studioDescription}>Stream your mobile gameplay with your camera, microphone, LIVE chat and creator controls.</Text>
            <Pressable style={styles.getAccess} onPress={() => Alert.alert("Mobile gaming", "Screen sharing will start here on supported devices.")}><Text style={styles.getAccessText}>Share screen</Text></Pressable>
          </View>
        )}
        <ModeSelector mode={mode} setMode={setMode} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.previewBackdrop} />
      <Pressable style={styles.close} onPress={() => router.back()}><Text style={styles.closeText}>×</Text></Pressable>
      <Pressable style={styles.liveCentre} onPress={() => setToolsOpen(v => !v)}>
        <Text style={styles.liveCentreIcon}>▶</Text><Text style={styles.liveCentreText}>LIVE centre</Text>
      </Pressable>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.setupScroll}>
        <View style={styles.creatorGrid}>
          {Array.from({ length: 9 }).map((_, i) => (
            <View key={i} style={[styles.creatorAvatar, i === 0 && styles.creatorAvatarActive]}>
              {i === 0 ? <Text style={styles.avatarText}>T</Text> : <Text style={styles.avatarPlaceholder}>●</Text>}
            </View>
          ))}
        </View>

        <View style={styles.toolGrid}>
          <LiveTool icon="⚙" label="Settings" badge onPress={() => Alert.alert("LIVE settings", "LIVE privacy, moderation, gifts and guest controls.")} />
          <LiveTool icon="♡" label="Fan Club" onPress={() => Alert.alert("Fan Club", "Fan Club controls are ready for your LIVE.")} />
          <LiveTool icon="▤" label="Poll" onPress={() => Alert.alert("Poll", "Create a poll for your viewers.")} />
          <LiveTool icon="↗" label="Share" onPress={() => Alert.alert("Share", "Invite viewers to your LIVE.")} />
          <LiveTool icon="♨" label="Promote" onPress={() => router.push("/promote")} />
          {toolsOpen ? <>
            <LiveTool icon="♢" label="Tips" onPress={() => Alert.alert("Tips", "Tips help viewers support creators.")} />
            <LiveTool icon="♙" label="Play Together" onPress={() => Alert.alert("Play Together", "Invite another creator to your LIVE.")} />
            <LiveTool icon="▣" label="Landscape" onPress={() => Alert.alert("Landscape", "Landscape LIVE is available for supported devices.")} />
            <LiveTool icon="◉" label="Camera" onPress={() => setMode("DEVICE_CAMERA")} />
            <LiveTool icon="▱" label="Share camera" onPress={() => Alert.alert("Share camera", "Share camera with guests during LIVE.")} />
          </> : null}
        </View>

        <Pressable style={styles.howToRow} onPress={() => setShowHowTo(true)}>
          <Text style={styles.howToRowIcon}>▣</Text><Text style={styles.howToRowText}>How to go LIVE</Text><Text style={styles.chevron}>›</Text>
        </Pressable>

        <Pressable style={styles.practiceBanner} onPress={() => setShowPractice(true)}>
          <Text style={styles.practiceBannerTitle}>Warm up for your LIVE:</Text>
          <Text style={styles.practiceBannerSub}>Practice privately before you go LIVE</Text>
          <View style={styles.practiceSmall}><Text style={styles.practiceSmallText}>Practice now</Text></View>
        </Pressable>

        <View style={styles.goLiveCard}>
          <TextInput value={title} onChangeText={setTitle} placeholder="Add a title" placeholderTextColor="#777" style={styles.titleInput} maxLength={80} />
          <View style={styles.goalRow}><Text style={styles.gameSelect}>＋ Select game</Text><Text style={styles.goal}>◉ LIVE goal</Text></View>
          <Pressable style={styles.goLiveButton} disabled={preparing} onPress={() => void startDeviceLive()}>
            {preparing ? <ActivityIndicator color="#fff" /> : <Text style={styles.goLiveText}>Go LIVE</Text>}
          </Pressable>
        </View>

        <ModeSelector mode={mode} setMode={setMode} />
      </ScrollView>
    </View>
  );
}

function ModeSelector({ mode, setMode }: { mode: LiveMode; setMode: (value: LiveMode) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeSelector}>
      <Pressable onPress={() => setMode("DEVICE_CAMERA")} style={styles.modeTab}><Text style={mode === "DEVICE_CAMERA" ? styles.modeActive : styles.modeInactive}>▣ Device camera</Text></Pressable>
      <Pressable onPress={() => setMode("MOBILE_GAMING")} style={styles.modeTab}><Text style={mode === "MOBILE_GAMING" ? styles.modeActive : styles.modeInactive}>▯ Mobile gaming</Text></Pressable>
      <Pressable onPress={() => setMode("LIVE_STUDIO")} style={styles.modeTab}><Text style={mode === "LIVE_STUDIO" ? styles.modeActive : styles.modeInactive}>▣ LIVE Studio</Text></Pressable>
    </ScrollView>
  );
}

function LiveCentrePill() {
  return <View style={styles.liveCentre}><Text style={styles.liveCentreIcon}>▶</Text><Text style={styles.liveCentreText}>LIVE centre</Text></View>;
}

function LiveTool({ icon, label, badge, onPress }: { icon: string; label: string; badge?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.liveTool}>
      <View style={styles.liveToolIcon}><Text style={styles.liveToolIconText}>{icon}</Text>{badge ? <View style={styles.badge} /> : null}</View>
      <Text style={styles.liveToolLabel}>{label}</Text>
    </Pressable>
  );
}

function PracticeTools() {
  return (
    <View style={styles.practiceTools}>
      {["Tips","Play Together","Poll","Fan Club","Landscape","Camera","Share camera","Share","Settings","Promote"].map((item, i) => (
        <View key={item} style={styles.practiceTool}><Text style={styles.practiceIcon}>{["◉","♙","▤","♡","▣","◉","▱","↗","⚙","♨"][i]}</Text><Text style={styles.practiceLabel}>{item}</Text></View>
      ))}
    </View>
  );
}

function LiveBroadcastView({ stream, onEnd, error, setError }: { stream: Stream; onEnd: () => void; error: string; setError: (value: string) => void }) {
  const room = useRoomContext();
  const tracks = useTracks([Track.Source.Camera]);
  const localCamera = useMemo(() => tracks.find(track => track.participant.identity === room.localParticipant.identity), [tracks, room.localParticipant.identity]);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [beauty, setBeauty] = useState(true);
  const [filter, setFilter] = useState(0);
  const [toolsOpen, setToolsOpen] = useState(true);
  const filters = ["Normal", "Vivid", "Warm", "Cool", "Noir"];

  async function flip() {
    try {
      const publication = room.localParticipant.getTrackPublication(Track.Source.Camera);
      if (publication?.videoTrack) {
        const next = facing === "user" ? "environment" : "user";
        await publication.videoTrack.restartTrack({ facingMode: next });
        setFacing(next);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to switch camera."); }
  }

  async function toggleMic() {
    try { await room.localParticipant.setMicrophoneEnabled(muted); setMuted(v => !v); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to change microphone."); }
  }

  async function toggleCamera() {
    try { await room.localParticipant.setCameraEnabled(cameraOff); setCameraOff(v => !v); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to change camera."); }
  }

  return (
    <View style={styles.broadcast}>
      {localCamera ? <VideoTrack trackRef={localCamera} style={styles.broadcastVideo} /> : <View style={styles.broadcastFallback}><ActivityIndicator color="#fff" /><Text style={styles.broadcastFallbackText}>Starting camera…</Text></View>}
      <View style={styles.broadcastTop}>
        <Pressable onPress={onEnd} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable>
        <View style={styles.broadcastPill}><View style={styles.liveDot} /><Text style={styles.broadcastLive}>LIVE</Text><Text style={styles.viewerCount}>{stream.viewerCount ?? 0}</Text></View>
        <Pressable onPress={() => setToolsOpen(v => !v)} style={styles.moreButton}><Text style={styles.moreText}>•••</Text></Pressable>
      </View>

      {toolsOpen ? <View style={styles.broadcastTools}>
        <BroadcastTool label="Flip" icon="↻" onPress={() => void flip()} />
        <BroadcastTool label={muted ? "Unmute" : "Mute"} icon={muted ? "⌁" : "◖"} onPress={() => void toggleMic()} />
        <BroadcastTool label={beauty ? "Beauty" : "Beautify"} icon="✦" onPress={() => setBeauty(v => !v)} />
        <BroadcastTool label={filters[filter]} icon="◉" onPress={() => setFilter(v => (v + 1) % filters.length)} />
        <BroadcastTool label="Settings" icon="⚙" onPress={() => Alert.alert("LIVE settings", "Manage LIVE settings.")} />
        <BroadcastTool label="Get leads" icon="▤" onPress={() => Alert.alert("Get leads", "Lead collection is enabled for eligible creators.")} />
        <BroadcastTool label="Fan Club" icon="♡" onPress={() => Alert.alert("Fan Club", "Fan Club is available during LIVE.")} />
        <BroadcastTool label="Interact" icon="♧" onPress={() => Alert.alert("Interact", "Open LIVE interactions.")} />
        <BroadcastTool label="Share" icon="↗" onPress={() => Alert.alert("Share", "Share your LIVE.")} />
        <BroadcastTool label="Promote" icon="♨" onPress={() => router.push("/promote")} />
      </View> : null}

      {error ? <View style={styles.broadcastError}><Text style={styles.broadcastErrorText}>{error}</Text></View> : null}

      <View style={styles.broadcastBottom}>
        <View style={styles.broadcastTitleRow}><Text style={styles.broadcastAvatar}>T</Text><Text style={styles.broadcastTitle}>{stream.title}</Text><Text style={styles.broadcastGoal}>◉ LIVE goal</Text></View>
        <Pressable style={styles.broadcastGoLive} onPress={onEnd}><Text style={styles.broadcastGoLiveText}>End LIVE</Text></Pressable>
        <View style={styles.broadcastModes}>
          <Pressable><Text style={styles.broadcastModeInactive}>◖ Voice chat</Text></Pressable>
          <Pressable onPress={() => void toggleCamera()}><Text style={cameraOff ? styles.broadcastModeInactive : styles.broadcastModeActive}>▣ Device camera</Text></Pressable>
          <Pressable><Text style={styles.broadcastModeInactive}>▯ Mobile gaming</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

function BroadcastTool({ label, icon, onPress }: { label: string; icon: string; onPress: () => void }) {
  return <Pressable style={styles.broadcastTool} onPress={onPress}><Text style={styles.broadcastToolIcon}>{icon}</Text><Text style={styles.broadcastToolLabel}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  previewBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: "#3c302c" },
  close: { position: "absolute", left: 34, top: 34, zIndex: 50, width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  closeText: { color: WHITE, fontSize: 42, fontWeight: "300", lineHeight: 42 },
  liveCentre: { position: "absolute", right: 34, top: 32, zIndex: 40, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: PILL, paddingHorizontal: 23, paddingVertical: 15, borderRadius: 30 },
  liveCentreIcon: { color: WHITE, fontSize: 18, fontWeight: "900" },
  liveCentreText: { color: WHITE, fontSize: 18, fontWeight: "800" },
  setupScroll: { paddingTop: 150, paddingHorizontal: 36, paddingBottom: 110 },
  creatorGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 54 },
  creatorAvatar: { width: 112, height: 112, borderRadius: 56, backgroundColor: "#242424", alignItems: "center", justifyContent: "center", marginBottom: 38 },
  creatorAvatarActive: { backgroundColor: "#333" },
  avatarText: { color: WHITE, fontSize: 44, fontWeight: "800" },
  avatarPlaceholder: { color: "#4a4a4a", fontSize: 36 },
  toolGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 25 },
  liveTool: { width: "19%", minWidth: 54, alignItems: "center", marginBottom: 26 },
  liveToolIcon: { width: 56, height: 56, alignItems: "center", justifyContent: "center", position: "relative" },
  liveToolIconText: { color: WHITE, fontSize: 38, fontWeight: "300" },
  liveToolLabel: { color: WHITE, fontSize: 14, fontWeight: "700", marginTop: 7, textAlign: "center" },
  badge: { position: "absolute", right: 5, top: 0, width: 11, height: 11, borderRadius: 6, backgroundColor: RED },
  howToRow: { height: 74, borderRadius: 20, backgroundColor: "rgba(45,45,45,.82)", flexDirection: "row", alignItems: "center", paddingHorizontal: 24, marginBottom: 20 },
  howToRowIcon: { color: WHITE, fontSize: 24, marginRight: 16 },
  howToRowText: { flex: 1, color: WHITE, fontSize: 19, fontWeight: "700" },
  chevron: { color: WHITE, fontSize: 36, fontWeight: "200" },
  practiceBanner: { backgroundColor: "rgba(25,25,25,.62)", borderRadius: 20, padding: 22, marginBottom: 20 },
  practiceBannerTitle: { color: WHITE, fontSize: 20, fontWeight: "800" },
  practiceBannerSub: { color: WHITE, fontSize: 18, fontWeight: "700", marginTop: 9 },
  practiceSmall: { alignSelf: "flex-start", marginTop: 18, borderWidth: 1, borderColor: WHITE, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 10 },
  practiceSmallText: { color: WHITE, fontSize: 16, fontWeight: "800" },
  goLiveCard: { backgroundColor: "rgba(25,25,25,.82)", borderRadius: 28, padding: 26, marginTop: 4 },
  titleInput: { color: WHITE, fontSize: 20, fontWeight: "700", paddingVertical: 12 },
  goalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,.08)" },
  gameSelect: { color: "#ddd", fontSize: 16, fontWeight: "700" },
  goal: { color: WHITE, fontSize: 16, fontWeight: "800" },
  goLiveButton: { height: 70, borderRadius: 38, backgroundColor: RED, alignItems: "center", justifyContent: "center", marginTop: 14 },
  goLiveText: { color: WHITE, fontSize: 22, fontWeight: "900" },
  modeSelector: { paddingVertical: 24, paddingHorizontal: 12, gap: 34, alignItems: "center" },
  modeTab: { paddingVertical: 8 },
  modeActive: { color: WHITE, fontSize: 18, fontWeight: "900" },
  modeInactive: { color: "#858585", fontSize: 18, fontWeight: "800" },
  howToScreen: { flex: 1, backgroundColor: "#0a0a0a", paddingTop: 120 },
  howToCard: { marginHorizontal: 36, backgroundColor: "#2b2928", borderRadius: 24, padding: 26 },
  howToIcon: { color: WHITE, fontSize: 32 },
  howToTitle: { color: WHITE, fontSize: 26, fontWeight: "900", marginTop: 10 },
  howToText: { color: "#bdbdbd", fontSize: 17, lineHeight: 25, marginTop: 12 },
  practiceScreen: { flex: 1, backgroundColor: "#111", paddingTop: 120 },
  practiceContent: { paddingHorizontal: 72, marginTop: 42 },
  practiceTitle: { color: WHITE, fontSize: 24, fontWeight: "900", lineHeight: 36 },
  practiceButton: { alignSelf: "flex-start", marginTop: 28, borderWidth: 2, borderColor: "#aaa", borderRadius: 30, paddingHorizontal: 26, paddingVertical: 13 },
  practiceButtonText: { color: WHITE, fontSize: 18, fontWeight: "900" },
  practiceTools: { position: "absolute", left: 36, right: 36, bottom: 82, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  practiceTool: { width: "19%", alignItems: "center", marginBottom: 28 },
  practiceIcon: { color: WHITE, fontSize: 32 },
  practiceLabel: { color: WHITE, fontSize: 13, fontWeight: "700", marginTop: 7, textAlign: "center" },
  modeScreen: { flex: 1, backgroundColor: "#152f47", paddingTop: 130 },
  studioAccess: { marginHorizontal: 36, backgroundColor: "rgba(28,28,28,.76)", borderRadius: 28, padding: 28 },
  studioBrand: { color: WHITE, fontSize: 30, fontWeight: "900" },
  studioBadge: { backgroundColor: RED, paddingHorizontal: 8, borderRadius: 5, fontSize: 20 },
  modeTitle: { color: WHITE, fontSize: 32, fontWeight: "900" },
  studioPreview: { height: 250, backgroundColor: "#202326", borderRadius: 20, alignItems: "center", justifyContent: "center", marginTop: 22 },
  studioPreviewIcon: { color: WHITE, fontSize: 58 },
  gameIcon: { color: WHITE, fontSize: 58 },
  studioPreviewText: { color: "#aaa", fontSize: 18, marginTop: 12, fontWeight: "800" },
  studioDescription: { color: "#c5c5c5", fontSize: 16, lineHeight: 23, marginTop: 20 },
  getAccess: { height: 66, borderRadius: 34, backgroundColor: RED, alignItems: "center", justifyContent: "center", marginTop: 24 },
  getAccessText: { color: WHITE, fontSize: 21, fontWeight: "900" },
  broadcast: { flex: 1, backgroundColor: "#000" },
  broadcastVideo: { ...StyleSheet.absoluteFill },
  broadcastFallback: { ...StyleSheet.absoluteFill, backgroundColor: "#090909", alignItems: "center", justifyContent: "center" },
  broadcastFallbackText: { color: WHITE, fontSize: 16, fontWeight: "800", marginTop: 10 },
  broadcastTop: { position: "absolute", left: 16, right: 16, top: 8, zIndex: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  broadcastPill: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(0,0,0,.6)", paddingHorizontal: 15, paddingVertical: 9, borderRadius: 22 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: RED },
  broadcastLive: { color: WHITE, fontSize: 15, fontWeight: "900" },
  viewerCount: { color: "#ddd", fontSize: 13, fontWeight: "800" },
  moreButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  moreText: { color: WHITE, fontSize: 18, letterSpacing: 2 },
  broadcastTools: { position: "absolute", right: 10, top: 100, width: 86, alignItems: "center", gap: 16, zIndex: 15 },
  broadcastTool: { alignItems: "center", width: 82 },
  broadcastToolIcon: { color: WHITE, fontSize: 30, lineHeight: 34 },
  broadcastToolLabel: { color: WHITE, fontSize: 10, fontWeight: "800", marginTop: 3, textAlign: "center" },
  broadcastError: { position: "absolute", top: 70, left: 16, right: 16, padding: 10, borderRadius: 12, backgroundColor: "rgba(90,0,15,.9)", zIndex: 40 },
  broadcastErrorText: { color: WHITE, textAlign: "center", fontSize: 12 },
  broadcastBottom: { position: "absolute", left: 20, right: 20, bottom: 18, backgroundColor: "rgba(20,20,20,.82)", borderRadius: 26, padding: 16, zIndex: 20 },
  broadcastTitleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  broadcastAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#777", color: WHITE, textAlign: "center", paddingTop: 9, fontWeight: "900" },
  broadcastTitle: { flex: 1, color: WHITE, fontSize: 17, fontWeight: "800" },
  broadcastGoal: { color: WHITE, fontSize: 13, fontWeight: "800" },
  broadcastGoLive: { height: 62, borderRadius: 32, backgroundColor: RED, alignItems: "center", justifyContent: "center", marginTop: 12 },
  broadcastGoLiveText: { color: WHITE, fontSize: 20, fontWeight: "900" },
  broadcastModes: { flexDirection: "row", justifyContent: "space-around", paddingTop: 14 },
  broadcastModeActive: { color: WHITE, fontSize: 14, fontWeight: "900" },
  broadcastModeInactive: { color: "#888", fontSize: 14, fontWeight: "800" }
});
