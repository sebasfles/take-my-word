import type { Refiner } from "../dictation/ports/refiner.ts";
import type { Transcriber } from "../dictation/ports/transcriber.ts";
import { groqChatRefiner } from "../dictation/providers/groq-chat.ts";
import { groqWhisper } from "../dictation/providers/groq-whisper.ts";
import type { Fetch } from "../dictation/providers/http.ts";
import { openaiTranscriber } from "../dictation/providers/openai-transcribe.ts";
import { openaiRefiner } from "../dictation/providers/openai.ts";
import type { ProviderKeys } from "../lib/secrets.ts";
import type { RefinerSpec, TranscriberSpec } from "./contract.ts";

type Keys = () => Promise<ProviderKeys>;

export function buildTranscriber(spec: TranscriberSpec, keys: Keys, fetch: Fetch): Transcriber {
  if (spec.provider === "groq-whisper") {
    return groqWhisper({
      apiKey: async () => (await keys()).GROQ_API_KEY,
      model: spec.model,
      fetch,
    });
  }
  return openaiTranscriber({
    apiKey: async () => (await keys()).OPENAI_API_KEY,
    model: spec.model,
    ...(spec.languageField && { languageField: spec.languageField }),
    fetch,
  });
}

export function buildRefiner(spec: RefinerSpec, keys: Keys, fetch: Fetch): Refiner {
  const tuning = {
    ...(spec.reasoningEffort !== undefined && { reasoningEffort: spec.reasoningEffort }),
    ...(spec.temperature !== undefined && { temperature: spec.temperature }),
  };
  if (spec.provider === "openai") {
    return openaiRefiner({
      apiKey: async () => (await keys()).OPENAI_API_KEY,
      model: spec.model,
      ...tuning,
      fetch,
    });
  }
  return groqChatRefiner({
    apiKey: async () => (await keys()).GROQ_API_KEY,
    model: spec.model,
    ...tuning,
    fetch,
  });
}
