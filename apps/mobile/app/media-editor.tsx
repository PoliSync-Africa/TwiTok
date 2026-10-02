import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import FreeMediaEditor, { DEFAULT_MEDIA_EDIT_PLAN } from "../components/free-media-editor";

const AI_PRESETS: Record<string, { style: string; prompt: string }> = {
  RESTORE: { style: "CLEAN", prompt: "Restore this media: remove noise and compression damage, recover natural detail, correct color and exposure, and preserve the original subject." },
  HD_ENHANCE: { style: "CLEAN", prompt: "Enhance this media to high quality with clean detail, balanced contrast, natural color, reduced noise and careful sharpening without artificial texture." },
  RELIGHT: { style: "VIBRANT", prompt: "Relight this media with balanced professional lighting, natural skin tones, preserved highlights and shadows, and realistic depth." },
  AI_SKY: { style: "CINEMATIC", prompt: "Improve the sky naturally and blend it into the scene with realistic lighting, color and edges while preserving the subject and environment." },
  CUTOUT: { style: "REALISTIC", prompt: "Create a clean, accurate subject cutout with precise edges, preserved hair detail and a natural-looking result." },
  CLEAN_MIRROR: { style: "CLEAN", prompt: "Clean and improve this mirrored media, reducing haze, glare, noise and artifacts while preserving natural detail." },
  COLORIZE: { style: "REALISTIC", prompt: "Colorize this media naturally with realistic skin tones, clothing, environment colors and consistent lighting." },
  AI_ART: { style: "ILLUSTRATION", prompt: "Transform this media into polished AI art while preserving the recognizable subject, composition and important details." },
  AI_PORTRAIT: { style: "PORTRAIT_PRO", prompt: "Create a polished professional portrait: improve face detail, natural skin tone, lighting and clothing detail, preserve identity and natural skin texture." },
  AI_STYLES: { style: "CINEMATIC", prompt: "Apply a polished contemporary visual style with cinematic composition, balanced color and realistic fine detail." },
  AI_EXPAND: { style: "REALISTIC", prompt: "Expand the image naturally beyond its current framing, continuing background, lighting and textures consistently." },
  REMOVE_TEXT: { style: "CLEAN", prompt: "Remove unwanted text or overlays and reconstruct the underlying area naturally, preserving surrounding texture and detail." },
  CHANGE_POSE: { style: "PORTRAIT_PRO", prompt: "Refine the subject pose naturally while preserving identity, anatomy, clothing and realistic skin texture." }
};

export default function MediaEditorScreen() {
  const params = useLocalSearchParams();
  const [value, setValue] = useState<any>(() => {
    try { return JSON.parse(String(params.editPlan ?? "")) || DEFAULT_MEDIA_EDIT_PLAN; } catch { return DEFAULT_MEDIA_EDIT_PLAN; }
  });
  const mode = String(params.mode ?? "VIDEO") as any;
  const close = () => {
    void SecureStore.setItemAsync("twitok_media_edit_plan", JSON.stringify(value)).then(() => router.back()).catch(() => router.back());
  };
  const runAI = () => {
    const tool = String(value.aiTool ?? "");
    const preset = AI_PRESETS[tool];
    if (!preset || !String(params.uri ?? "")) return;
    router.push({ pathname: "/ai-restyle", params: {
      uri: String(params.uri),
      mimeType: String(params.mimeType ?? (mode === "PHOTO" ? "image/jpeg" : "video/mp4")),
      mediaType: mode,
      duration: String(params.duration ?? ""),
      presetStyle: preset.style,
      presetPrompt: [preset.prompt, String(value.aiPrompt ?? "").trim()].filter(Boolean).join(" ")
    }});
  };
  return <FreeMediaEditor visible={true} mode={mode} value={value} onChange={setValue} onClose={close} onApplyAI={runAI} />;
}
