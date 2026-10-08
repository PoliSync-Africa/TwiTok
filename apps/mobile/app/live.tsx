import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { AudioSession, LiveKitRoom, VideoTrack, useRoomContext, useTracks } from "@livekit/react-native";
import { Track } from "livekit-client";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { SymbolView } from "expo-symbols";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getAuthToken, requireAuth } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

type TokenPayload = { serverUrl: string; participantToken: string; roomName: string; streamId: string };
type Stream = { streamId: string; title: string; status: "SCHEDULED" | "LIVE" | "ENDED"; viewerCount?: number };
type LiveMode = "VOICE_CHAT" | "DEVICE_CAMERA" | "MOBILE_GAMING" | "LIVE_STUDIO";
type LivePanel = "rewards" | "badge" | "howto" | "music" | "beautify" | "effects" | "settings" | "service" | "fanclub" | "interact" | "share" | "tips" | "play" | "poll" | "landscape" | "sharecamera" | "game" | "goal" | null;

const WHITE = "#fff";
const MUTED = "#9d9d9d";
const RED = "#fe2c55";
const DARK = "#151515";
const PILL = "rgba(30,30,30,.82)";
const LIVE_ICONS: Record<string, { ios: string; android: string; web: string }> = {
  rewards: { ios: "bag.fill", android: "redeem", web: "redeem" },
  badge: { ios: "shield.fill", android: "verified", web: "verified" },
  play: { ios: "play.fill", android: "play_arrow", web: "play_arrow" },
  video: { ios: "video.fill", android: "videocam", web: "videocam" },
  close: { ios: "xmark", android: "close", web: "close" },
  tip: { ios: "lightbulb.fill", android: "lightbulb", web: "lightbulb" },
  together: { ios: "person.2.fill", android: "group", web: "group" },
  poll: { ios: "rectangle.stack.fill", android: "ballot", web: "ballot" },
  fan: { ios: "heart.fill", android: "favorite", web: "favorite" },
  landscape: { ios: "rectangle.portrait.and.arrow.forward", android: "screen_rotation", web: "screen_rotation" },
  camera: { ios: "camera.fill", android: "photo_camera", web: "photo_camera" },
  sharecamera: { ios: "rectangle.2.swap", android: "devices_other", web: "devices_other" },
  share: { ios: "arrowshape.turn.up.right.fill", android: "share", web: "share" },
  settings: { ios: "gearshape.fill", android: "settings", web: "settings" },
  promote: { ios: "flame.fill", android: "local_fire_department", web: "local_fire_department" },
  flip: { ios: "arrow.triangle.2.circlepath.camera", android: "flip_camera_android", web: "flip_camera_android" },
  beauty: { ios: "wand.and.stars", android: "auto_awesome", web: "auto_awesome" },
  effects: { ios: "sparkles", android: "auto_awesome", web: "auto_awesome" },
  service: { ios: "person.crop.circle.badge.plus", android: "person_add", web: "person_add" },
  interact: { ios: "message.fill", android: "forum", web: "forum" },
  music: { ios: "music.note", android: "music_note", web: "music_note" },
  goal: { ios: "target", android: "track_changes", web: "track_changes" },
  game: { ios: "gamecontroller.fill", android: "sports_esports", web: "sports_esports" },
  phone: { ios: "phone.fill", android: "call", web: "call" },
  mobile: { ios: "iphone", android: "smartphone", web: "smartphone" },
  desktop: { ios: "desktopcomputer", android: "desktop_windows", web: "desktop_windows" },
};

function LiveIcon({ name, size = 28, color = WHITE }: { name: string; size?: number; color?: string }) {
  const icon = LIVE_ICONS[name] ?? LIVE_ICONS.play;
  return <SymbolView name={icon as any} tintColor={color} size={size} fallback={<Text style={{ color, fontSize: size, lineHeight: size }}>•</Text>} />;
}


