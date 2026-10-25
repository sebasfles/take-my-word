import type { RefinerId, TranscriberId } from "@take-my-word/shared";
import {
  refiners,
  transcribers,
  type RefinerEntry,
  type TranscriberEntry,
} from "../../src/dictation/providers/registry.ts";

export interface TranscriberCandidate {
  id: TranscriberId;
  spec: TranscriberEntry;
  baseline?: true;
}

export interface RefinerCandidate {
  id: RefinerId;
  spec: RefinerEntry;
  setting: "production call" | "lowest effort";
  baseline?: true;
}

const transcriber = (id: TranscriberId, baseline?: true): TranscriberCandidate => ({
  id,
  spec: transcribers[id],
  ...(baseline && { baseline }),
});

const refiner = (id: RefinerId, baseline?: true): RefinerCandidate => ({
  id,
  spec: refiners[id],
  setting: refiners[id].reasoningEffort === undefined ? "production call" : "lowest effort",
  ...(baseline && { baseline }),
});

export const transcriberCandidates: readonly TranscriberCandidate[] = [
  transcriber("whisper-large-v3-turbo", true),
  transcriber("gpt-transcribe"),
  transcriber("together-parakeet"),
];

export const refinerCandidates: readonly RefinerCandidate[] = [
  refiner("gpt-5.4-nano", true),
  refiner("gpt-5.4-nano@none"),
  refiner("gpt-5.6-luna@none"),
  refiner("cerebras-qwen-3.8-27b@none"),
  refiner("cerebras-gpt-oss-120b@low"),
  refiner("gpt-oss-20b@low"),
];

const round1 = "docs/tasks/0017_eval_harness/report.md";
const round2 = "docs/tasks/0018_fast_providers_eval/report.md";

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
  {
    id: "together-whisper-large-v3",
    reason: `not re-run; it translated Spanish dictations into English in round 2 (${round2})`,
  },
];

export const chainedTranscribers: readonly TranscriberId[] = [
  "whisper-large-v3-turbo",
  "gpt-transcribe",
  "together-parakeet",
];
