export interface TermRecord {
  key: string;
  term: string;
  aliases: string[];
  useCount: number;
  lastUsedAt: string;
  createdAt: string;
}

export interface DictionaryStore {
  list(userId: string): Promise<TermRecord[]>;
  count(userId: string): Promise<number>;
  add(userId: string, record: TermRecord): Promise<boolean>;
  updateAliases(userId: string, key: string, aliases: string[]): Promise<TermRecord | undefined>;
  remove(userId: string, key: string): Promise<boolean>;
}
