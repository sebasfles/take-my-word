import type { AppRuleUpdate, PasteKeystroke } from "@take-my-word/shared";

export interface AppRuleRecord {
  appId: string;
  styleId?: string;
  keystroke: PasteKeystroke;
}

export interface AppRuleStore {
  list(userId: string): Promise<AppRuleRecord[]>;
  count(userId: string): Promise<number>;
  create(userId: string, rule: AppRuleRecord): Promise<boolean>;
  update(userId: string, appId: string, update: AppRuleUpdate): Promise<AppRuleRecord | undefined>;
  remove(userId: string, appId: string): Promise<boolean>;
  detachStyle(userId: string, appId: string, styleId: string): Promise<void>;
}
