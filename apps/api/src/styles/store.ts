export interface StyleRecord {
  id: string;
  name: string;
  prompt: string;
  createdAt: string;
}

export interface StyleStore {
  list(userId: string): Promise<StyleRecord[]>;
  get(userId: string, id: string): Promise<StyleRecord | undefined>;
  count(userId: string): Promise<number>;
  create(userId: string, record: StyleRecord): Promise<void>;
  update(
    userId: string,
    id: string,
    input: { name: string; prompt: string },
  ): Promise<StyleRecord | undefined>;
  remove(userId: string, id: string): Promise<boolean>;
}
