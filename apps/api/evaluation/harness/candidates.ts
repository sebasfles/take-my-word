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
  {
    id: "gpt-transcribe",
    spec: { provider: "openai-transcribe", model: "gpt-transcribe", languageField: "languages[]" },
  },
  {
    id: "together-parakeet",
    spec: {
      provider: "together-transcribe",
      model: "nvidia/parakeet-tdt-0.6b-v3",
      prompted: false,
    },
  },
  {
    id: "together-whisper-large-v3",
    spec: { provider: "together-transcribe", model: "openai/whisper-large-v3", prompted: true },
  },
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
    id: "gpt-5.6-luna@none",
    spec: { provider: "openai", model: "gpt-5.6-luna", reasoningEffort: "none", temperature: 0 },
    setting: "lowest effort",
  },
  {
    id: "cerebras-qwen-3.8-27b@none",
    spec: {
      provider: "cerebras-chat",
      model: "qwen-3.8-27b",
      reasoningEffort: "none",
      temperature: 0,
    },
    setting: "lowest effort",
  },
  {
    id: "cerebras-gpt-oss-120b@low",
    spec: {
      provider: "cerebras-chat",
      model: "gpt-oss-120b",
      reasoningEffort: "low",
      temperature: 0,
    },
    setting: "lowest effort",
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

const round1 = "docs/tasks/0017_eval_harness/report.md";

export const notRerun: readonly { id: string; reason: string }[] = [
  {
    id: "whisper-large-v3 (Groq)",
    reason: `not re-run; it failed round 1's hard gate on noise (${round1})`,
  },
  {
    id: "gpt-4o-mini-transcribe",
    reason: `not re-run; it failed round 1's hard gate on noise and retires on 2027-02-26 (${round1})`,
  },
  {
    id: "gpt-4o-transcribe",
    reason: `not re-run; it failed round 1's hard gate on noise and language and retires on 2027-02-26 (${round1})`,
  },
];

export const chainedTranscribers: readonly string[] = [
  "whisper-large-v3-turbo",
  "gpt-transcribe",
  "together-parakeet",
];
