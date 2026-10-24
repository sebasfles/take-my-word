import { z } from "zod";

export const providerKeyNames = [
  "GROQ_API_KEY",
  "OPENAI_API_KEY",
  "TOGETHER_API_KEY",
  "CEREBRAS_API_KEY",
] as const;
export type ProviderKeyName = (typeof providerKeyNames)[number];

export const transcriberIds = [
  "whisper-large-v3-turbo",
  "gpt-transcribe",
  "together-parakeet",
] as const;
export type TranscriberId = (typeof transcriberIds)[number];

export const refinerIds = [
  "gpt-5.4-nano",
  "gpt-5.4-nano@none",
  "gpt-5.6-luna@none",
  "cerebras-qwen-3.8-27b@none",
  "cerebras-gpt-oss-120b@low",
  "gpt-oss-20b@low",
] as const;
export type RefinerId = (typeof refinerIds)[number];

export const defaultTranscriber: TranscriberId = "whisper-large-v3-turbo";
export const defaultRefiner: RefinerId = "gpt-5.4-nano";

export const transcriberKeys: Readonly<Record<TranscriberId, ProviderKeyName>> = {
  "whisper-large-v3-turbo": "GROQ_API_KEY",
  "gpt-transcribe": "OPENAI_API_KEY",
  "together-parakeet": "TOGETHER_API_KEY",
};

export const refinerKeys: Readonly<Record<RefinerId, ProviderKeyName>> = {
  "gpt-5.4-nano": "OPENAI_API_KEY",
  "gpt-5.4-nano@none": "OPENAI_API_KEY",
  "gpt-5.6-luna@none": "OPENAI_API_KEY",
  "cerebras-qwen-3.8-27b@none": "CEREBRAS_API_KEY",
  "cerebras-gpt-oss-120b@low": "CEREBRAS_API_KEY",
  "gpt-oss-20b@low": "GROQ_API_KEY",
};

export const providerPairSchema = z
  .object({
    transcriber: z.enum(transcriberIds).default(defaultTranscriber),
    refiner: z.enum(refinerIds).default(defaultRefiner),
  })
  .strict();
export type ProviderPair = z.infer<typeof providerPairSchema>;

export function keysOfPair(pair: ProviderPair): ProviderKeyName[] {
  return [...new Set([transcriberKeys[pair.transcriber], refinerKeys[pair.refiner]])];
}
