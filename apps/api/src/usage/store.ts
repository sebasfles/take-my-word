export interface UsageStore {
  usedSeconds(userId: string, day: string): Promise<number>;
}
