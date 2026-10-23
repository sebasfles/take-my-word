import { z } from "zod";
import { ProviderError } from "../ports/provider-error.ts";
import type { TranscribeInput, Transcriber } from "../ports/transcriber.ts";
import { postForJson, type HttpOptions } from "./http.ts";
import { appendAudio, detectedLanguage } from "./transcription-form.ts";

export const openaiTranscribeId = "openai-transcribe";
const defaultTimeoutMs = 15_000;

const endpoint = "https://api.openai.com/v1/audio/transcriptions";
const responseSchema = z.object({
  text: z.string(),
  languages: z.array(z.object({ code: z.string() })).optional(),
});

export type LanguageField = "language" | "languages[]";

export interface OpenaiTranscribeOptions extends HttpOptions {
  apiKey: () => Promise<string>;
  model: string;
  languageField?: LanguageField;
}

export function openaiTranscriber({
  apiKey,
  model,
  languageField = "language",
  ...http
}: OpenaiTranscribeOptions): Transcriber {
  const label = `${openaiTranscribeId}:${model}`;
  return {
    label,
    async transcribe({ audio, container, language, prompt }: TranscribeInput) {
      const form = new FormData();
      appendAudio(form, audio, container);
      form.append("model", model);
      form.append("response_format", "json");
      form.append("temperature", "0");
      if (language !== undefined) form.append(languageField, language);
      if (prompt) form.append("prompt", prompt);
      const body = await postForJson(
        label,
        endpoint,
        { headers: { authorization: `Bearer ${await apiKey()}` }, body: form },
        { timeoutMs: defaultTimeoutMs, ...http },
      );
      const parsed = responseSchema.safeParse(body);
      if (!parsed.success) throw new ProviderError(label, `${label} answered an unexpected shape`);
      const detected =
        language === undefined ? detectedLanguage(parsed.data.languages?.[0]?.code) : undefined;
      return { text: parsed.data.text.trim(), ...(detected && { language: detected }) };
    },
  };
}
