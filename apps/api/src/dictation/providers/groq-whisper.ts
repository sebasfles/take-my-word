import { z } from "zod";
import { ProviderError } from "../ports/provider-error.ts";
import type { TranscribeInput, Transcriber } from "../ports/transcriber.ts";
import { postForJson, type HttpOptions } from "./http.ts";

export const groqWhisperId = "groq-whisper";
export const defaultGroqWhisperModel = "whisper-large-v3-turbo";

const endpoint = "https://api.groq.com/openai/v1/audio/transcriptions";
const responseSchema = z.object({
  text: z.string(),
  segments: z.array(z.object({ no_speech_prob: z.number() })).optional(),
});
const mimeTypes = { wav: "audio/wav", m4a: "audio/mp4" } as const;

export interface GroqWhisperOptions extends HttpOptions {
  apiKey: () => Promise<string>;
  model?: string;
}

export function groqWhisper({
  apiKey,
  model = defaultGroqWhisperModel,
  ...http
}: GroqWhisperOptions): Transcriber {
  const label = `${groqWhisperId}:${model}`;
  return {
    label,
    async transcribe({ audio, container, language }: TranscribeInput) {
      const form = new FormData();
      form.append(
        "file",
        new Blob([new Uint8Array(audio)], { type: mimeTypes[container] }),
        `audio.${container}`,
      );
      form.append("model", model);
      form.append("language", language);
      form.append("response_format", "verbose_json");
      form.append("temperature", "0");
      const body = await postForJson(
        label,
        endpoint,
        { headers: { authorization: `Bearer ${await apiKey()}` }, body: form },
        http,
      );
      const parsed = responseSchema.safeParse(body);
      if (!parsed.success) throw new ProviderError(label, `${label} answered an unexpected shape`);
      const text = parsed.data.text.trim();
      const segments = parsed.data.segments ?? [];
      if (segments.length === 0) return { text };
      return {
        text,
        noSpeechProbability: Math.min(...segments.map((segment) => segment.no_speech_prob)),
      };
    },
  };
}
