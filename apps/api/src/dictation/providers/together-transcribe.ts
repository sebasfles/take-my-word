import { z } from "zod";
import { ProviderError } from "../ports/provider-error.ts";
import type { TranscribeInput, Transcriber } from "../ports/transcriber.ts";
import { postForJson, type HttpOptions } from "./http.ts";
import { appendAudio, detectedLanguage } from "./transcription-form.ts";

export const togetherTranscribeId = "together-transcribe";
const defaultTimeoutMs = 15_000;

const endpoint = "https://api.together.ai/v1/audio/transcriptions";
const responseSchema = z.object({
  text: z.string(),
  language: z.string().optional(),
  duration: z.number().optional(),
});

export interface TogetherTranscribeOptions extends HttpOptions {
  apiKey: () => Promise<string>;
  model: string;
  prompted: boolean;
}

export function togetherTranscriber({
  apiKey,
  model,
  prompted,
  ...http
}: TogetherTranscribeOptions): Transcriber {
  const label = `${togetherTranscribeId}:${model}`;
  return {
    label,
    async transcribe({ audio, container, language, prompt }: TranscribeInput) {
      const form = new FormData();
      appendAudio(form, audio, container);
      form.append("model", model);
      form.append("language", language ?? "auto");
      form.append("response_format", language === undefined ? "verbose_json" : "json");
      form.append("temperature", "0");
      if (prompted && prompt) form.append("prompt", prompt);
      const body = await postForJson(
        label,
        endpoint,
        { headers: { authorization: `Bearer ${await apiKey()}` }, body: form },
        { timeoutMs: defaultTimeoutMs, ...http },
      );
      const parsed = responseSchema.safeParse(body);
      if (!parsed.success) throw new ProviderError(label, `${label} answered an unexpected shape`);
      const detected = language === undefined ? detectedLanguage(parsed.data.language) : undefined;
      const seconds = parsed.data.duration;
      return {
        text: parsed.data.text.trim(),
        ...(detected && { language: detected }),
        ...(seconds !== undefined && { usage: { seconds } }),
      };
    },
  };
}
