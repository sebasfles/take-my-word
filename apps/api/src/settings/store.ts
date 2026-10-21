import type { Settings } from "@take-my-word/shared";

export interface SettingsStore {
  get(userId: string): Promise<Settings | undefined>;
  create(userId: string, settings: Settings): Promise<Settings>;
  put(userId: string, settings: Settings): Promise<void>;
  resetDefaultStyle(userId: string, styleId: string, to: string): Promise<void>;
}
