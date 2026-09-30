import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import FreeMediaEditor, { DEFAULT_MEDIA_EDIT_PLAN } from "../components/free-media-editor";

export default function MediaEditorScreen() {
  const params = useLocalSearchParams();
  const [value, setValue] = useState<any>(() => {
    try { return JSON.parse(String(params.editPlan ?? "")) || DEFAULT_MEDIA_EDIT_PLAN; } catch { return DEFAULT_MEDIA_EDIT_PLAN; }
  });
  const mode = String(params.mode ?? "VIDEO") as any;
  const close = () => {
    void SecureStore.setItemAsync("twitok_media_edit_plan", JSON.stringify(value)).then(() => router.back()).catch(() => router.back());
  };
  return <FreeMediaEditor visible={true} mode={mode} value={value} onChange={setValue} onClose={close} />;
}
