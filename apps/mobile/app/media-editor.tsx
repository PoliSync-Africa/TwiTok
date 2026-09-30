import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import FreeMediaEditor, { DEFAULT_MEDIA_EDIT_PLAN } from "../components/free-media-editor";

export default function MediaEditorScreen() {
  const params = useLocalSearchParams<{ mode?: string; editPlan?: string }>();
  const mode = String(params.mode ?? "VIDEO") as "VIDEO" | "PHOTO" | "TEXT";
  const [value, setValue] = useState<any>(DEFAULT_MEDIA_EDIT_PLAN);

  useEffect(() => {
    const raw = String(params.editPlan ?? "");
    if (raw) { try { setValue(JSON.parse(raw)); } catch {} }
  }, [params.editPlan]);

  const close = () => {
    void SecureStore.setItemAsync("twitok_media_edit_plan", JSON.stringify(value)).finally(() => router.back());
  };

  return <FreeMediaEditor visible mode={mode} value={value} onChange={setValue} onClose={close} />;
}
