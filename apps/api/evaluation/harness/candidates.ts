import type { RefinerSpec, TranscriberSpec } from "../../src/eval/contract.ts";

export interface TranscriberCandidate {
  id: string;
  spec: TranscriberSpec;
  baseline?: true;
}

export interface RefinerCandidate {
  id: string;
  spec: RefinerSpec;
  setting: "production call" | "lowest effort";
  baseline?: true;
}

export const transcriberCandidates: readonly TranscriberCandidate[] = [
  {
    id: "whisper-large-v3-turbo",
    spec: { provider: "groq-whisper", model: "whisper-large-v3-turbo" },
    baseline: true,
  },
  { id: "whisper-large-v3", spec: { provider: "groq-whisper", model: "whisper-large-v3" } },
  {
    id: "gpt-transcribe",
    spec: { provider: "openai-transcribe", model: "gpt-transcribe", languageField: "languages[]" },
  },
  {
    id: "gpt-4o-mini-transcribe",
    spec: { provider: "openai-transcribe", model: "gpt-4o-mini-transcribe" },
  },
  { id: "gpt-4o-transcribe", spec: { provider: "openai-transcribe", model: "gpt-4o-transcribe" } },
];

export const refinerCandidates: readonly RefinerCandidate[] = [
  {
    id: "gpt-5.4-nano",
    spec: { provider: "openai", model: "gpt-5.4-nano" },
    setting: "production call",
    baseline: true,
  },
  {
    id: "gpt-5.4-nano@none",
    spec: { provider: "openai", model: "gpt-5.4-nano", reasoningEffort: "none", temperature: 0 },
    setting: "lowest effort",
  },
  {
    id: "gpt-5.6-luna",
    spec: { provider: "openai", model: "gpt-5.6-luna" },
    setting: "production call",
  },
  {
    id: "gpt-5.6-luna@none",
    spec: { provider: "openai", model: "gpt-5.6-luna", reasoningEffort: "none", temperature: 0 },
    setting: "lowest effort",
  },
  {
    id: "gpt-6-luna",
    spec: { provider: "openai", model: "gpt-6-luna" },
    setting: "production call",
  },
  {
    id: "gpt-6-luna@none",
    spec: { provider: "openai", model: "gpt-6-luna", reasoningEffort: "none", temperature: 0 },
    setting: "lowest effort",
  },
  {
    id: "gpt-oss-120b",
    spec: { provider: "groq-chat", model: "openai/gpt-oss-120b" },
    setting: "production call",
  },
  {
    id: "gpt-oss-120b@low",
    spec: {
      provider: "groq-chat",
      model: "openai/gpt-oss-120b",
      reasoningEffort: "low",
      temperature: 0,
    },
    setting: "lowest effort",
  },
  {
    id: "gpt-oss-20b",
    spec: { provider: "groq-chat", model: "openai/gpt-oss-20b" },
    setting: "production call",
  },
  {
    id: "gpt-oss-20b@low",
    spec: {
      provider: "groq-chat",
      model: "openai/gpt-oss-20b",
      reasoningEffort: "low",
      temperature: 0,
    },
    setting: "lowest effort",
  },
];
