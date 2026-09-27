import { LANGUAGE_NAMES } from "../video/translation.js";

export interface CaptionTranslationProvider {
  translate(segments: Array<{ text: string; startMs: number; endMs: number }>, sourceLanguage: string, targetLanguage: string): Promise<string[]>;
}

class OpenAITranslationProvider implements CaptionTranslationProvider {
  async translate(segments: Array<{ text: string; startMs: number; endMs: number }>, sourceLanguage: string, targetLanguage: string) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
    const source = LANGUAGE_NAMES[sourceLanguage] ?? sourceLanguage;
    const target = LANGUAGE_NAMES[targetLanguage] ?? targetLanguage;
    const payload = {
      model: process.env.TWITOK_TRANSLATION_MODEL ?? "gpt-5.6-luna",
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: `Translate caption segments from ${source} to ${target}. Preserve meaning, names, slang, cultural references, emojis, and tone. Return ONLY a JSON array of strings in exactly the same order as the input. Do not add explanations. If a word is a proper name or cannot be translated reliably, preserve it.` }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: JSON.stringify(segments.map(x => x.text)) }]
        }
      ]
    };
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`Caption translation failed: ${response.status} ${await response.text()}`);
    const result: any = await response.json();
    const text = typeof result.output_text === "string"
      ? result.output_text
      : (result.output ?? []).flatMap((x: any) => x.content ?? []).map((x: any) => x.text ?? "").join("");
    const cleaned = String(text).trim().replace(/^\`\`\`json\s*/i, "").replace(/\s*\`\`\`$/, "");
    const translated = JSON.parse(cleaned);
    if (!Array.isArray(translated) || translated.length !== segments.length) throw new Error("Translation provider returned an invalid segment count");
    return translated.map(x => String(x ?? "").trim());
  }
}

export function getCaptionTranslationProvider(): CaptionTranslationProvider {
  const provider = process.env.TWITOK_TRANSLATION_PROVIDER ?? "openai";
  if (provider === "openai") return new OpenAITranslationProvider();
  throw new Error(`Unsupported TWITOK_TRANSLATION_PROVIDER: ${provider}`);
}
