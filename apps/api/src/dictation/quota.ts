const secondsPerDay = 86_400;

export interface QuotaCharge {
  userId: string;
  day: string;
  seconds: number;
  capSeconds: number | undefined;
  expiresAt: number;
}

export interface QuotaStore {
  charge(charge: QuotaCharge): Promise<boolean>;
}

export interface QuotaWindow {
  day: string;
  resetsAt: string;
  expiresAt: number;
}

export function quotaWindow(now: Date): QuotaWindow {
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;
  return {
    day: now.toISOString().slice(0, 10),
    resetsAt: new Date((dayStart + secondsPerDay) * 1000).toISOString(),
    expiresAt: dayStart + 2 * secondsPerDay,
  };
}

export function quotaExceededMessage(dailyMinutes: number): string {
  return `Daily limit of ${dailyMinutes} minutes of audio reached; it resets at 00:00 UTC.`;
}
