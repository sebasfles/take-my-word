import type { Settings } from "@take-my-word/shared";
import type { AppRuleRecord } from "../app-rules/store.ts";
import type { TermRecord } from "../dictionary/store.ts";

export interface DictationProfile {
  settings?: Settings;
  rule?: AppRuleRecord;
  styles: { id: string; prompt: string }[];
  terms: TermRecord[];
}

export interface ProfileStore {
  load(userId: string, appId: string | undefined): Promise<DictationProfile>;
}
