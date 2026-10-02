import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, PanResponder, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { getAuthToken } from "../lib/auth";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

type LiveSticker = { id: string; emoji: string; x: number; y: number; scale: number; rotation: number; animation: "NONE" | "BOUNCE" | "PULSE" | "FLOAT" };

type Studio = {
  background: string;
  backgroundUrl: string | null;
  effect: string;
  filter: string;
  stickers: LiveSticker[];
  beauty: number;
  layout: string;
  guestLimit: number;
  commentsFilterEnabled: boolean;
  autoCaptions: boolean;
  giftAlerts: boolean;
  lowLatency: boolean;
  recordingEnabled: boolean;
  screenShareEnabled: boolean;
};

const DEFAULTS: Studio = {
  background: "NONE", backgroundUrl: null, effect: "NONE", filter: "NONE", stickers: [], beauty: 0, layout: "SOLO",
  guestLimit: 15, commentsFilterEnabled: true, autoCaptions: true, giftAlerts: true,
  lowLatency: true, recordingEnabled: false, screenShareEnabled: false
};

const BACKGROUNDS = [
  ["NONE","No background","○"],["BLUR","Soft blur","◌"],["STUDIO","Creator Studio","▣"],["SUNSET","Sunset","☀"],
  ["CITY","City lights","⌂"],["GOLD","Gold","◆"],["KENTE","Kente","▦"],["NIGHT","Night","☾"],["NEON","Neon room","✦"],
  ["BEACH","Beach","⌁"],["FOREST","Forest","♣"],["MOUNTAINS","Mountains","▲"],["SPACE","Space","✧"],["GALAXY","Galaxy","✦"],
  ["AURORA","Aurora","≋"],["CLOUDS","Clouds","☁"],["CHERRY","Cherry","●"],["SAKURA","Sakura","✿"],["TROPICAL","Tropical","🌴"],
  ["OCEAN","Ocean","≈"],["DESERT","Desert","◇"],["LUXURY","Luxury","♛"],["CONCERT","Concert","♫"],["SPORTS","Sports","★"],
  ["NEWS","Newsroom","▤"],["OFFICE","Office","▥"],["CLASSROOM","Classroom","▧"],["CAFE","Cafe","☕"],["STAGE","Stage","◉"],
  ["FIRE","Fire","♨"],["RAIN","Rain","☂"],["HEARTS","Hearts","♥"],["PRIDE","Pride","🏳️‍🌈"],["GHANA","Ghana","★"],["AFRICA","Africa","◆"],
  ["ROYAL","Royal Palace","♛"],["GOLD_COAST","Gold Coast","◆"],["ASHANTI","Ashanti Court","✦"],["ADINKRA","Adinkra","▦"],
  ["BAOBAB","Baobab","♣"],["SAFARI","Safari","◎"],["LAGOS","Lagos skyline","⌂"],["ACCRA","Accra skyline","⌂"],
  ["CAPE_COAST","Cape Coast","▤"],["KUMASI","Kumasi","✦"],["DUBAI","Dubai","◇"],["PARIS","Paris","✿"],["TOKYO","Tokyo","◉"],
  ["NEW_YORK","New York","⌂"],["LONDON","London","♜"],["RIO","Rio","☀"],["SANTORINI","Santorini","≈"],["ICELAND","Iceland","❄"],
  ["HALLOWEEN","Halloween","🎃"],["CHRISTMAS","Christmas","🎄"],["NEW_YEAR","New Year","🎆"],["BIRTHDAY","Birthday","🎂"],
  ["WEDDING","Wedding","💍"],["GRADUATION","Graduation","🎓"],["ROMANCE","Romance","♥"],["COMEDY","Comedy stage","😂"],
  ["GAMING","Gaming room","🎮"],["PODCAST","Podcast studio","🎙️"],["MUSIC","Music studio","🎵"],["BEAUTY_ROOM","Beauty room","💄"],
  ["TECH","Tech studio","⌘"],["CREATOR_LOFT","Creator loft","▣"],["MINIMAL","Minimal white","□"],["DARK_LUXE","Dark luxe","◆"],
  ["CUSTOM","My photo","＋"]
] as const;
const FILTERS = ["NONE","BEAUTY","VIVID","WARM","COOL","MONO","CINEMATIC","VINTAGE","DREAM","FADE","SUNNY","DUSK","POP","FILM","NOIR","GLOW","SHARP","SOFT","PORTRAIT","PARTY","FESTIVAL","GOLDEN","TEAL","ROSE","AMBER","ARCTIC","COFFEE","LATTE","MINT","LAVENDER","PEACH","CORAL","CRIMSON","SAPPHIRE","EMERALD","PLATINUM","CHROME","MATRIX","RETRO","POLAROID","ANIME","CANDY","TOY","SKETCH","ILLUSTRATION","HALFTONE","VHS","CYBERPUNK","SUNSET","MOONLIGHT","AFRICAN_SUN","KENTE_TONE","GOLD_DUST","ROYAL","DRAMA","THRILLER","FAIRY","MAGIC","PARTY_LIGHTS","NEON_POP","STUDIO_CLEAN"];
const EFFECTS = ["NONE","BEAUTY","VIVID","WARM","COOL","MONO"];
const STICKERS = ["❤️","😂","🔥","👏","😍","🥳","✨","⭐","💯","🎉","🎁","🎵","🎤","👑","💎","🌟","💫","🌈","☀️","🌙","☁️","⚡","🌸","🌺","🌴","🦋","🐝","🍀","🍕","🍔","🍹","⚽","🏆","🎮","📸","🎬","🇬🇭","🇳🇬","🇰🇪","🇿🇦","🇺🇸","🇬🇧","🇨🇦","🇧🇷","🇫🇷","🇩🇪","🇯🇵","🇮🇳","🇨🇳","🇦🇺","🇿🇦","🙏","💪","🤩","😎","🥰","😘","😇","🤗","🤯","😱","😴","🤔","🙌","👏🏻","👏🏿","✌️","🤟","👌","👍","👎","💖","💗","💓","💞","💥","💦","💨","🌍","🌎","🌏","🌍","🪩","🎈","🎊","🎀","🧿","🪄","🦄","🐼","🐯","🦁","🐘","🦒","🐒","🌻","🌹","🌷","🍓","🍉","🍍","🥭","🍌","🌶️","🍿","🍩","☕","🥤","🍾","🎧","🎹","🥁","🎸","🎻","🎭","🎨","🖌️","🎯","🏅","🏀","🏈","⚾","🎾","🏎️","✈️","🚀","💡","📱","💻","🔔","💬","❤️‍🔥","🫶","🕺","💃","🕊️","🌺","🌊","🌙","⭐","🌟","✨"];
const LAYOUTS = ["SOLO","DUO","TRIO","GRID","PANEL","PIP"];

