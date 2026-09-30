import { useEffect, useRef, useState } from "react";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { ActivityIndicator, Alert, Animated, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { getAuthToken } from "../lib/auth";
import * as SecureStore from "expo-secure-store";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
type Asset = { uri: string; mimeType?: string | null; duration?: number | null; fileSize?: number | null; fileName?: string | null };
type ClipSetting = { speed: number; volume: number; muted: boolean };
type StickerOverlay = { stickerId: string; startMs: number; endMs: number; x: number; y: number; size: number; rotation: number };
const DEFAULT_CLIP_SETTING: ClipSetting = { speed: 1, volume: 1, muted: false };
const TRANSITIONS = ["NONE","FADE","DISSOLVE","WIPELEFT","WIPERIGHT","SLIDELEFT","SLIDERIGHT"];
const BASE_STICKERS = [["africa","🌍"],["ghana","🇬🇭"],["nigeria","🇳🇬"],["kenya","🇰🇪"],["south-africa","🇿🇦"],["celebrate","🎉"],["love","❤️"],["fire","🔥"],["laugh","😂"],["wow","😮"],["clap","👏"],["dance","💃"],["drum","🥁"],["music","🎶"],["community","🤝"],["food","🍲"]] as const;
const EMOJI_CATALOG = "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🤩 🥳 🥸 🤗 🤭 🫢 🫣 🤫 🤔 🫡 🤐 😐 😑 😶 🫥 😏 😒 🙄 😬 😮‍💨 🤥 🫨 😴 🤤 😪 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🤯 🤠 😕 🫤 😟 🙁 ☹️ 😮 😯 😲 😳 🥺 🥹 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👹 👺 👻 👽 👾 🤖 😺 😸 😹 😻 😼 😽 🙀 😿 😾 🙈 🙉 🙊 💌 💘 💝 💖 💗 💓 💞 💕 💟 ❣️ ❤️‍🔥 ❤️ 🩷 🧡 💛 💚 💙 🩵 💜 🤎 🖤 🩶 🤍 💋 💯 💢 💥 💫 💦 💨 💬 💭 💤 👋 🤚 🖐️ ✋ 🖖 🫱 🫲 🫳 🫴 🫷 🫸 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 🖕 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🙏 ✍️ 💅 🤳 💪 🦾 🦿 🦵 🦶 👂 👃 🧠 🫀 🫁 🦷 🦴 👀 👁️ 👅 👄 👶 🧒 👦 👧 🧑 👨 👩 🧓 👴 👵 🙍 🙎 🙅 🙆 💁 🙋 🧏 🙇 🤦 🤷 💇 💆 🧖 🛀 🛌 🧘 🧍 🧎 🚶 🏃 💃 🕺 👯 👮 🕵️ 💂 🥷 👷 🤴 👸 👑 🎅 🤶 🧙 🧚 🧛 🧜 🧝 🧞 🧟 💐 🌸 💮 🪷 🏵️ 🌹 🥀 🌺 🌻 🌼 🌷 🪻 🌱 🪴 🌲 🌳 🌴 🌵 🎋 🎍 🍀 ☘️ 🍁 🍂 🍃 🍄 🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐽 🐸 🐵 🐒 🐔 🐧 🐦 🐤 🐣 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🪱 🦋 🐌 🐞 🐜 🪰 🪲 🪳 🦟 🦗 🕷️ 🦂 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦀 🦞 🦐 🐠 🐟 🐡 🦈 🐬 🐳 🐋 🦭 🐊 🐅 🐆 🦓 🦍 🦧 🐘 🦏 🦛 🐪 🐫 🦒 🦘 🦬 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🦙 🐐 🦌 🐕 🐈 🐓 🦃 🕊️ 🦢 🦩 🦚 🦜 🦥 🦦 🦨 🦡 🐾 🐉 🐲 🌍 🌎 🌏 🌙 ☀️ ⭐ 🌟 ✨ ⚡ 🔥 🌈 ☁️ ❄️ ☃️ ☔ 💧 🌊 🌪️ 🌋 🌌 🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🫛 🥦 🥬 🥒 🌶️ 🫑 🌽 🥕 🫒 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🫓 🥪 🥙 🧆 🌮 🌯 🫔 🍜 🍝 🍣 🍤 🍚 🍛 🍱 🥟 🥠 🥡 🍦 🍧 🍨 🍩 🍪 🎂 🍰 🧁 🍫 🍿 🍭 🍬 🍮 ☕ 🧃 🥤 🧋 🍺 🍻 🍷 🥂 🍾 🧊 ⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🎱 🪀 🪁 🏆 🥇 🥈 🥉 🎮 🕹️ 🎲 ♟️ 🎯 🎳 🎸 🎹 🥁 🎺 🎻 🎤 🎧 🎬 📷 📱 💻 ⌚ 💡 🔦 📚 ✏️ 📝 📌 📎 🔒 🔑 🔔 ❤️ 👍 🔥 🚀 💎 💰 🎁 🎈 🎉 🎊 🪅 🧨 ✅ ❌ ⚠️ ❗ ❓ ⁉️ 💯 🆗 🆕 🆙 🆒 🏳️ 🏴 🏁 🚩".split(/\s+/).filter(Boolean);
const COUNTRY_CODES = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");
const FLAG_STICKERS = COUNTRY_CODES.map(code => ["flag-"+code, String.fromCodePoint(...code.split("").map(c => 0x1F1E6 + c.charCodeAt(0)-65))] as const);
const emojiStickerId = (emoji:string) => "emoji-"+Array.from(emoji).map(c => c.codePointAt(0)!.toString(16)).join("-");
const EMOJI_STICKERS = EMOJI_CATALOG.map((emoji,i) => [emojiStickerId(emoji), emoji, "emoji-"+i] as const);

export default function CreateScreen() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [editPlan, setEditPlan] = useState<any>({ quality:"HD", filter:"NONE", crop:"ORIGINAL", rotate:0, mirror:false, speed:1, aiTool:"NONE", aiPrompt:"" });
  const [selectedClip, setSelectedClip] = useState(0);
  const advanceToNextClip = useRef(false);
  const [mode, setMode] = useState<"VIDEO"|"PHOTO"|"TEXT">("VIDEO");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [mentions, setMentions] = useState("");
  const [location, setLocation] = useState("");
  const [autoCaptions, setAutoCaptions] = useState(true);
  const [captionLanguage, setCaptionLanguage] = useState("auto");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [speed, setSpeed] = useState(1);
  const [effect, setEffect] = useState("NONE");
  const [visibility, setVisibility] = useState("PUBLIC");
  const [comments, setComments] = useState(true);
  const [duet, setDuet] = useState(true);
  const [stitch, setStitch] = useState(true);
  const [coverTimeMs, setCoverTimeMs] = useState(0);
  const [trimStartMs, setTrimStartMs] = useState(0);
  const [trimEndMs, setTrimEndMs] = useState(0);
  const [originalVolume, setOriginalVolume] = useState(1);
  const [addedSoundVolume, setAddedSoundVolume] = useState(1);
  const { soundId: incomingSoundId, soundTitle: incomingSoundTitle, recordedUri, recordedDuration, recordedEffect, recordedSpeed, editPlan: incomingEditPlan, aiOutputUri, aiOutputMimeType, aiOutputDuration } = useLocalSearchParams<{ soundId?: string; soundTitle?: string; recordedUri?: string; recordedDuration?: string; recordedEffect?: string; recordedSpeed?: string; editPlan?: string; aiOutputUri?: string; aiOutputMimeType?: string; aiOutputDuration?: string }>();
  const [soundId, setSoundId] = useState(String(incomingSoundId ?? ""));
  const [soundTitle, setSoundTitle] = useState(String(incomingSoundTitle ?? ""));
  useEffect(() => {
    const raw = String(incomingEditPlan ?? "");
    if (raw) { try { setEditPlan(JSON.parse(raw)); } catch {} }
    void SecureStore.getItemAsync("twitok_media_edit_plan").then(value => { if (value) { try { setEditPlan(JSON.parse(value)); } catch {} void SecureStore.deleteItemAsync("twitok_media_edit_plan"); } }).catch(() => undefined);
  }, [incomingEditPlan]);
  useEffect(() => {
    const uri = String(recordedUri ?? "");
    if (!uri) return;
    const duration = Number(recordedDuration ?? 0);
    replaceAssets([{ uri, mimeType: "video/mp4", duration: duration > 0 ? duration : null }]);
    setMode("VIDEO");
    const nextSpeed = Number(recordedSpeed ?? 1);
    if ([0.5, 1, 1.5, 2].includes(nextSpeed)) {
      setSpeed(nextSpeed);
      setClipSettings([{ ...DEFAULT_CLIP_SETTING, speed: nextSpeed }]);
    }
    if (recordedEffect && ["NONE","VIBRANT","WARM","COOL","NOIR","VINTAGE"].includes(String(recordedEffect))) {
      setEffect(String(recordedEffect));
    }
  }, [recordedUri, recordedDuration, recordedEffect, recordedSpeed]);
  const [overlayText, setOverlayText] = useState("");
  const [overlayStartMs, setOverlayStartMs] = useState(0);
  const [overlayEndMs, setOverlayEndMs] = useState(3000);
  const [overlayX, setOverlayX] = useState(0.5);
  const [overlayY, setOverlayY] = useState(0.8);
  const [stickers, setStickers] = useState<StickerOverlay[]>([]);
  const [stickerTab, setStickerTab] = useState<"emoji"|"flags">("emoji");
  const [customEmoji, setCustomEmoji] = useState("");
  const durationMs = assets.reduce((sum, asset) => sum + (asset.duration ?? 0), 0);
  const [clipSettings, setClipSettings] = useState<ClipSetting[]>([]);
  const [clipTrimRanges, setClipTrimRanges] = useState<{startMs:number;endMs:number|null}[]>([]);
  const [clipTransitions, setClipTransitions] = useState<{type:string;durationMs:number}[]>([]);
  const [transitioning, setTransitioning] = useState(false);
  const transitionOpacity = useRef(new Animated.Value(0)).current;
  const transitionTranslate = useRef(new Animated.Value(0)).current;
  const player = useVideoPlayer(assets[0]?.uri ?? null);
  player.timeUpdateEventInterval = 0.25;
  const timeUpdate = useEvent(player, "timeUpdate");
  const currentTime = timeUpdate?.currentTime ?? 0;
  const previewDurationMs = Math.max(1, (player.duration || (assets[0]?.duration ?? durationMs / 1000) || 1) * 1000);
  const selectedRange = clipTrimRanges[selectedClip] ?? { startMs: 0, endMs: assets[selectedClip]?.duration ? Math.round(assets[selectedClip].duration as number) : null };
  const selectedClipDurationMs = Math.max(1000, Math.round(assets[selectedClip]?.duration ?? previewDurationMs));
  const selectedClipEndMs = selectedRange.endMs ?? selectedClipDurationMs;
  const selectedClipStartMs = Math.min(selectedRange.startMs, Math.max(0, selectedClipEndMs - 500));
  const previewTimeMs = Math.max(0, Math.min(previewDurationMs, currentTime * 1000));
  const activeClipSetting = clipSettings[selectedClip] ?? DEFAULT_CLIP_SETTING;
  useEffect(() => {
    const asset = assets[selectedClip];
    if (!asset?.uri) return;
    player.pause();
    player.playbackRate = activeClipSetting.speed;
    player.volume = activeClipSetting.volume;
    player.muted = activeClipSetting.muted;
    void player.replaceAsync(asset.uri).then(() => {
      const range = clipTrimRanges[selectedClip];
      player.playbackRate = activeClipSetting.speed;
      player.volume = activeClipSetting.volume;
      player.muted = activeClipSetting.muted;
      player.currentTime = Math.max(0, range?.startMs ?? 0) / 1000;
      if (advanceToNextClip.current) {
        advanceToNextClip.current = false;
        const transition = clipTransitions[selectedClip - 1] ?? { type: "NONE", durationMs: 500 };
        const duration = Math.max(120, Math.min(1500, transition.durationMs || 500));
        if (transition.type !== "NONE") {
          setTransitioning(true);
          transitionOpacity.setValue(transition.type === "FADE" || transition.type === "DISSOLVE" ? 1 : 0);
          transitionTranslate.setValue(transition.type === "SLIDELEFT" || transition.type === "WIPERIGHT" ? 320 : transition.type === "SLIDERIGHT" || transition.type === "WIPELEFT" ? -320 : 0);
          Animated.parallel([
            Animated.timing(transitionOpacity, { toValue: 0, duration, useNativeDriver: true }),
            Animated.timing(transitionTranslate, { toValue: 0, duration, useNativeDriver: true })
          ]).start(() => setTransitioning(false));
        }
        player.play();
      }
    }).catch(() => undefined);
  }, [selectedClip, assets, clipTrimRanges, clipTransitions, activeClipSetting.speed, activeClipSetting.volume, activeClipSetting.muted, player, transitionOpacity, transitionTranslate]);
  useEffect(() => {
    if (!assets.length || !player.duration) return;
    const start = selectedClipStartMs / 1000;
    const end = selectedClipEndMs / 1000;
    if (currentTime < start) player.currentTime = start;
    else if (currentTime >= end) {
      if (selectedClip < assets.length - 1) {
        advanceToNextClip.current = true;
        setSelectedClip((value) => Math.min(value + 1, assets.length - 1));
      } else {
        player.pause();
        player.currentTime = start;
      }
    }
  }, [currentTime, selectedClipEndMs, selectedClipStartMs, assets.length, player]);
  function seekPreview(valueMs: number) {
    player.currentTime = Math.max(0, Math.min(previewDurationMs, valueMs)) / 1000;
  }

  function getCoverTimelineMs(localMs: number) {
    if (assets.length <= 1) return Math.max(trimStartMs, Math.min(localMs, trimEndMs || previewDurationMs));
    let total = 0;
    for (let i = 0; i < selectedClip; i += 1) {
      const range = clipTrimRanges[i] ?? { startMs: 0, endMs: assets[i]?.duration ? Math.round(assets[i].duration as number) : null };
      const rawDuration = Math.max(500, (range.endMs ?? Math.round(assets[i]?.duration ?? 0)) - range.startMs);
      const clipSpeed = [0.5, 0.75, 1, 1.5, 2].includes(Number(clipSettings[i]?.speed)) ? Number(clipSettings[i]?.speed) : 1;
      total += rawDuration / clipSpeed;
      const transition = clipTransitions[i];
      if (transition && transition.type !== "NONE") total -= Math.min(1500, Math.max(0, Number(transition.durationMs ?? 0)));
    }
    return Math.max(0, Math.round(total + Math.max(0, localMs - selectedClipStartMs) / (activeClipSetting.speed || 1)));
  }


  function replaceAssets(next: Asset[]) {
    setAssets(next);
    setClipSettings(next.map((_, i) => clipSettings[i] ?? { ...DEFAULT_CLIP_SETTING }));
    setClipTrimRanges(next.map((asset, i) => clipTrimRanges[i] ?? { startMs: 0, endMs: asset.duration ? Math.round(asset.duration) : null }));
    setClipTransitions(next.slice(0, Math.max(0, next.length - 1)).map((_, i) => clipTransitions[i] ?? ({ type: "NONE", durationMs: 500 })));
  }
  function moveClip(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= assets.length) return;

    const nextAssets = [...assets];
    [nextAssets[index], nextAssets[target]] = [nextAssets[target], nextAssets[index]];

    const nextSettings = [...clipSettings];
    [nextSettings[index], nextSettings[target]] = [
      nextSettings[target] ?? { ...DEFAULT_CLIP_SETTING },
      nextSettings[index] ?? { ...DEFAULT_CLIP_SETTING },
    ];

    const nextTrims = [...clipTrimRanges];
    [nextTrims[index], nextTrims[target]] = [
      nextTrims[target] ?? { startMs: 0, endMs: nextAssets[target]?.duration ? Math.round(nextAssets[target].duration as number) : null },
      nextTrims[index] ?? { startMs: 0, endMs: nextAssets[index]?.duration ? Math.round(nextAssets[index].duration as number) : null },
    ];

    const nextTransitions = [...clipTransitions];
    if (index < nextTransitions.length && target < nextTransitions.length) {
      [nextTransitions[index], nextTransitions[target]] = [nextTransitions[target], nextTransitions[index]];
    }

    if (selectedClip === index) setSelectedClip(target);
    else if (selectedClip === target) setSelectedClip(index);

    setAssets(nextAssets);
    setClipSettings(nextSettings);
    setClipTrimRanges(nextTrims);
    setClipTransitions(nextTransitions);
  }
  function setTransition(index: number, type: string) {
    setClipTransitions(prev => prev.map((x, i) => i === index ? { ...x, type } : x));
  }

  function updateClipSetting(index: number, patch: Partial<ClipSetting>) {
    setClipSettings(prev => prev.map((x, i) => i === index ? { ...(x ?? DEFAULT_CLIP_SETTING), ...patch } : x));
  }

  function chooseSound(){ router.push({ pathname:"/sounds", params:{ select:"1" } }); }

  async function pickPhotos() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 35, quality: 1 });
    if (!result.canceled) replaceAssets(result.assets.map(a => ({ uri: a.uri, mimeType: a.mimeType, fileSize: a.fileSize, fileName: a.fileName })));
  }

  async function recordPhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert("Camera permission", "Allow TwiTok to use your camera.");
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 });
    if (!result.canceled) replaceAssets(result.assets.map(a => ({ uri: a.uri, mimeType: a.mimeType, fileSize: a.fileSize, fileName: a.fileName })));
  }

  async function pickGallery() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 1,
      videoMaxDuration: 600
    });
    if (!result.canceled) replaceAssets(result.assets.map(a => ({ uri: a.uri, mimeType: a.mimeType, duration: a.duration, fileSize: a.fileSize, fileName: a.fileName })));
  }

  function recordVideo() {
    router.push("/camera");
  }

  async function publish(publishNow = true) {
    if ((mode !== "TEXT" && !assets.length) || (mode === "TEXT" && !caption.trim()) || busy) return;
    setBusy(true); setStatus("Preparing upload…");
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Sign in before posting.");
      if (mode === "TEXT") {
        const response = await fetch(API + "/video/posts/text", { method:"POST", headers:{"Content-Type":"application/json",Authorization:"Bearer "+token}, body:JSON.stringify({text:caption,hashtags:hashtags.split(/[,\s]+/).map(x=>x.replace(/^#/,"").trim()).filter(Boolean).slice(0,30),mentions:mentions.split(/[,\s]+/).map(x=>x.replace(/^@/,"").trim()).filter(Boolean).slice(0,30),location:location.trim(),visibility,allowComments:comments,allowDuet:duet,allowStitch:stitch}) });
        const data = await response.json().catch(()=>({})); if (!response.ok) throw new Error(data.error || "Unable to publish text post.");
        Alert.alert("Posted","Your TwiTok text post is live.",[{text:"View feed",onPress:()=>router.replace("/feed")}]); return;
      }
      if (mode === "PHOTO") {
        const uploadIds: string[] = [];
        for (let index=0; index<assets.length; index++) {
          const blob = await (await fetch(assets[index].uri)).blob();
          const mimeType = assets[index].mimeType || blob.type || "image/jpeg";
          const sessionResponse = await fetch(API+"/videos/photos/uploads",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({mimeType,sizeBytes:blob.size})});
          const session=await sessionResponse.json().catch(()=>({}));
          if(!sessionResponse.ok || !session.uploadId || !session.uploadUrl) throw new Error(session.error||"Unable to create photo upload.");
          const upload=await fetch(session.uploadUrl,{method:"PUT",headers:{"Content-Type":mimeType},body:blob}); if(!upload.ok) throw new Error("Photo upload failed.");
          const complete=await fetch(API+"/videos/photos/uploads/"+session.uploadId+"/complete",{method:"POST",headers:{Authorization:"Bearer "+token}}); if(!complete.ok) throw new Error("Unable to complete photo upload.");
          uploadIds.push(session.uploadId); setStatus("Uploading photo "+(index+1)+" of "+assets.length+"…");
        }
        const post=await fetch(API+"/videos/posts/photos",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({uploadIds,caption,visibility,allowComments:comments,mentions:mentions.split(/[,\s]+/).map(x=>x.replace(/^@/,"").trim()).filter(Boolean).slice(0,30),location:location.trim(),hashtags:hashtags.split(/[,\s]+/).map(x=>x.replace(/^#/,"").trim()).filter(Boolean).slice(0,30),allowDuet:duet,allowStitch:stitch,editPlan})});
        const data=await post.json().catch(()=>({})); if(!post.ok) throw new Error(data.error||"Unable to publish photo post.");
        Alert.alert("Posted","Your TwiTok photo post is live.",[{text:"View feed",onPress:()=>router.replace("/feed")}]); return;
      }
      const uploads: string[] = [];
      for (let index = 0; index < assets.length; index++) {
        const asset = assets[index];
        const blob = await (await fetch(asset.uri)).blob();
        const mimeType = asset.mimeType || blob.type || "video/mp4";
        if (!mimeType.startsWith("video/")) throw new Error("Only video clips are supported in this post.");
        setStatus(`Uploading clip ${index + 1} of ${assets.length}…`);
        const sessionResponse = await fetch(API + "/video/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ mimeType, sizeBytes: blob.size, durationMs: asset.duration ?? undefined })
        });
        const session = await sessionResponse.json().catch(() => ({}));
        if (!sessionResponse.ok || !session.uploadId) throw new Error(session.error || "Unable to create upload session.");
        if (!session.uploadUrl) throw new Error("Media storage is not configured.");
        const uploadResponse = await fetch(session.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: blob });
        if (!uploadResponse.ok) throw new Error("Clip upload failed.");
        const completeResponse = await fetch(API + "/video/uploads/" + session.uploadId + "/complete", { method: "POST", headers: { Authorization: "Bearer " + token } });
        if (!completeResponse.ok) {
          const d = await completeResponse.json().catch(() => ({}));
          throw new Error(d.error || "Unable to complete upload.");
        }
        uploads.push(session.uploadId);
      }

      setStatus("Creating your post…");
      const draftResponse = await fetch(API + "/video/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          uploadId: uploads[0],
          clipUploadIds: uploads,
          caption,
          hashtags: hashtags.split(/[,\s]+/).map(x=>x.replace(/^#/,"").trim()).filter(Boolean).slice(0,30),
          mentions: mentions.split(/[,\s]+/).map(x=>x.replace(/^@/,"").trim()).filter(Boolean).slice(0,30),
          location: location.trim(),
          visibility,
          allowComments: comments,
          allowDuet: duet,
          allowStitch: stitch,
          speed,
          effect,
          soundId: soundId || undefined,
          originalVolume,
          addedSoundVolume,
          coverTimeMs,
          trimStartMs,
          trimEndMs: trimEndMs || undefined,
          clipTrimRanges,
          clipTransitions,
          clipSettings,
          autoCaptions,
          captionLanguage,
          textOverlays: overlayText.trim() ? [{ text: overlayText.trim(), startMs: overlayStartMs, endMs: Math.max(overlayStartMs + 500, Math.min(overlayEndMs || (durationMs || 3000), durationMs || (overlayEndMs || 3000))), x: overlayX, y: overlayY, fontSize: 42, color: "#FFFFFF", background: "#000000@0.55", align: "center" }] : [],
        })
      });
      const draft = await draftResponse.json().catch(() => ({}));
      if (!draftResponse.ok || !draft.videoId) throw new Error(draft.error || "Unable to create post.");
      if (!publishNow) {
        Alert.alert("Draft saved", "Your video has been saved as a draft. You can publish it later.", [{ text: "Done", onPress: () => router.back() }]);
        return;
      }
      setStatus("Processing video…");
      for (let attempt = 0; attempt < 60; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const check = await fetch(API + "/video/" + draft.videoId, { headers: { Authorization: "Bearer " + token } });
        const video = await check.json().catch(() => ({}));
        if (video.status === "READY") break;
        if (video.status === "FAILED") throw new Error("Video processing failed.");
        if (attempt === 59) throw new Error("Video is still processing. Open your profile later to publish it.");
      }
      setStatus("Publishing…");
      const publishResponse = await fetch(API + "/video/" + draft.videoId + "/publish", { method: "POST", headers: { Authorization: "Bearer " + token } });
      const published = await publishResponse.json().catch(() => ({}));
      if (!publishResponse.ok) throw new Error(published.error || "Unable to publish post.");
      Alert.alert("Posted", "Your TwiTok video is now live.", [{ text: "View feed", onPress: () => router.replace("/feed") }]);
    } catch (e) {
      Alert.alert("Post failed", e instanceof Error ? e.message : "Unable to publish.");
    } finally { setBusy(false); setStatus(""); }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.close}>×</Text></Pressable>
        <Text style={styles.title}>Create</Text>
        <Pressable onPress={() => { void publish(); }} disabled={(mode==="TEXT" ? !caption.trim() : !assets.length) || busy}><Text style={[styles.post, ((mode==="TEXT" ? !caption.trim() : !assets.length) || busy) && styles.disabled]}>Post</Text></Pressable>
      </View>
      <View style={styles.modeRow}>{["VIDEO","PHOTO","TEXT"].map(v=><Pressable key={v} style={[styles.mode,mode===v&&styles.modeSelected]} onPress={()=>{setMode(v as any);setAssets([])}}><Text style={styles.modeText}>{v==="VIDEO"?"Video":v==="PHOTO"?"Photo":"Text"}</Text></Pressable>)}</View>
      {mode !== "TEXT" ? <View style={styles.modeRow}>
        <Pressable style={styles.mode} onPress={mode==="PHOTO"?recordPhoto:recordVideo}><Text style={styles.modeIcon}>●</Text><Text style={styles.modeText}>Camera</Text></Pressable>
        <Pressable style={styles.mode} onPress={mode==="PHOTO"?pickPhotos:pickGallery}><Text style={styles.modeIcon}>▣</Text><Text style={styles.modeText}>Gallery</Text></Pressable>
      </View> : null}
      <ScrollView contentContainerStyle={styles.content}>
        <TextInput value={caption} onChangeText={setCaption} placeholder="Describe your post…" placeholderTextColor="#777" style={styles.caption} multiline maxLength={2200} />
        {mode !== "TEXT" ? <TextInput value={hashtags} onChangeText={setHashtags} placeholder="#Ghana #TwiTok #Africa" placeholderTextColor="#777" style={styles.input} autoCapitalize="none" maxLength={500} /> : null}
        <TextInput value={mentions} onChangeText={setMentions} placeholder="@username @creator" placeholderTextColor="#777" style={styles.input} autoCapitalize="none" maxLength={500} />
        <TextInput value={location} onChangeText={setLocation} placeholder="📍 Add location" placeholderTextColor="#777" style={styles.input} maxLength={120} />
         {mode !== "TEXT" && assets.length ? <Pressable style={styles.editorButton} onPress={() => router.push({ pathname:"/media-editor", params:{ mode, editPlan: JSON.stringify(editPlan) } })}><Text style={styles.editorButtonIcon}>✦</Text><View style={{flex:1}}><Text style={styles.editorButtonTitle}>Edit & AI tools</Text><Text style={styles.editorButtonSub}>Free enhance, filters, crop, effects, captions, restyle & more</Text></View><Text style={styles.editorButtonArrow}>›</Text></Pressable> : null}\n        {mode !== "TEXT" && assets.length ? <Pressable style={styles.editorButton} onPress={() => router.push({ pathname:"/ai-restyle", params:{ uri: assets[selectedClip]?.uri ?? assets[0]?.uri, mimeType: assets[selectedClip]?.mimeType ?? assets[0]?.mimeType ?? (mode === "PHOTO" ? "image/jpeg" : "video/mp4"), mediaType: mode, duration: String(assets[selectedClip]?.duration ?? assets[0]?.duration ?? "") } })}><Text style={styles.editorButtonIcon}>✦</Text><View style={{flex:1}}><Text style={styles.editorButtonTitle}>AI Restyle Again</Text><Text style={styles.editorButtonSub}>Generate another version from the current result</Text></View><Text style={styles.editorButtonArrow}>›</Text></Pressable> : null}
        {assets.length ? <FlatList
           data={assets}
           horizontal
           keyExtractor={(a,i)=>a.uri+i}
           contentContainerStyle={styles.assets}
           renderItem={({item,index})=><Pressable style={[styles.clip,index===selectedClip&&styles.clipSelected]} onPress={()=>{ advanceToNextClip.current = false; setSelectedClip(index); }}>
             <Text style={styles.clipIcon}>▶</Text>
             <Text style={styles.clipText}>Clip {index+1}</Text>
             <View style={styles.clipActions}>
               <Pressable onPress={()=>moveClip(index,-1)}><Text style={styles.action}>‹</Text></Pressable>
               <Pressable onPress={()=>moveClip(index,1)}><Text style={styles.action}>›</Text></Pressable>
               <Pressable onPress={()=>{const next=assets.filter((_,i)=>i!==index);replaceAssets(next)}}><Text style={styles.remove}>×</Text></Pressable>
             </View>
           </Pressable>}
         /> : <View style={styles.empty}><Text style={styles.emptyIcon}>＋</Text><Text style={styles.emptyText}>Add videos from your gallery or record with camera</Text></View>}
        {mode === "VIDEO" && assets.length ? <View style={styles.previewCard}>
          <View style={styles.previewStage}>
            <VideoView player={player} style={styles.previewVideo} nativeControls={false} contentFit="contain" />
            {effect !== "NONE" ? <View pointerEvents="none" style={[styles.effectOverlay, effect === "VIBRANT" && styles.effectVibrant, effect === "WARM" && styles.effectWarm, effect === "COOL" && styles.effectCool, effect === "NOIR" && styles.effectNoir, effect === "VINTAGE" && styles.effectVintage]} /> : null}
            {transitioning ? <Animated.View pointerEvents="none" style={[styles.transitionOverlay, { opacity: transitionOpacity, transform: [{ translateX: transitionTranslate }] }]} /> : null}
          </View>
          <View style={styles.previewControls}>
            <Pressable style={styles.playButton} onPress={()=>player.playing ? player.pause() : player.play()}><Text style={styles.choiceText}>{player.playing ? "Pause" : "Play"}</Text></Pressable>
            <Text style={styles.timecode}>{(previewTimeMs/1000).toFixed(1)}s / {(previewDurationMs/1000).toFixed(1)}s</Text>
          </View>
          <View style={styles.scrubber}>
            <View style={styles.scrubberTrack}><View style={[styles.scrubberFill,{width:`${Math.min(100,(previewTimeMs/previewDurationMs)*100)}%`}]} /></View>
            <TextInput
              accessibilityLabel="Video timeline"
              value={String(Math.round(previewTimeMs))}
              onChangeText={v=>seekPreview(Number(v)||0)}
              keyboardType="numeric"
              style={styles.scrubberInput}
              placeholder="Position ms"
              placeholderTextColor="#777"
            />
          </View>
          <View style={styles.row}>
            <Pressable style={styles.small} onPress={()=>seekPreview(previewTimeMs-1000)}><Text style={styles.choiceText}>−1s</Text></Pressable>
            <Pressable style={styles.small} onPress={()=>seekPreview(previewTimeMs+1000)}><Text style={styles.choiceText}>+1s</Text></Pressable>
            <Pressable style={styles.small} onPress={()=>seekPreview(trimStartMs)}><Text style={styles.choiceText}>Start</Text></Pressable>
            <Pressable style={styles.small} onPress={()=>seekPreview(trimEndMs || previewDurationMs)}><Text style={styles.choiceText}>End</Text></Pressable>
          </View>
        </View> : null}
        {mode === "VIDEO" && assets.length > 1 ? <View style={styles.timelineBox}><View style={styles.timelineHeader}><Text style={styles.helper}>Clip timeline</Text><Text style={styles.timelineMeta}>Editing Clip {selectedClip + 1}</Text></View><View style={styles.timelineRow}>{assets.map((asset,i)=>{const range=clipTrimRanges[i] ?? {startMs:0,endMs:asset.duration?Math.round(asset.duration):null};const d=Math.max(500,Math.round((asset.duration ?? durationMs/Math.max(1,assets.length)) || 10000));const end=range.endMs ?? d;const span=Math.max(500,end-range.startMs);return <Pressable key={asset.uri+i} onPress={()=>{advanceToNextClip.current = false;setSelectedClip(i);setTimeout(()=>seekPreview(range.startMs),50);}} style={[styles.timelineClip,{width:Math.max(64,Math.min(220,64+span/100))},i===selectedClip&&styles.timelineClipSelected]}><Text style={styles.timelineClipText}>Clip {i+1}</Text><View style={styles.timelineRange}><View style={[styles.timelinePlayhead,{left:`${i===selectedClip?Math.max(0,Math.min(100,((previewTimeMs-range.startMs)/span)*100)):0}%`}]}/></View></Pressable>})}</View><View style={styles.timelineControls}><Pressable style={styles.small} onPress={()=>seekPreview(selectedClipStartMs)}><Text style={styles.choiceText}>Clip start</Text></Pressable><Pressable style={styles.small} onPress={()=>seekPreview(Math.max(selectedClipStartMs,selectedClipEndMs-100))}><Text style={styles.choiceText}>Clip end</Text></Pressable><Text style={styles.timelineMeta}>{(selectedClipStartMs/1000).toFixed(1)}s → {(selectedClipEndMs/1000).toFixed(1)}s</Text></View></View> : null}
         {mode === "VIDEO" && assets.length ? <View style={styles.coverBox}>
           <Text style={styles.helper}>Cover frame: {(coverTimeMs/1000).toFixed(1)}s</Text>
           <View style={styles.row}>
             <Pressable style={styles.small} onPress={()=>setCoverTimeMs(getCoverTimelineMs(previewTimeMs))}><Text style={styles.choiceText}>Use current position</Text></Pressable>
             <Pressable style={styles.small} onPress={()=>setCoverTimeMs(0)}><Text style={styles.choiceText}>First frame</Text></Pressable>
           </View>
         </View> : null}
        {mode === "VIDEO" && assets.length ? <View style={styles.trimBox}>
          <Text style={styles.helper}>Trim clip • {(trimStartMs/1000).toFixed(1)}s — {(trimEndMs ? trimEndMs/1000 : previewDurationMs/1000).toFixed(1)}s</Text>
          <View style={styles.trimTrack}
            onStartShouldSetResponder={()=>true}
            onMoveShouldSetResponder={()=>true}
            onResponderMove={(e)=>{
              const x=Math.max(0,Math.min(1,e.nativeEvent.locationX/Math.max(1,320)));
              const t=Math.round(x*previewDurationMs);
              if (Math.abs(t-trimStartMs) <= Math.abs(t-(trimEndMs || previewDurationMs))) {
                setTrimStartMs(Math.min(t,Math.max(0,(trimEndMs || previewDurationMs)-500)));
              } else {
                setTrimEndMs(Math.max(t,trimStartMs+500));
              }
              setCoverTimeMs(v=>Math.max(trimStartMs, Math.min(v, trimEndMs || previewDurationMs, t)));
            }}>
            <View style={styles.trimTrackBase}/>
            <View style={[styles.trimSelected,{left:`${(trimStartMs/previewDurationMs)*100}%`,right:`${100-((trimEndMs||previewDurationMs)/previewDurationMs)*100}%`}]} />
            <View style={[styles.trimHandle,{left:`${Math.max(0,Math.min(100,(trimStartMs/previewDurationMs)*100))}%`}]} />
            <View style={[styles.trimHandle,{left:`${Math.max(0,Math.min(100,((trimEndMs||previewDurationMs)/previewDurationMs)*100))}%`}]} />
          </View>
          <View style={styles.row}>
            <Pressable style={styles.small} onPress={()=>{setTrimStartMs(Math.max(0,trimStartMs-500));seekPreview(Math.max(0,trimStartMs-500));}}><Text style={styles.choiceText}>Start −0.5s</Text></Pressable>
            <Pressable style={styles.small} onPress={()=>{const e=Math.max(trimStartMs+500,(trimEndMs||previewDurationMs)-500);setTrimEndMs(e);seekPreview(e);}}><Text style={styles.choiceText}>End −0.5s</Text></Pressable>
            <Pressable style={styles.small} onPress={()=>{setTrimStartMs(0);setTrimEndMs(0);}}><Text style={styles.choiceText}>Full clip</Text></Pressable>
          </View>
        </View> : null}
        <Text style={styles.section}>Edit timeline</Text>
        {mode === "VIDEO" ? <>
          <Text style={styles.helper}>Trim start / end (milliseconds)</Text>
          <View style={styles.row}>
            <TextInput value={String(trimStartMs)} onChangeText={v=>setTrimStartMs(Math.max(0,Number(v)||0))} keyboardType="numeric" placeholder="Start" placeholderTextColor="#777" style={[styles.input,styles.trimInput]} />
            <TextInput value={String(trimEndMs)} onChangeText={v=>setTrimEndMs(Math.max(0,Number(v)||0))} keyboardType="numeric" placeholder="End (0 = full)" placeholderTextColor="#777" style={[styles.input,styles.trimInput]} />
          </View>
        </> : null}
        <Text style={styles.helper}>Selected clip speed</Text>
         <View style={styles.row}>{["0.5","1","1.5","2"].map(v=><Pressable key={v} style={[styles.choice,activeClipSetting.speed===Number(v)&&styles.selected]} onPress={()=>updateClipSetting(selectedClip,{speed:Number(v)})}><Text style={styles.choiceText}>{v}×</Text></Pressable>)}</View>
        <View style={styles.row}>{["NONE","VIBRANT","WARM","COOL","NOIR","VINTAGE"].map(v=><Pressable key={v} style={[styles.choice,effect===v&&styles.selected]} onPress={()=>setEffect(v)}><Text style={styles.choiceText}>{v}</Text></Pressable>)}</View>
        <TextInput value={overlayText} onChangeText={setOverlayText} placeholder="Add text overlay (optional)" placeholderTextColor="#777" style={styles.input} maxLength={150} />
        {mode === "VIDEO" ? <View>
          <Text style={styles.helper}>Text timing & position</Text>
          <View style={styles.row}>
            <TextInput value={String(overlayStartMs)} onChangeText={v=>setOverlayStartMs(Math.max(0,Number(v)||0))} keyboardType="numeric" placeholder="Start ms" placeholderTextColor="#777" style={[styles.input,styles.overlayInput]} />
            <TextInput value={String(overlayEndMs)} onChangeText={v=>setOverlayEndMs(Math.max(500,Number(v)||500))} keyboardType="numeric" placeholder="End ms" placeholderTextColor="#777" style={[styles.input,styles.overlayInput]} />
          </View>
          <View style={styles.row}>
            {[0.2,0.5,0.8].map(v=><Pressable key={v} style={[styles.choice,overlayX===v&&styles.selected]} onPress={()=>setOverlayX(v)}><Text style={styles.choiceText}>X {v}</Text></Pressable>)}
            {[0.2,0.5,0.8].map(v=><Pressable key={"y"+v} style={[styles.choice,overlayY===v&&styles.selected]} onPress={()=>setOverlayY(v)}><Text style={styles.choiceText}>Y {v}</Text></Pressable>)}
          </View>
        </View> : null}
        {mode === "VIDEO" && assets.length ? <View style={styles.clipTrimSection}>
          <Text style={styles.helper}>Per-clip trim</Text>
          {assets.map((asset, i) => {
            const range = clipTrimRanges[i] ?? { startMs: 0, endMs: asset.duration ? Math.round(asset.duration) : null };
            const duration = Math.max(1000, Math.round(asset.duration ?? (durationMs / Math.max(1, assets.length) || 10000)));
            const end = range.endMs ?? duration;
            const updateRange = (startMs:number, endMs:number) => setClipTrimRanges(prev => prev.map((x,j)=>j===i ? { startMs:Math.max(0,Math.min(startMs,endMs-500)), endMs:Math.max(startMs+500,Math.min(endMs,duration)) } : x));
            return <View key={asset.uri+i} style={styles.clipTrimRow}>
              <Text style={styles.label}>Clip {i+1}: {(range.startMs/1000).toFixed(1)}s → {(end/1000).toFixed(1)}s</Text>
              <View style={styles.row}>
                <Pressable style={styles.small} onPress={()=>updateRange(range.startMs-500,end)}><Text style={styles.choiceText}>Start −0.5s</Text></Pressable>
                <Pressable style={styles.small} onPress={()=>updateRange(range.startMs+500,end)}><Text style={styles.choiceText}>Start +0.5s</Text></Pressable>
                <Pressable style={styles.small} onPress={()=>updateRange(range.startMs,end-500)}><Text style={styles.choiceText}>End −0.5s</Text></Pressable>
                <Pressable style={styles.small} onPress={()=>updateRange(range.startMs,end+500)}><Text style={styles.choiceText}>End +0.5s</Text></Pressable>
                <Pressable style={styles.small} onPress={()=>updateRange(0,duration)}><Text style={styles.choiceText}>Full</Text></Pressable>
              </View>
            </View>;
          })}
        </View> : null}
        {mode === "VIDEO" && assets.length > 1 ? <View>
          <Text style={styles.helper}>Transitions between clips</Text>
          {assets.slice(0, -1).map((_, i) => <View key={i} style={styles.transitionRow}>
            <Text style={styles.label}>Clip {i + 1} → {i + 2}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.transitionChoices}>
              {TRANSITIONS.map(type => <Pressable key={type} style={[styles.choice, clipTransitions[i]?.type === type && styles.selected]} onPress={()=>setTransition(i,type)}><Text style={styles.choiceText}>{type}</Text></Pressable>)}
            </ScrollView>
          </View>)}
          <Text style={styles.helper}>Per-clip controls</Text>
          {assets.map((_, i) => <View key={i} style={styles.perClip}>
            <Text style={styles.label}>Clip {i + 1}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.transitionChoices}>
              {[0.5,0.75,1,1.5,2].map(v => <Pressable key={v} style={[styles.choice, clipSettings[i]?.speed === v && styles.selected]} onPress={()=>updateClipSetting(i,{speed:v})}><Text style={styles.choiceText}>{v}×</Text></Pressable>)}
              <Pressable style={[styles.choice, clipSettings[i]?.muted && styles.selected]} onPress={()=>updateClipSetting(i,{muted:!clipSettings[i]?.muted,volume:clipSettings[i]?.muted?1:0})}><Text style={styles.choiceText}>{clipSettings[i]?.muted ? "Muted" : "Sound on"}</Text></Pressable>
              {[0.25,0.5,0.75,1].map(v => <Pressable key={"vol"+v} style={[styles.choice, clipSettings[i]?.volume === v && !clipSettings[i]?.muted && styles.selected]} onPress={()=>updateClipSetting(i,{volume:v,muted:v===0})}><Text style={styles.choiceText}>{Math.round(v*100)}%</Text></Pressable>)}
            </ScrollView>
          </View>)}
        </View> : null}
        <Text style={styles.section}>Stickers & Emojis</Text>
         <View style={styles.row}>
           <Pressable style={[styles.choice,stickerTab==="emoji"&&styles.selected]} onPress={()=>setStickerTab("emoji")}><Text style={styles.choiceText}>😀 Emojis</Text></Pressable>
           <Pressable style={[styles.choice,stickerTab==="flags"&&styles.selected]} onPress={()=>setStickerTab("flags")}><Text style={styles.choiceText}>🌍 Flags (249)</Text></Pressable>
         </View>
         <View style={styles.emojiInputRow}>
           <TextInput value={customEmoji} onChangeText={setCustomEmoji} placeholder="Paste or type any emoji…" placeholderTextColor="#777" style={styles.emojiInput}/>
           <Pressable style={styles.small} onPress={()=>{const e=customEmoji.trim();if(!e)return;setStickers(prev=>[...prev,{stickerId:emojiStickerId(e),startMs:overlayStartMs,endMs:Math.max(overlayStartMs+500,overlayEndMs||3000),x:overlayX,y:overlayY,size:72,rotation:0}]);setCustomEmoji("");}}><Text style={styles.choiceText}>Add</Text></Pressable>
         </View>
         <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stickerRow}>
           {(stickerTab==="emoji"?EMOJI_STICKERS:FLAG_STICKERS).map((item:any)=><Pressable key={item[0]} style={styles.stickerChoice} onPress={()=>setStickers(prev=>prev.some(s=>s.stickerId===item[0])?prev.filter(s=>s.stickerId!==item[0]):[...prev,{stickerId:item[0],startMs:overlayStartMs,endMs:Math.max(overlayStartMs+500,overlayEndMs||3000),x:overlayX,y:overlayY,size:72,rotation:0}])}>
             <Text style={styles.stickerEmoji}>{item[1]}</Text>
             <Text style={styles.stickerName}>{stickers.some(s=>s.stickerId===item[0])?"Added":"Add"}</Text>
           </Pressable>)}
         </ScrollView>
         {stickers.length ? <View style={styles.row}>
           {[48,72,100,140].map(size=><Pressable key={size} style={[styles.choice,stickers[stickers.length-1]?.size===size&&styles.selected]} onPress={()=>setStickers(prev=>prev.map((s,i)=>i===prev.length-1?{...s,size}:s))}><Text style={styles.choiceText}>{size}px</Text></Pressable>)}
           {[{label:"Left",x:0.2},{label:"Center",x:0.5},{label:"Right",x:0.8}].map(p=><Pressable key={p.label} style={[styles.choice,stickers[stickers.length-1]?.x===p.x&&styles.selected]} onPress={()=>setStickers(prev=>prev.map((s,i)=>i===prev.length-1?{...s,x:p.x}:s))}><Text style={styles.choiceText}>{p.label}</Text></Pressable>)}
           <Pressable style={styles.small} onPress={()=>setStickers([])}><Text style={styles.choiceText}>Clear</Text></Pressable>
         </View> : null}
         <Text style={styles.section}>Sound</Text>
        <Pressable style={styles.soundButton} onPress={chooseSound}><Text style={styles.choiceText}>{soundId ? `♫ ${soundTitle || soundId}` : "Add sound"}</Text></Pressable>
        {soundId ? <Pressable onPress={()=>{setSoundId("");setSoundTitle("");}}><Text style={styles.clearSound}>Remove sound</Text></Pressable> : null}
        <Text style={styles.helper}>Audio mix</Text><Text style={styles.label}>Original audio {Math.round(originalVolume*100)}%</Text><View style={styles.row}>{[0,0.25,0.5,0.75,1].map(v=><Pressable key={"o"+v} style={[styles.choice,originalVolume===v&&styles.selected]} onPress={()=>setOriginalVolume(v)}><Text style={styles.choiceText}>{Math.round(v*100)}%</Text></Pressable>)}</View><Text style={styles.label}>Added sound {Math.round(addedSoundVolume*100)}%</Text><View style={styles.row}>{[0,0.25,0.5,0.75,1].map(v=><Pressable key={"a"+v} style={[styles.choice,addedSoundVolume===v&&styles.selected]} onPress={()=>setAddedSoundVolume(v)}><Text style={styles.choiceText}>{Math.round(v*100)}%</Text></Pressable>)}</View>
        <Text style={styles.section}>Cover</Text>
        <TextInput value={String(coverTimeMs)} onChangeText={v=>setCoverTimeMs(Math.max(0,Number(v)||0))} keyboardType="numeric" placeholder="Cover time in milliseconds" placeholderTextColor="#777" style={styles.input} />
        <Text style={styles.section}>Post settings</Text>
        <View style={styles.row}>{[["auto","Auto"],["en","English"],["tw","Twi"],["fr","Français"],["ha","Hausa"],["yo","Yorùbá"],["sw","Kiswahili"],["ar","العربية"]].map(([code,label])=><Pressable key={code} style={[styles.choice,captionLanguage===code&&styles.selected]} onPress={()=>{setCaptionLanguage(code);setAutoCaptions(true);}}><Text style={styles.choiceText}>{label}</Text></Pressable>)}</View>
        <Pressable style={[styles.choice,{marginHorizontal:16,marginTop:4},autoCaptions&&styles.selected]} onPress={()=>setAutoCaptions(v=>!v)}><Text style={styles.choiceText}>Auto captions: {autoCaptions?"On":"Off"}</Text></Pressable>
        <View style={styles.row}>{["PUBLIC","FOLLOWERS","PRIVATE"].map(v=><Pressable key={v} style={[styles.choice,visibility===v&&styles.selected]} onPress={()=>setVisibility(v)}><Text style={styles.choiceText}>{v}</Text></Pressable>)}</View>
        <View style={styles.row}>{[[comments,"Comments"],[duet,"Duet"],[stitch,"Stitch"]].map(([on,label])=><Pressable key={String(label)} style={[styles.choice,on&&styles.selected]} onPress={()=>{ if(label==="Comments") setComments(!comments); else if(label==="Duet") setDuet(!duet); else setStitch(!stitch); }}><Text style={styles.choiceText}>{label}: {on?"On":"Off"}</Text></Pressable>)}</View>
        {mode === "VIDEO" && assets.length ? <Pressable style={styles.draftButton} onPress={()=>publish(false)} disabled={busy}><Text style={styles.draftText}>Save to Drafts</Text></Pressable> : null}
        {busy ? <View style={styles.progress}><ActivityIndicator color="#fff" /><Text style={styles.status}>{status}</Text></View> : null}
      </ScrollView>
    </View>
  );
}
const styles=StyleSheet.create({
  editorButton:{marginTop:12,marginBottom:10,backgroundColor:"#102b38",borderWidth:1,borderColor:"#2f8eaf",borderRadius:16,padding:14,flexDirection:"row",alignItems:"center"},
  editorButtonIcon:{fontSize:24,color:"#62c9ec",fontWeight:"800",marginRight:10},
  editorButtonTitle:{fontSize:16,fontWeight:"800",color:"#fff"},
  editorButtonSub:{fontSize:11,color:"#a9bac6",marginTop:3},
  editorButtonArrow:{fontSize:30,color:"#62c9ec",marginLeft:8},
 screen:{flex:1,backgroundColor:"#000",paddingTop:48},clipActions:{position:"absolute",bottom:4,left:8,right:8,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},action:{color:"#fff",fontSize:24,fontWeight:"900"},transitionRow:{paddingHorizontal:16,paddingVertical:4},transitionChoices:{gap:6},perClip:{paddingHorizontal:16,paddingVertical:4},helper:{color:"#777",fontSize:12,paddingHorizontal:16,paddingTop:4},trimInput:{flex:1,minWidth:130,marginHorizontal:0},draftButton:{marginHorizontal:16,marginTop:14,borderWidth:1,borderColor:"#444",borderRadius:12,padding:14,alignItems:"center"},draftText:{color:"#fff",fontWeight:"800"},content:{paddingBottom:80},section:{color:"#fff",fontSize:17,fontWeight:"900",paddingHorizontal:16,paddingTop:12,paddingBottom:8},row:{flexDirection:"row",flexWrap:"wrap",gap:8,paddingHorizontal:16,paddingVertical:6},choice:{borderWidth:1,borderColor:"#333",borderRadius:10,paddingHorizontal:12,paddingVertical:9,backgroundColor:"#111"},selected:{borderColor:"#ff2d55",backgroundColor:"#241017"},choiceText:{color:"#fff",fontWeight:"700"},label:{color:"#aaa",paddingVertical:9},small:{borderWidth:1,borderColor:"#333",borderRadius:10,paddingHorizontal:10,paddingVertical:8},input:{marginHorizontal:16,marginVertical:6,borderRadius:12,backgroundColor:"#151515",color:"#fff",padding:12,fontSize:15},header:{height:54,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:"#222"},close:{color:"#fff",fontSize:34,fontWeight:"300"},title:{color:"#fff",fontSize:18,fontWeight:"800"},post:{color:"#ff2d55",fontSize:16,fontWeight:"900"},disabled:{color:"#555"},modeRow:{flexDirection:"row",justifyContent:"center",gap:30,paddingVertical:22},mode:{alignItems:"center",gap:6},modeIcon:{color:"#fff",fontSize:28},modeText:{color:"#fff",fontWeight:"700"},caption:{margin:16,minHeight:100,borderRadius:14,backgroundColor:"#151515",color:"#fff",padding:14,fontSize:16,textAlignVertical:"top"},assets:{paddingHorizontal:16,gap:10},clip:{width:110,height:145,borderRadius:12,backgroundColor:"#181818",alignItems:"center",justifyContent:"center",position:"relative"},clipSelected:{borderWidth:2,borderColor:"#ff2d55"},timelineBox:{marginHorizontal:16,marginTop:8,borderRadius:14,backgroundColor:"#0d0d0d",paddingVertical:10},timelineHeader:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},timelineMeta:{color:"#777",fontSize:12,paddingHorizontal:16},timelineRow:{flexDirection:"row",gap:6,paddingHorizontal:12,paddingVertical:10,alignItems:"center"},timelineClip:{height:48,borderRadius:8,backgroundColor:"#1b1b1b",padding:7,justifyContent:"space-between",borderWidth:1,borderColor:"#292929"},timelineClipSelected:{borderColor:"#ff2d55"},timelineClipText:{color:"#fff",fontSize:12,fontWeight:"800"},timelineRange:{height:5,borderRadius:3,backgroundColor:"#333",position:"relative",overflow:"hidden"},timelinePlayhead:{position:"absolute",top:0,bottom:0,width:3,backgroundColor:"#ff2d55"},timelineControls:{flexDirection:"row",alignItems:"center",gap:6,paddingHorizontal:12,paddingBottom:4},clipIcon:{color:"#fff",fontSize:30},clipText:{color:"#aaa",marginTop:8},remove:{position:"absolute",right:6,top:3,color:"#fff",fontSize:25},empty:{alignItems:"center",justifyContent:"center",padding:40},emptyIcon:{color:"#777",fontSize:60},emptyText:{color:"#888",textAlign:"center",fontSize:15},modeSelected:{borderBottomWidth:2,borderBottomColor:"#ff2d55"},progress:{alignItems:"center",gap:10,padding:20},status:{color:"#aaa"},soundButton:{marginHorizontal:16,marginVertical:6,borderRadius:12,backgroundColor:"#151515",borderWidth:1,borderColor:"#333",padding:14},clearSound:{color:"#ff2d55",fontWeight:"800",marginHorizontal:16,marginTop:4},effectOverlay:{position:"absolute",top:0,bottom:0,left:0,right:0},effectVibrant:{backgroundColor:"rgba(255,180,80,0.12)"},effectWarm:{backgroundColor:"rgba(255,140,40,0.18)"},effectCool:{backgroundColor:"rgba(60,150,255,0.16)"},effectNoir:{backgroundColor:"rgba(0,0,0,0.42)"},effectVintage:{backgroundColor:"rgba(150,90,40,0.20)"},
  previewCard:{marginHorizontal:16,marginTop:10,borderRadius:14,backgroundColor:"#0d0d0d",overflow:"hidden"},
  previewStage:{height:360,backgroundColor:"#000",position:"relative"},
  previewVideo:{width:"100%",height:"100%"},
  transitionOverlay:{position:"absolute",top:0,bottom:0,left:0,right:0,backgroundColor:"#000"},
  previewControls:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",padding:10},
  playButton:{borderWidth:1,borderColor:"#333",borderRadius:10,paddingHorizontal:12,paddingVertical:8},
  timecode:{color:"#aaa",fontSize:12},
  scrubber:{paddingHorizontal:12,paddingBottom:10},
  scrubberTrack:{height:5,borderRadius:3,backgroundColor:"#333",overflow:"hidden"},
  scrubberFill:{height:"100%",backgroundColor:"#ff2d55"},
  scrubberInput:{marginTop:8,borderWidth:1,borderColor:"#333",borderRadius:8,color:"#fff",padding:8},
  coverBox:{marginHorizontal:16,marginTop:8,padding:12,borderRadius:12,backgroundColor:"#0d0d0d"},
  trimBox:{marginHorizontal:16,marginTop:8,padding:12,borderRadius:12,backgroundColor:"#0d0d0d"},
  trimTrack:{height:44,borderRadius:8,backgroundColor:"#171717",position:"relative",overflow:"hidden",marginTop:8},
  trimTrackBase:{position:"absolute",left:0,right:0,top:18,height:8,backgroundColor:"#333"},
  trimSelected:{position:"absolute",top:14,bottom:14,backgroundColor:"rgba(255,45,85,.25)",borderLeftWidth:2,borderRightWidth:2,borderColor:"#ff2d55"},
  trimHandle:{position:"absolute",top:8,width:8,height:28,borderRadius:4,backgroundColor:"#fff",marginLeft:-4},
  overlayInput:{flex:1,minWidth:130,marginHorizontal:0},emojiInputRow:{flexDirection:"row",gap:8,paddingHorizontal:16,marginBottom:6},emojiInput:{flex:1,backgroundColor:"#151515",borderWidth:1,borderColor:"#333",borderRadius:10,color:"#fff",paddingHorizontal:12,height:42},stickerRow:{gap:8,paddingHorizontal:16,paddingVertical:6},stickerChoice:{width:62,height:62,borderRadius:12,backgroundColor:"#151515",borderWidth:1,borderColor:"#333",alignItems:"center",justifyContent:"center"},stickerEmoji:{fontSize:28},stickerName:{color:"#aaa",fontSize:9,fontWeight:"700"},
  clipTrimSection:{marginTop:8,paddingBottom:8},
  clipTrimRow:{marginHorizontal:16,marginBottom:8,padding:10,borderRadius:10,backgroundColor:"#0d0d0d"},
});
