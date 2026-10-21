import type { MatchableTerm } from "../dictionary/matching.ts";

export interface UsageStore {
  terms(userKey: string): Promise<MatchableTerm[]>;
  recordUse(userKey: string, termKey: string, usedAt: string): Promise<boolean>;
}