export default function LiveScreen() {
  const [mode, setMode] = useState<LiveMode>("DEVICE_CAMERA");
  const [showHowTo, setShowHowTo] = useState(false);
  const [showPractice, setShowPractice] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [token, setToken] = useState<TokenPayload | null>(null);
  const [stream, setStream] = useState<Stream | null>(null);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const insets = useSafeAreaInsets();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [panel, setPanel] = useState<LivePanel>(null);
  const [goal, setGoal] = useState("");
  const [game, setGame] = useState("");
  const [musicBanner, setMusicBanner] = useState(true);
  const [cameraFacing, setCameraFacing] = useState<"front" | "back">("front");
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();

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
        body: JSON.stringify({ title: title.trim() || "LIVE on TwiTok", mode, goal: goal.trim() || undefined, game: game.trim() || undefined })
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

  useEffect(() => {
    if (cameraPermission && !cameraPermission.granted && cameraPermission.canAskAgain) void requestCameraPermission();
    if (microphonePermission && !microphonePermission.granted && microphonePermission.canAskAgain) void requestMicrophonePermission();
  }, [cameraPermission?.granted, microphonePermission?.granted]);

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
        video={mode !== "VOICE_CHAT"}
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

  return (
    <View style={styles.ttLiveScreen}>
      {cameraPermission?.granted && mode !== "MOBILE_GAMING" && mode !== "LIVE_STUDIO" ? (
        <CameraView style={StyleSheet.absoluteFill} facing={cameraFacing} mode="video" mute={!microphonePermission?.granted} videoQuality="1080p" />
      ) : (
        <View style={styles.ttPreviewFallback} />
      )}
      <View style={styles.ttDimOverlay} />

      <View style={[styles.ttTopBar, { paddingTop: Math.max(insets.top + 4, 18) }]}>
        <Pressable style={styles.ttClose} onPress={() => router.back()} accessibilityLabel="Close LIVE"><LiveIcon name="close" size={30} /></Pressable>
        <View style={styles.ttTopActions}>
          <Pressable style={styles.ttRewardPill} onPress={() => setPanel("rewards")}>
            <LiveIcon name="rewards" size={23} /><Text style={styles.ttRewardText}>Scaled LIVE Rewards</Text>
          </Pressable>
          <Pressable style={styles.ttCircleAction} onPress={() => setPanel("badge")}><LiveIcon name="badge" size={24} /></Pressable>
          <Pressable style={styles.ttCircleAction} onPress={() => setPanel("howto")}><LiveIcon name="play" size={21} /></Pressable>
        </View>
      </View>

      {musicBanner ? (
        <Pressable style={[styles.ttMusicBanner, { top: Math.max(insets.top + 96, 112) }]} onPress={() => setPanel("music")}>
          <View style={styles.ttMusicDisc}><Text style={styles.ttMusicDiscText}>◉</Text></View>
          <View style={styles.ttMusicCopy}><Text style={styles.ttMusicTitle}>Songs of LIVE</Text><Text style={styles.ttMusicSub}>Explore our new music Gift feature!</Text></View>
          <Pressable hitSlop={12} onPress={() => setMusicBanner(false)}><LiveIcon name="close" size={22} /></Pressable>
        </Pressable>
      ) : null}

      <ScrollView style={styles.ttOverlayScroll} contentContainerStyle={[styles.ttOverlayContent, { paddingTop: Math.max(insets.top + 170, 188), paddingBottom: 250 }]} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.ttHowToRow} onPress={() => setPanel("howto")}>
          <LiveIcon name="video" size={22} /><Text style={styles.ttHowToText}>How to go LIVE</Text><Text style={styles.ttChevron}>›</Text>
        </Pressable>

        <View style={styles.ttToolGrid}>
          <LiveTool icon="tip" label="Tips" onPress={() => setPanel("tips")} />
          <LiveTool icon="together" label="Play Together" onPress={() => setPanel("play")} />
          <LiveTool icon="poll" label="Poll" onPress={() => setPanel("poll")} />
          <LiveTool icon="fan" label="Fan Club" onPress={() => setPanel("fanclub")} />
          <LiveTool icon="landscape" label="Landscape" onPress={() => setPanel("landscape")} />
          <LiveTool icon="camera" label="Camera" muted onPress={() => { setMode("DEVICE_CAMERA"); void requestCameraPermission(); }} />
          <LiveTool icon="sharecamera" label="Share camera" onPress={() => setPanel("sharecamera")} />
          <LiveTool icon="share" label="Share" onPress={() => setPanel("share")} />
          <LiveTool icon="settings" label="Settings" badge onPress={() => setPanel("settings")} />
          <LiveTool icon="promote" label="Promote" onPress={() => router.push("/promote")} />
          <LiveTool icon="flip" label="Flip" onPress={() => setCameraFacing(v => v === "front" ? "back" : "front")} />
          <LiveTool icon="beauty" label="Beautify" onPress={() => setPanel("beautify")} />
          <LiveTool icon="effects" label="Effects" onPress={() => setPanel("effects")} />
          <LiveTool icon="service" label="Service+" onPress={() => setPanel("service")} />
          <LiveTool icon="interact" label="Interact" onPress={() => setPanel("interact")} />
        </View>

        <View style={styles.ttBottomCard}>
          <View style={styles.ttTitleRow}>
            <View style={styles.ttAvatar}><Text style={styles.ttAvatarText}>T</Text></View>
            <TextInput value={title} onChangeText={setTitle} placeholder="Add a title" placeholderTextColor="#b6b6b6" style={styles.ttTitleInput} maxLength={80} />
          </View>
          <View style={styles.ttOptionRow}>
            <Pressable style={styles.ttOptionButton} onPress={() => setPanel("game")}><LiveIcon name="game" size={21} color="#ddd" /><Text style={styles.ttOptionText}>{game || "Select game"}</Text></Pressable>
            <View style={styles.ttOptionDivider} />
            <Pressable style={styles.ttOptionButton} onPress={() => setPanel("goal")}><LiveIcon name="goal" size={21} /><Text style={styles.ttOptionText}>{goal || "LIVE goal"}</Text></Pressable>
          </View>
          <Pressable style={styles.ttGoLiveButton} disabled={preparing} onPress={() => void startDeviceLive()}>
            {preparing ? <ActivityIndicator color={WHITE} /> : <Text style={styles.ttGoLiveText}>Go LIVE</Text>}
          </Pressable>
        </View>

        <ModeSelector mode={mode} setMode={setMode} />
      </ScrollView>

      <View style={[styles.ttBottomModeBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable onPress={() => setMode(mode === "VOICE_CHAT" ? "DEVICE_CAMERA" : "VOICE_CHAT")} style={styles.ttModeBottomItem}><LiveIcon name="phone" size={18} color={mode === "VOICE_CHAT" ? WHITE : MUTED} /><Text style={mode === "VOICE_CHAT" ? styles.ttBottomActive : styles.ttBottomInactive}>Voice chat</Text></Pressable>
        <Pressable onPress={() => setMode("DEVICE_CAMERA")} style={styles.ttModeBottomItem}><LiveIcon name="video" size={18} color={mode === "DEVICE_CAMERA" ? WHITE : MUTED} /><Text style={mode === "DEVICE_CAMERA" ? styles.ttBottomActive : styles.ttBottomInactive}>Device camera</Text></Pressable>
        <Pressable onPress={() => setMode("MOBILE_GAMING")} style={styles.ttModeBottomItem}><LiveIcon name="mobile" size={18} color={mode === "MOBILE_GAMING" ? WHITE : MUTED} /><Text style={mode === "MOBILE_GAMING" ? styles.ttBottomActive : styles.ttBottomInactive}>Mobile gaming</Text></Pressable>
        <Pressable onPress={() => setMode("LIVE_STUDIO")} style={styles.ttModeBottomItem}><LiveIcon name="desktop" size={18} color={mode === "LIVE_STUDIO" ? WHITE : MUTED} /><Text style={mode === "LIVE_STUDIO" ? styles.ttBottomActive : styles.ttBottomInactive}>LIVE Studio</Text></Pressable>
      </View>

      <View style={[styles.ttTabNav, { bottom: Math.max(insets.bottom + 42, 58) }]}>
        <Text style={styles.ttTabActive}>LIVE</Text>
        <Pressable onPress={() => router.push("/camera")}><Text style={styles.ttTabInactive}>CAMERA</Text></Pressable>
        <Pressable onPress={() => router.push("/create")}><Text style={styles.ttTabInactive}>CREATE</Text></Pressable>
      </View>

      {error ? <View style={[styles.ttError, { bottom: Math.max(insets.bottom + 150, 170) }]}><Text style={styles.ttErrorText}>{error}</Text></View> : null}
      <LiveFeatureModal panel={panel} setPanel={setPanel} goal={goal} setGoal={setGoal} game={game} setGame={setGame} onShare={() => void Share.share({ message: title ? `Join my TwiTok LIVE: ${title}` : "Join my TwiTok LIVE" })} />
    </View>
  );
}

function ModeSelector({ mode, setMode }: { mode: LiveMode; setMode: (value: LiveMode) => void }) {
  const tabs: Array<[LiveMode, string, string]> = [["VOICE_CHAT", "phone", "Voice chat"], ["DEVICE_CAMERA", "video", "Device camera"], ["MOBILE_GAMING", "mobile", "Mobile gaming"], ["LIVE_STUDIO", "desktop", "LIVE Studio"]];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ttModeSelector}>
      {tabs.map(([value, icon, label]) => (
        <Pressable key={value} onPress={() => setMode(value)} style={styles.ttModeTab}>
          <LiveIcon name={icon} size={17} color={mode === value ? WHITE : "#777"} />
          <Text style={mode === value ? styles.ttModeActive : styles.ttModeInactive}>{label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function LiveFeatureModal({ panel, setPanel, goal, setGoal, game, setGame, onShare }: { panel: LivePanel; setPanel: (panel: LivePanel) => void; goal: string; setGoal: (value: string) => void; game: string; setGame: (value: string) => void; onShare: () => void }) {
  if (!panel) return null;
  const info: Record<Exclude<LivePanel, null>, { title: string; body: string; icon: string }> = {
    rewards: { title: "Scaled LIVE Rewards", body: "Manage reward settings for this LIVE.", icon: "rewards" },
    badge: { title: "LIVE creator badge", body: "Your creator badge appears beside your LIVE identity.", icon: "badge" },
    howto: { title: "How to go LIVE", body: "Add a title, choose your mode, check camera and microphone access, then tap Go LIVE.", icon: "video" },
    music: { title: "Songs of LIVE", body: "Explore music and LIVE Gifts for real-time creator sessions.", icon: "music" },
    beautify: { title: "Beautify", body: "Adjust your LIVE appearance before you start.", icon: "beauty" },
    effects: { title: "Effects", body: "Choose a LIVE effect and preview it before streaming.", icon: "effects" },
    settings: { title: "LIVE Settings", body: "Configure privacy, moderation, gifts, comments, guests and safety controls.", icon: "settings" },
    service: { title: "Service+", body: "Open creator services and support tools available to your account.", icon: "service" },
    fanclub: { title: "Fan Club", body: "Build your LIVE community with supporter controls.", icon: "fan" },
    interact: { title: "Interact", body: "Use polls, Q&A, guests and other real-time interactions.", icon: "interact" },
    share: { title: "Share LIVE", body: "Send your LIVE to people or other apps.", icon: "share" },
    tips: { title: "Tips", body: "Viewers can use tips to support eligible creators.", icon: "tip" },
    play: { title: "Play Together", body: "Invite another creator to join your LIVE when guest access is available.", icon: "together" },
    poll: { title: "Create a Poll", body: "Ask your viewers a question and collect responses during your LIVE.", icon: "poll" },
    landscape: { title: "Landscape LIVE", body: "Switch to landscape presentation on supported devices.", icon: "landscape" },
    sharecamera: { title: "Share camera", body: "Manage camera sharing for guests and co-hosts.", icon: "sharecamera" },
    game: { title: "Select game", body: "Add the game you are streaming.", icon: "game" },
    goal: { title: "LIVE goal", body: "Set a goal viewers can see during your LIVE.", icon: "goal" },
  };
  const item = info[panel];
  const editable = panel === "game" || panel === "goal";
  return (
    <Modal transparent animationType="slide" visible onRequestClose={() => setPanel(null)}>
      <Pressable style={styles.ttModalBackdrop} onPress={() => setPanel(null)}>
        <Pressable style={styles.ttSheet} onPress={e => e.stopPropagation()}>
          <View style={styles.ttSheetHandle} />
          <View style={styles.ttSheetHeader}><LiveIcon name={item.icon} size={27} /><Text style={styles.ttSheetTitle}>{item.title}</Text><Pressable onPress={() => setPanel(null)}><LiveIcon name="close" size={24} /></Pressable></View>
          <Text style={styles.ttSheetBody}>{item.body}</Text>
          {editable ? <TextInput value={panel === "game" ? game : goal} onChangeText={panel === "game" ? setGame : setGoal} placeholder={panel === "game" ? "e.g. Mobile Legends" : "e.g. Reach 1,000 likes"} placeholderTextColor="#777" style={styles.ttSheetInput} autoFocus /> : null}
          {panel === "share" ? <Pressable style={styles.ttSheetPrimary} onPress={onShare}><Text style={styles.ttSheetPrimaryText}>Share LIVE</Text></Pressable> : null}
          {panel === "poll" ? <Pressable style={styles.ttSheetPrimary} onPress={() => setPanel(null)}><Text style={styles.ttSheetPrimaryText}>Create poll</Text></Pressable> : null}
          {editable ? <Pressable style={styles.ttSheetPrimary} onPress={() => setPanel(null)}><Text style={styles.ttSheetPrimaryText}>Save</Text></Pressable> : null}
          {!editable && panel !== "share" && panel !== "poll" ? <Pressable style={styles.ttSheetSecondary} onPress={() => setPanel(null)}><Text style={styles.ttSheetSecondaryText}>Done</Text></Pressable> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function LiveCentrePill() {
  return <View style={styles.liveCentre}><Text style={styles.liveCentreIcon}>▶</Text><Text style={styles.liveCentreText}>LIVE centre</Text></View>;
}

function LiveTool({ icon, label, badge, muted, onPress }: { icon: string; label: string; badge?: boolean; muted?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.ttLiveTool}>
      <View style={styles.ttToolIconWrap}><LiveIcon name={icon} size={35} color={muted ? "#777" : WHITE} />{badge ? <View style={styles.ttBadge} /> : null}</View>
      <Text style={[styles.ttLiveToolLabel, muted && styles.ttMutedLabel]} numberOfLines={1}>{label}</Text>
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
  broadcastModeInactive: { color: "#888", fontSize: 14, fontWeight: "800" },

  ttLiveScreen: { flex: 1, backgroundColor: "#000" },
  ttPreviewFallback: { ...StyleSheet.absoluteFillObject, backgroundColor: "#45494a" },
  ttDimOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,.10)" },
  ttTopBar: { position: "absolute", left: 0, right: 0, zIndex: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 26 },
  ttClose: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  ttTopActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  ttRewardPill: { height: 58, paddingHorizontal: 20, borderRadius: 30, backgroundColor: "rgba(65,65,65,.84)", flexDirection: "row", alignItems: "center", gap: 10 },
  ttRewardText: { color: WHITE, fontSize: 18, lineHeight: 22, fontWeight: "800" },
  ttCircleAction: { width: 58, height: 58, borderRadius: 29, backgroundColor: "rgba(65,65,65,.84)", alignItems: "center", justifyContent: "center" },
  ttMusicBanner: { position: "absolute", left: 42, right: 42, height: 112, zIndex: 45, borderRadius: 22, backgroundColor: "rgba(75,75,75,.78)", flexDirection: "row", alignItems: "center", paddingHorizontal: 20, gap: 16 },
  ttMusicDisc: { width: 62, height: 62, borderRadius: 31, backgroundColor: "#6c87a8", alignItems: "center", justifyContent: "center" },
  ttMusicDiscText: { color: WHITE, fontSize: 34 },
  ttMusicCopy: { flex: 1 },
  ttMusicTitle: { color: WHITE, fontSize: 21, lineHeight: 26, fontWeight: "800" },
  ttMusicSub: { color: WHITE, fontSize: 17, lineHeight: 22, fontWeight: "600", marginTop: 4 },
  ttOverlayScroll: { flex: 1 },
  ttOverlayContent: { paddingHorizontal: 38 },
  ttHowToRow: { height: 74, borderRadius: 22, backgroundColor: PILL, flexDirection: "row", alignItems: "center", paddingHorizontal: 24, gap: 14 },
  ttHowToText: { flex: 1, color: WHITE, fontSize: 20, lineHeight: 25, fontWeight: "700" },
  ttChevron: { color: WHITE, fontSize: 38, lineHeight: 40, fontWeight: "200" },
  ttToolGrid: { marginTop: 480, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  ttLiveTool: { width: "19%", minWidth: 58, alignItems: "center", marginBottom: 28 },
  ttToolIconWrap: { width: 54, height: 48, alignItems: "center", justifyContent: "center", position: "relative" },
  ttLiveToolLabel: { color: WHITE, fontSize: 14, lineHeight: 18, fontWeight: "600", textAlign: "center", marginTop: 7 },
  ttMutedLabel: { color: "#858585" },
  ttBadge: { position: "absolute", right: 1, top: 0, width: 9, height: 9, borderRadius: 5, backgroundColor: RED },
  ttBottomCard: { backgroundColor: "rgba(26,26,26,.76)", borderRadius: 26, padding: 20, marginTop: 12 },
  ttTitleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  ttAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,.35)", alignItems: "center", justifyContent: "center" },
  ttAvatarText: { color: WHITE, fontSize: 18, fontWeight: "900" },
  ttTitleInput: { flex: 1, color: WHITE, fontSize: 20, lineHeight: 26, fontWeight: "700", paddingVertical: 6 },
  ttOptionRow: { flexDirection: "row", alignItems: "center", marginTop: 12, minHeight: 38 },
  ttOptionButton: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  ttOptionText: { color: WHITE, fontSize: 16, lineHeight: 20, fontWeight: "700" },
  ttOptionDivider: { width: 1, height: 24, backgroundColor: "rgba(255,255,255,.22)", marginHorizontal: 12 },
  ttGoLiveButton: { height: 68, borderRadius: 36, backgroundColor: RED, alignItems: "center", justifyContent: "center", marginTop: 14 },
  ttGoLiveText: { color: WHITE, fontSize: 21, lineHeight: 26, fontWeight: "900" },
  ttModeSelector: { paddingVertical: 18, gap: 28, alignItems: "center" },
  ttModeTab: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 8 },
  ttModeActive: { color: WHITE, fontSize: 17, lineHeight: 21, fontWeight: "900" },
  ttModeInactive: { color: "#858585", fontSize: 17, lineHeight: 21, fontWeight: "800" },
  ttBottomModeBar: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(8,8,8,.58)", flexDirection: "row", justifyContent: "center", gap: 24, zIndex: 40, paddingTop: 9 },
  ttModeBottomItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  ttBottomActive: { color: WHITE, fontSize: 15, lineHeight: 19, fontWeight: "900" },
  ttBottomInactive: { color: "#858585", fontSize: 15, lineHeight: 19, fontWeight: "800" },
  ttTabNav: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 42, zIndex: 35 },
  ttTabActive: { color: WHITE, fontSize: 18, lineHeight: 22, fontWeight: "900" },
  ttTabInactive: { color: "#999", fontSize: 18, lineHeight: 22, fontWeight: "800" },
  ttError: { position: "absolute", left: 24, right: 24, padding: 10, borderRadius: 14, backgroundColor: "rgba(80,0,15,.9)", zIndex: 60 },
  ttErrorText: { color: WHITE, textAlign: "center", fontSize: 12, fontWeight: "700" },
  ttModalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.55)", justifyContent: "flex-end" },
  ttSheet: { backgroundColor: "#171717", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 34, borderTopWidth: 1, borderColor: "rgba(255,255,255,.12)" },
  ttSheetHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: "#777", alignSelf: "center", marginBottom: 18 },
  ttSheetHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  ttSheetTitle: { flex: 1, color: WHITE, fontSize: 22, lineHeight: 28, fontWeight: "900" },
  ttSheetBody: { color: "#c5c5c5", fontSize: 16, lineHeight: 23, marginTop: 14 },
  ttSheetInput: { color: WHITE, backgroundColor: "#242424", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, marginTop: 16 },
  ttSheetPrimary: { height: 54, borderRadius: 28, backgroundColor: RED, alignItems: "center", justifyContent: "center", marginTop: 18 },
  ttSheetPrimaryText: { color: WHITE, fontSize: 17, fontWeight: "900" },
  ttSheetSecondary: { height: 52, borderRadius: 26, backgroundColor: "#2a2a2a", alignItems: "center", justifyContent: "center", marginTop: 12 },
  ttSheetSecondaryText: { color: WHITE, fontSize: 16, fontWeight: "800" },
});
