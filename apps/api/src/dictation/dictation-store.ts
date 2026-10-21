import type { TokenUsage } from "./ports/refiner.ts";

export interface DictationRecord {
  userId: string;
  requestId: string;
  createdAt: Date;
  locale: string;
  audioSeconds: number;
  raw: string;
  text: string;
  styleId: string;
  providers: { transcriber: string; refiner: string };
  latencyMs: { quota: number; profile: number; transcribe: number; refine: number };
  tokens: TokenUsage;
}

export interface DictationStore {
  save(record: DictationRecord): Promise<void>;
}
