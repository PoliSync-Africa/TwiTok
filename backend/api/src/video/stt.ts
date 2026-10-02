export type TranscriptionSegment = { text: string; startMs: number; endMs: number };

export interface SpeechToTextProvider {
  transcribe(audioPath: string, language?: string): Promise<TranscriptionSegment[]>;
}

class OpenAITranscriptionProvider implements SpeechToTextProvider {
  async transcribe(audioPath: string, language?: string) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

    const audio = new Blob([await (await import("node:fs/promises")).readFile(audioPath)], { type: "audio/mpeg" });
    const form = new FormData();
    form.append("file", audio, "audio.mp3");
    form.append("model", process.env.TWITOK_STT_MODEL ?? "gpt-4o-mini-transcribe");
    form.append("response_format", "verbose_json");
    if (language && language !== "auto") form.append("language", language);

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form
    });
    if (!response.ok) throw new Error(`Speech transcription failed: ${response.status} ${await response.text()}`);
    const result: any = await response.json();
    const segments = Array.isArray(result.segments) ? result.segments : [];
    return segments.map((segment: any) => ({
      text: String(segment.text ?? "").trim(),
      startMs: Math.max(0, Math.round(Number(segment.start ?? 0) * 1000)),
      endMs: Math.max(0, Math.round(Number(segment.end ?? 0) * 1000))
    })).filter((segment: TranscriptionSegment) => segment.text && segment.endMs > segment.startMs);
  }
}

export function getSpeechToTextProvider(): SpeechToTextProvider {
  const provider = process.env.TWITOK_STT_PROVIDER ?? "openai";
  if (provider === "openai") return new OpenAITranscriptionProvider();
  throw new Error(`Unsupported TWITOK_STT_PROVIDER: ${provider}`);
}