export default function LiveStudioScreen() {
  const { streamId } = useLocalSearchParams<{ streamId?: string }>();
  const [studio, setStudio] = useState<Studio>(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [customPreview, setCustomPreview] = useState<string | null>(null);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const studioRef = useRef(studio);
  studioRef.current = studio;

  const headers = async (json = false) => {
    const token = await getAuthToken();
    return { ...(json ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: "Bearer " + token } : {}) };
  };

  const normalizeStickers = (items: unknown): LiveSticker[] => {
    if (!Array.isArray(items)) return [];
    return items.slice(0, 32).map((item, index) => {
      if (typeof item === "string") return { id: item + "-" + index, emoji: item, x: 50, y: 28 + (index % 4) * 14, scale: 1, rotation: 0, animation: "NONE" as const };
      const value = item as Partial<LiveSticker>;
      const animation = value.animation === "BOUNCE" || value.animation === "PULSE" || value.animation === "FLOAT" ? value.animation : "NONE";
      return { id: String(value.id ?? value.emoji ?? "sticker-" + index), emoji: String(value.emoji ?? "✨").slice(0, 16), x: Math.min(100, Math.max(0, Number(value.x ?? 50))), y: Math.min(100, Math.max(0, Number(value.y ?? 35))), scale: Math.min(3, Math.max(.5, Number(value.scale ?? 1))), rotation: Math.min(180, Math.max(-180, Number(value.rotation ?? 0))), animation };
    }).filter(item => item.emoji) as LiveSticker[];
  };

  const load = async () => {
    if (!streamId) return;
    const res = await fetch(API + "/live/streams/" + encodeURIComponent(String(streamId)) + "/studio", { headers: await headers() });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const next = { ...DEFAULTS, ...(data.studio ?? {}) };
      next.stickers = normalizeStickers(data.studio?.stickers);
      setStudio(next);
      if (!selectedStickerId && next.stickers[0]) setSelectedStickerId(next.stickers[0].id);
    }
    else setMessage(data.error || "Unable to load LIVE Studio.");
  };

  useEffect(() => { void load(); }, [streamId]);

  const save = async (patch: Partial<Studio>) => {
    if (!streamId || busy) return;
    setBusy(true); setMessage("");
    try {
      const next = { ...studio, ...patch };
      const res = await fetch(API + "/live/streams/" + encodeURIComponent(String(streamId)) + "/studio", {
        method: "PATCH", headers: await headers(true), body: JSON.stringify(patch)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save LIVE Studio settings");
      setStudio({ ...next, ...(data.studio ?? {}) });
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save LIVE Studio settings"); }
    finally { setBusy(false); }
  };

  const uploadBackground = async () => {
    if (!streamId || busy) return;
    const pick = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 1
    });
    if (pick.canceled || !pick.assets[0]?.uri) return;
    const asset = pick.assets[0];
    setBusy(true); setMessage("");
    try {
      const mimeType = asset.mimeType && /^image\/(jpeg|png|webp)$/i.test(asset.mimeType) ? asset.mimeType : "image/jpeg";
      const sign = await fetch(API + "/live/streams/" + encodeURIComponent(String(streamId)) + "/studio/background-upload-url", {
        method: "POST", headers: await headers(true), body: JSON.stringify({ mimeType })
      });
      const signed = await sign.json().catch(() => ({}));
      if (!sign.ok) throw new Error(signed.error || "Unable to prepare background upload");
      const blob = await (await fetch(asset.uri)).blob();
      const upload = await fetch(String(signed.uploadUrl), { method: "PUT", headers: { "Content-Type": mimeType }, body: blob });
      if (!upload.ok) throw new Error("Background upload failed");
      setCustomPreview(asset.uri);
      const res = await fetch(API + "/live/streams/" + encodeURIComponent(String(streamId)) + "/studio", {
        method: "PATCH", headers: await headers(true),
        body: JSON.stringify({ background: "CUSTOM", backgroundUrl: String(signed.objectKey) })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save custom background");
      setStudio(old => ({ ...old, ...(data.studio ?? {}), background: "CUSTOM", backgroundUrl: String(signed.objectKey) }));
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not set custom background"); }
    finally { setBusy(false); }
  };

  const selectedPreviewSticker = studio.stickers.find(item => item.id === selectedStickerId) ?? null;
  const previewPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => Boolean(selectedPreviewSticker && previewSize.width > 0 && previewSize.height > 0),
    onMoveShouldSetPanResponder: (_, gesture) => Boolean(selectedPreviewSticker && (Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3)),
    onPanResponderGrant: () => {
      if (selectedPreviewSticker) dragStart.current = { x: selectedPreviewSticker.x, y: selectedPreviewSticker.y };
    },
    onPanResponderMove: (_, gesture) => {
      if (!selectedPreviewSticker || !dragStart.current || !previewSize.width || !previewSize.height) return;
      const nextX = Math.min(100, Math.max(0, dragStart.current.x + (gesture.dx / previewSize.width) * 100));
      const nextY = Math.min(100, Math.max(0, dragStart.current.y + (gesture.dy / previewSize.height) * 100));
      setStudio(current => ({ ...current, stickers: current.stickers.map(item => item.id === selectedPreviewSticker.id ? { ...item, x: nextX, y: nextY } : item) }));
    },
    onPanResponderRelease: () => {
      dragStart.current = null;
      const current = studioRef.current.stickers.find(item => item.id === selectedStickerId);
      if (current) void save({ stickers: studioRef.current.stickers });
    },
    onPanResponderTerminate: () => { dragStart.current = null; }
  }), [selectedPreviewSticker, previewSize.width, previewSize.height, selectedStickerId]);
  const backgroundLabel = useMemo(() => BACKGROUNDS.find(x => x[0] === studio.background)?.[1] ?? studio.background, [studio.background]);
  const SCENE_PRESETS = [
    { id: "CREATOR", label: "Creator", icon: "🎬", background: "CREATOR_LOFT", filter: "STUDIO_CLEAN", effect: "BEAUTY", beauty: 25, layout: "SOLO" },
    { id: "PODCAST", label: "Podcast", icon: "🎙️", background: "PODCAST", filter: "CINEMATIC", effect: "NONE", beauty: 10, layout: "DUO" },
    { id: "GAMING", label: "Gaming", icon: "🎮", background: "GAMING", filter: "CYBERPUNK", effect: "VIVID", beauty: 0, layout: "GRID" },
    { id: "NEWS", label: "News", icon: "📰", background: "NEWS", filter: "STUDIO_CLEAN", effect: "NONE", beauty: 0, layout: "PANEL" },
    { id: "BEAUTY", label: "Beauty", icon: "💄", background: "BEAUTY_ROOM", filter: "SOFT", effect: "BEAUTY", beauty: 55, layout: "SOLO" },
    { id: "AFRICA", label: "Africa", icon: "🌍", background: "AFRICA", filter: "AFRICAN_SUN", effect: "WARM", beauty: 15, layout: "SOLO" }
  ] as const;

  if (!streamId) return <View style={styles.center}><Text style={styles.title}>LIVE Studio session not found.</Text></View>;

  return <View style={styles.root}>
    <View style={styles.header}>
      <Pressable onPress={() => router.back()}><Text style={styles.back}>‹</Text></Pressable>
      <View><Text style={styles.headerTitle}>LIVE Studio</Text><Text style={styles.headerSub}>Advanced creator controls</Text></View>
      <Text style={styles.liveDot}>●</Text>
    </View>

    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.hero} onLayout={event => setPreviewSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })} {...previewPanResponder.panHandlers}>
        {customPreview && studio.background === "CUSTOM" ? <Image source={{ uri: customPreview }} style={StyleSheet.absoluteFill} /> : <View style={styles.sceneFill}><Text style={styles.sceneIcon}>🎬</Text><Text style={styles.sceneTitle}>{backgroundLabel}</Text></View>}
        {studio.stickers.map(sticker => <Pressable key={sticker.id} onPress={() => setSelectedStickerId(sticker.id)} style={[styles.previewSticker, { left: `${sticker.x}%`, top: `${sticker.y}%`, transform: [{ translateX: -18 }, { translateY: -18 }, { scale: sticker.scale }, { rotate: `${sticker.rotation}deg` }] }, selectedStickerId === sticker.id && styles.previewStickerSelected]}><Text style={styles.previewStickerText}>{sticker.emoji}</Text></Pressable>)}
        <View style={styles.sceneOverlay}><Text style={styles.sceneBadge}>9:16 LIVE SCENE</Text><Text style={styles.sceneCaption}>{studio.layout} • {studio.filter} • Beauty {studio.beauty}%</Text>{selectedPreviewSticker ? <Text style={styles.dragHint}>Drag {selectedPreviewSticker.emoji} to reposition</Text> : <Text style={styles.dragHint}>Tap a sticker to select it</Text>}</View>
      </View>

      <Section title="Background">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {BACKGROUNDS.map(([id,label]) => <Pressable key={id} style={[styles.choice, studio.background === id && styles.choiceActive]} onPress={() => id === "CUSTOM" ? void uploadBackground() : void save({ background: id })}><Text style={styles.choiceIcon}>{id === "CUSTOM" ? "＋" : id === "BLUR" ? "◌" : "✦"}</Text><Text style={styles.choiceText}>{label}</Text></Pressable>)}
        </ScrollView>
        <Text style={styles.note}>Choose a preset or upload your own photo. The selected scene is saved to this LIVE.</Text>
      </Section>

      <Section title="Quick scene presets">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {SCENE_PRESETS.map(preset => <Pressable key={preset.id} style={[styles.preset, studio.background === preset.background && studio.filter === preset.filter && styles.presetActive]} disabled={busy} onPress={() => void save({ background: preset.background, filter: preset.filter, effect: preset.effect, beauty: preset.beauty, layout: preset.layout })}>
            <Text style={styles.presetIcon}>{preset.icon}</Text><Text style={styles.presetText}>{preset.label}</Text>
          </Pressable>)}
        </ScrollView>
        <Text style={styles.note}>One tap applies a complete scene setup. You can fine-tune every setting afterward.</Text>
      </Section>

      <Section title="Filters">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {FILTERS.map(filter => <Pressable key={filter} style={[styles.pill, studio.filter === filter && styles.pillActive]} onPress={() => void save({ filter })}><Text style={styles.pillText}>{filter}</Text></Pressable>)}
        </ScrollView>
        <Text style={styles.note}>Live filters are selectable independently from beauty controls.</Text>
      </Section>

      <Section title="Stickers & AR placement">
        <View style={styles.stickerGrid}>
          {STICKERS.map((sticker, index) => {
            const existing = studio.stickers.find(item => item.emoji === sticker);
            return <Pressable key={sticker + index} style={[styles.sticker, existing && styles.stickerActive]} onPress={() => {
              if (existing) {
                const next = studio.stickers.filter(item => item.id !== existing.id);
                void save({ stickers: next });
                if (selectedStickerId === existing.id) setSelectedStickerId(next[0]?.id ?? null);
              } else if (studio.stickers.length < 32) {
                const created: LiveSticker = { id: sticker + "-" + Date.now(), emoji: sticker, x: 50, y: 32 + (studio.stickers.length % 4) * 14, scale: 1, rotation: 0, animation: "FLOAT" };
                setSelectedStickerId(created.id);
                void save({ stickers: [...studio.stickers, created] });
              }
            }}><Text style={styles.stickerText}>{sticker}</Text></Pressable>;
          })}
        </View>
        <Text style={styles.note}>{studio.stickers.length}/32 stickers. Select a sticker, then adjust its position, size, rotation and animation.</Text>
        <View style={styles.layerHeader}>
          <Text style={styles.layerTitle}>Sticker layers</Text>
          <Pressable disabled={!studio.stickers.length || busy} onPress={() => { setSelectedStickerId(null); void save({ stickers: [] }); }}><Text style={styles.clearText}>Clear all</Text></Pressable>
        </View>
        {studio.stickers.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.layerRow}>
          {studio.stickers.map((item, index) => <Pressable key={item.id} style={[styles.layerChip, selectedStickerId === item.id && styles.layerChipActive]} onPress={() => setSelectedStickerId(item.id)}>
            <Text style={styles.layerEmoji}>{item.emoji}</Text><Text style={styles.layerIndex}>#{index + 1}</Text>
          </Pressable>)}
        </ScrollView> : null}

        {(() => {
          const selected = studio.stickers.find(item => item.id === selectedStickerId);
          if (!selected) return null;
          const patchSelected = (patch: Partial<LiveSticker>) => void save({ stickers: studio.stickers.map(item => item.id === selected.id ? { ...item, ...patch } : item) });
          return <View style={styles.stickerEditor}>
            <Text style={styles.editorTitle}>Editing {selected.emoji}</Text>
            <View style={styles.controlRow}><Text style={styles.label}>Horizontal</Text><Pressable style={styles.adjust} onPress={() => patchSelected({ x: Math.max(0, selected.x - 5) })}><Text style={styles.adjustText}>−</Text></Pressable><Text style={styles.value}>{Math.round(selected.x)}%</Text><Pressable style={styles.adjust} onPress={() => patchSelected({ x: Math.min(100, selected.x + 5) })}><Text style={styles.adjustText}>+</Text></Pressable></View>
            <View style={styles.controlRow}><Text style={styles.label}>Vertical</Text><Pressable style={styles.adjust} onPress={() => patchSelected({ y: Math.max(0, selected.y - 5) })}><Text style={styles.adjustText}>−</Text></Pressable><Text style={styles.value}>{Math.round(selected.y)}%</Text><Pressable style={styles.adjust} onPress={() => patchSelected({ y: Math.min(100, selected.y + 5) })}><Text style={styles.adjustText}>+</Text></Pressable></View>
            <View style={styles.controlRow}><Text style={styles.label}>Size</Text><Pressable style={styles.adjust} onPress={() => patchSelected({ scale: Math.max(.5, Number((selected.scale - .25).toFixed(2))) })}><Text style={styles.adjustText}>−</Text></Pressable><Text style={styles.value}>{selected.scale.toFixed(2)}×</Text><Pressable style={styles.adjust} onPress={() => patchSelected({ scale: Math.min(3, Number((selected.scale + .25).toFixed(2))) })}><Text style={styles.adjustText}>+</Text></Pressable></View>
            <View style={styles.controlRow}><Text style={styles.label}>Rotation</Text><Pressable style={styles.adjust} onPress={() => patchSelected({ rotation: Math.max(-180, selected.rotation - 15) })}><Text style={styles.adjustText}>−</Text></Pressable><Text style={styles.value}>{Math.round(selected.rotation)}°</Text><Pressable style={styles.adjust} onPress={() => patchSelected({ rotation: Math.min(180, selected.rotation + 15) })}><Text style={styles.adjustText}>+</Text></Pressable></View>
            <View style={styles.wrap}>{(["NONE","BOUNCE","PULSE","FLOAT"] as const).map(animation => <Pressable key={animation} style={[styles.pill, selected.animation === animation && styles.pillActive]} onPress={() => patchSelected({ animation })}><Text style={styles.pillText}>{animation}</Text></Pressable>)}</View>
            <View style={styles.wrap}>
              <Pressable style={styles.toolButton} onPress={() => patchSelected({ x: 50, y: 50, scale: 1, rotation: 0 })}><Text style={styles.toolText}>↺ Reset</Text></Pressable>
              <Pressable style={styles.toolButton} onPress={() => {
                if (studio.stickers.length >= 32) return;
                const copy: LiveSticker = { ...selected, id: selected.id + "-copy-" + Date.now(), x: Math.min(100, selected.x + 6), y: Math.min(100, selected.y + 6) };
                setSelectedStickerId(copy.id);
                void save({ stickers: [...studio.stickers, copy] });
              }}><Text style={styles.toolText}>＋ Duplicate</Text></Pressable>
              <Pressable style={styles.toolButtonDanger} onPress={() => {
                const next = studio.stickers.filter(item => item.id !== selected.id);
                setSelectedStickerId(next[0]?.id ?? null);
                void save({ stickers: next });
              }}><Text style={styles.toolText}>Delete</Text></Pressable>
            </View>
            <View style={styles.layerActions}>
              <Text style={styles.layerActionLabel}>Layer order</Text>
              {(() => {
                const index = studio.stickers.findIndex(item => item.id === selected.id);
                const move = (targetIndex: number) => {
                  if (index < 0 || targetIndex < 0 || targetIndex >= studio.stickers.length || targetIndex === index) return;
                  const next = [...studio.stickers];
                  const [item] = next.splice(index, 1);
                  next.splice(targetIndex, 0, item);
                  void save({ stickers: next });
                };
                return <>
                  <Pressable disabled={index >= studio.stickers.length - 1 || busy} style={[styles.layerMoveButton, (index >= studio.stickers.length - 1 || busy) && styles.layerMoveDisabled]} onPress={() => move(index + 1)}>
                    <Text style={styles.toolText}>↑ Forward</Text>
                  </Pressable>
                  <Pressable disabled={index <= 0 || busy} style={[styles.layerMoveButton, (index <= 0 || busy) && styles.layerMoveDisabled]} onPress={() => move(index - 1)}>
                    <Text style={styles.toolText}>↓ Back</Text>
                  </Pressable>
                  <Pressable disabled={index < 0 || index === studio.stickers.length - 1 || busy} style={[styles.layerMoveButton, (index < 0 || index === studio.stickers.length - 1 || busy) && styles.layerMoveDisabled]} onPress={() => move(studio.stickers.length - 1)}>
                    <Text style={styles.toolText}>⇧ Front</Text>
                  </Pressable>
                  <Pressable disabled={index <= 0 || busy} style={[styles.layerMoveButton, (index <= 0 || busy) && styles.layerMoveDisabled]} onPress={() => move(0)}>
                    <Text style={styles.toolText}>⇩ Back</Text>
                  </Pressable>
                </>;
              })()}
            </View>
          </View>;
        })()}
      </Section>

      <Section title="Effects & beauty">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {EFFECTS.map(effect => <Pressable key={effect} style={[styles.pill, studio.effect === effect && styles.pillActive]} onPress={() => void save({ effect })}><Text style={styles.pillText}>{effect}</Text></Pressable>)}
        </ScrollView>
        <View style={styles.sliderRow}><Text style={styles.label}>Beauty</Text><TextInput keyboardType="number-pad" value={String(studio.beauty)} onChangeText={v => setStudio(s => ({ ...s, beauty: Math.min(100, Math.max(0, Number(v.replace(/[^0-9]/g, "" ) || 0))) }))} onBlur={() => void save({ beauty: studio.beauty })} style={styles.number}/><Text style={styles.percent}>%</Text></View>
      </Section>

      <Section title="Scene layout">
        <View style={styles.wrap}>{LAYOUTS.map(layout => <Pressable key={layout} style={[styles.pill, studio.layout === layout && styles.pillActive]} onPress={() => void save({ layout })}><Text style={styles.pillText}>{layout}</Text></Pressable>)}</View>
      </Section>

      <Section title="Guests & interaction">
        <View style={styles.sliderRow}><Text style={styles.label}>Maximum guest slots</Text><TextInput keyboardType="number-pad" value={String(studio.guestLimit)} onChangeText={v => setStudio(s => ({ ...s, guestLimit: Math.min(15, Math.max(1, Number(v.replace(/[^0-9]/g, "" ) || 1))) }))} onBlur={() => void save({ guestLimit: studio.guestLimit })} style={styles.number}/></View>
        <Toggle label="Comment filtering" value={studio.commentsFilterEnabled} onChange={commentsFilterEnabled => void save({ commentsFilterEnabled })}/>
        <Toggle label="Auto captions" value={studio.autoCaptions} onChange={autoCaptions => void save({ autoCaptions })}/>
        <Toggle label="Gift alerts" value={studio.giftAlerts} onChange={giftAlerts => void save({ giftAlerts })}/>
      </Section>

      <Section title="Broadcast">
        <Toggle label="Low-latency mode" value={studio.lowLatency} onChange={lowLatency => void save({ lowLatency })}/>
        <Toggle label="Record LIVE" value={studio.recordingEnabled} onChange={recordingEnabled => void save({ recordingEnabled })}/>
        <Toggle label="Screen share ready" value={studio.screenShareEnabled} onChange={screenShareEnabled => void save({ screenShareEnabled })}/>
      </Section>

      {message ? <Text style={styles.error}>{message}</Text> : null}
      <Pressable style={styles.go} disabled={busy} onPress={() => router.replace({ pathname: "/live-host", params: { streamId: String(streamId), studioReady: "1" } })}><Text style={styles.goText}>{busy ? "Saving…" : "Continue to LIVE preview"}</Text></Pressable>
      <Text style={styles.footer}>TwiTok LIVE Studio • up to 15 guests • scenes • effects • moderation • gifts</Text>
    </ScrollView>
  </View>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <View style={styles.toggle}><Text style={styles.label}>{label}</Text><Switch value={value} onValueChange={onChange} /></View>;
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:"#070707"}, center:{flex:1,backgroundColor:"#070707",alignItems:"center",justifyContent:"center",padding:24},
  header:{paddingTop:54,paddingHorizontal:16,paddingBottom:12,flexDirection:"row",alignItems:"center",gap:12,borderBottomWidth:1,borderBottomColor:"#202020"},
  title:{color:"#fff",fontSize:20,fontWeight:"900",textAlign:"center"},
  back:{color:"#fff",fontSize:36,lineHeight:36},headerTitle:{color:"#fff",fontSize:20,fontWeight:"900"},headerSub:{color:"#888",fontSize:11,marginTop:2},liveDot:{color:"#ff2d55",fontSize:18,marginLeft:"auto"},
  content:{padding:14,paddingBottom:35},hero:{height:310,borderRadius:22,overflow:"hidden",backgroundColor:"#171717",borderWidth:1,borderColor:"#2b2b2b",marginBottom:16},
  sceneFill:{flex:1,alignItems:"center",justifyContent:"center",backgroundColor:"#1c1c2c"},sceneIcon:{fontSize:48},sceneTitle:{color:"#fff",fontSize:19,fontWeight:"900",marginTop:8},
  sceneOverlay:{position:"absolute",left:12,right:12,bottom:12,backgroundColor:"rgba(0,0,0,.62)",borderRadius:14,padding:10},
  stickerPreview:{color:"#fff",fontSize:22,marginTop:5},previewSticker:{position:"absolute",zIndex:10,width:36,height:36,alignItems:"center",justifyContent:"center"},previewStickerSelected:{borderWidth:1,borderColor:"#fff",borderRadius:10,backgroundColor:"rgba(255,45,85,.18)"},previewStickerText:{fontSize:28},dragHint:{color:"#aaa",fontSize:9,marginTop:4},sceneBadge:{color:"#ff6b87",fontSize:10,fontWeight:"900"},sceneCaption:{color:"#fff",fontSize:11,marginTop:4},
  section:{backgroundColor:"#111",borderRadius:18,padding:14,marginBottom:12,borderWidth:1,borderColor:"#242424"},sectionTitle:{color:"#fff",fontSize:15,fontWeight:"900",marginBottom:11},
  row:{gap:8},choice:{width:100,height:82,borderRadius:14,backgroundColor:"#1b1b1b",borderWidth:1,borderColor:"#303030",alignItems:"center",justifyContent:"center"},choiceActive:{borderColor:"#ff2d55",backgroundColor:"#241116"},choiceIcon:{color:"#fff",fontSize:22},choiceText:{color:"#ddd",fontSize:10,fontWeight:"800",marginTop:6,textAlign:"center"},note:{color:"#777",fontSize:10,lineHeight:15,marginTop:10},
  pill:{paddingHorizontal:13,paddingVertical:9,borderRadius:20,backgroundColor:"#1d1d1d",borderWidth:1,borderColor:"#303030",marginRight:7,marginBottom:7},preset:{width:92,height:82,borderRadius:16,backgroundColor:"#1b1b1b",borderWidth:1,borderColor:"#303030",alignItems:"center",justifyContent:"center",marginRight:8},presetActive:{borderColor:"#ff2d55",backgroundColor:"#241116"},presetIcon:{fontSize:25},presetText:{color:"#fff",fontSize:10,fontWeight:"900",marginTop:6},pillActive:{backgroundColor:"#ff2d55",borderColor:"#ff2d55"},pillText:{color:"#fff",fontSize:11,fontWeight:"900"},
  wrap:{flexDirection:"row",flexWrap:"wrap"},
  stickerGrid:{flexDirection:"row",flexWrap:"wrap",gap:7},sticker:{width:42,height:42,borderRadius:13,backgroundColor:"#1d1d1d",borderWidth:1,borderColor:"#303030",alignItems:"center",justifyContent:"center"},stickerActive:{borderColor:"#ff2d55",backgroundColor:"#241116"},stickerText:{fontSize:21},stickerEditor:{marginTop:12,padding:12,borderRadius:14,backgroundColor:"#171717",borderWidth:1,borderColor:"#2d2d2d"},editorTitle:{color:"#fff",fontWeight:"900",marginBottom:8},controlRow:{flexDirection:"row",alignItems:"center",gap:8,marginBottom:8},adjust:{width:34,height:34,borderRadius:10,backgroundColor:"#252525",alignItems:"center",justifyContent:"center"},adjustText:{color:"#fff",fontSize:20,fontWeight:"900"},value:{color:"#fff",fontWeight:"800",minWidth:50,textAlign:"center"},sliderRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingVertical:9},label:{color:"#fff",fontSize:12,fontWeight:"800"},number:{width:70,backgroundColor:"#1d1d1d",borderRadius:10,color:"#fff",paddingVertical:8,paddingHorizontal:10,textAlign:"center",borderWidth:1,borderColor:"#333"},percent:{color:"#888",marginLeft:-36,marginRight:12},toggle:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingVertical:7},
  error:{color:"#ff91a8",fontSize:12,fontWeight:"800",marginBottom:10},layerHeader:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:10,marginBottom:7},layerTitle:{color:"#fff",fontSize:11,fontWeight:"900"},clearText:{color:"#ff91a8",fontSize:11,fontWeight:"900"},layerRow:{gap:7},layerChip:{minWidth:55,height:46,borderRadius:12,backgroundColor:"#1d1d1d",borderWidth:1,borderColor:"#303030",alignItems:"center",justifyContent:"center",paddingHorizontal:8},layerChipActive:{borderColor:"#ff2d55",backgroundColor:"#241116"},layerEmoji:{fontSize:20},layerIndex:{color:"#777",fontSize:8,marginTop:2},toolButton:{paddingHorizontal:11,paddingVertical:8,borderRadius:12,backgroundColor:"#252525",borderWidth:1,borderColor:"#383838",marginRight:7,marginTop:8},toolButtonDanger:{paddingHorizontal:11,paddingVertical:8,borderRadius:12,backgroundColor:"#32151c",borderWidth:1,borderColor:"#6b2535",marginRight:7,marginTop:8},layerActions:{flexDirection:"row",alignItems:"center",flexWrap:"wrap",marginTop:4},layerActionLabel:{color:"#888",fontSize:10,fontWeight:"800",marginRight:7},layerMoveButton:{paddingHorizontal:10,paddingVertical:8,borderRadius:11,backgroundColor:"#252525",borderWidth:1,borderColor:"#383838",marginRight:7,marginTop:4},layerMoveDisabled:{opacity:.4},toolText:{color:"#fff",fontSize:10,fontWeight:"900"},go:{backgroundColor:"#ff2d55",borderRadius:26,paddingVertical:16,alignItems:"center"},goText:{color:"#fff",fontSize:15,fontWeight:"900"},footer:{color:"#666",fontSize:10,textAlign:"center",marginTop:12}
});
