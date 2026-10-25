import {
  refinerKeys,
  transcriberKeys,
  type ProviderKeyName,
  type RefinerId,
  type TranscriberId,
} from "@take-my-word/shared";
import { requiredKeys, type ProviderKeys } from "../../lib/secrets.ts";
import type { Refiner } from "../ports/refiner.ts";
import type { Transcriber } from "../ports/transcriber.ts";
import { cerebrasChatRefiner } from "./cerebras-chat.ts";
import { groqChatRefiner } from "./groq-chat.ts";
import { groqWhisper } from "./groq-whisper.ts";
import type { HttpOptions } from "./http.ts";
import { openaiTranscriber, type LanguageField } from "./openai-transcribe.ts";
import { openaiRefiner } from "./openai.ts";
import { togetherTranscriber } from "./together-transcribe.ts";

export type TranscriberEntry = { model: string; prompted: boolean } & (
  | { adapter: "groq-whisper" }
  | { adapter: "openai-transcribe"; languageField: LanguageField }
  | { adapter: "together-transcribe" }
);

export interface RefinerEntry {
  adapter: "openai" | "groq-chat" | "cerebras-chat";
  model: string;
  reasoningEffort?: string;
  temperature?: number;
}

export const transcribers: Readonly<Record<TranscriberId, TranscriberEntry>> = {
  "whisper-large-v3-turbo": {
    adapter: "groq-whisper",
    model: "whisper-large-v3-turbo",
    prompted: true,
  },
  "gpt-transcribe": {
    adapter: "openai-transcribe",
    model: "gpt-transcribe",
    languageField: "languages[]",
    prompted: true,
  },
  "together-parakeet": {
    adapter: "together-transcribe",
    model: "nvidia/parakeet-tdt-0.6b-v3",
    prompted: false,
  },
};

export const refiners: Readonly<Record<RefinerId, RefinerEntry>> = {
  "gpt-5.4-nano": { adapter: "openai", model: "gpt-5.4-nano" },
  "gpt-5.4-nano@none": {
    adapter: "openai",
    model: "gpt-5.4-nano",
    reasoningEffort: "none",
    temperature: 0,
  },
  "gpt-5.6-luna@none": {
    adapter: "openai",
    model: "gpt-5.6-luna",
    reasoningEffort: "none",
    temperature: 0,
  },
  "cerebras-qwen-3.8-27b@none": {
    adapter: "cerebras-chat",
    model: "qwen-3.8-27b",
    reasoningEffort: "none",
    temperature: 0,
  },
  "cerebras-gpt-oss-120b@low": {
    adapter: "cerebras-chat",
    model: "gpt-oss-120b",
    reasoningEffort: "low",
    temperature: 0,
  },
  "gpt-oss-20b@low": {
    adapter: "groq-chat",
    model: "openai/gpt-oss-20b",
    reasoningEffort: "low",
    temperature: 0,
  },
};

export function providerKey(
  keys: () => Promise<ProviderKeys>,
  name: ProviderKeyName,
): () => Promise<string> {
  return async () => requiredKeys(await keys(), [name])[name];
}

export function transcriberOf(
  id: TranscriberId,
  keys: () => Promise<ProviderKeys>,
  http: HttpOptions = {},
): Transcriber {
  const entry = transcribers[id];
  const apiKey = providerKey(keys, transcriberKeys[id]);
  switch (entry.adapter) {
    case "groq-whisper":
      return groqWhisper({ apiKey, model: entry.model, ...http });
    case "openai-transcribe":
      return openaiTranscriber({
        apiKey,
        model: entry.model,
        languageField: entry.languageField,
        ...http,
      });
    case "together-transcribe":
      return togetherTranscriber({ apiKey, model: entry.model, prompted: entry.prompted, ...http });
  }
}

export function refinerOf(
  id: RefinerId,
  keys: () => Promise<ProviderKeys>,
  http: HttpOptions = {},
): Refiner {
  const { adapter, ...tuning } = refiners[id];
  const options = { apiKey: providerKey(keys, refinerKeys[id]), ...tuning, ...http };
  switch (adapter) {
    case "openai":
      return openaiRefiner(options);
    case "groq-chat":
      return groqChatRefiner(options);
    case "cerebras-chat":
      return cerebrasChatRefiner(options);
  }
}
