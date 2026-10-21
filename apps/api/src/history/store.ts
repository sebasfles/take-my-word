export interface DictationEntry {
  sk: string;
  createdAt: string;
  locale: string;
  text: string;
  raw: string;
  styleId?: string;
  audioSeconds: number;
}

export interface HistoryStore {
  page(
    userId: string,
    options: { limit: number; after?: string; now: Date },
  ): Promise<{ entries: DictationEntry[]; last?: string }>;
  remove(userId: string, sk: string): Promise<boolean>;
}
