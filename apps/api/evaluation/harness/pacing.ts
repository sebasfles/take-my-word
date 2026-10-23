import type { FreePlanLimits, Provider } from "./prices.ts";

export const productionShare = 0.5;

export interface Usage {
  requests: number;
  audioSeconds: number;
  tokens: number;
}

export interface LedgerEntry extends Usage {
  key: string;
  at: number;
  group?: string;
}

export interface PacingKey {
  provider: Provider;
  plan?: FreePlanLimits;
  complimentary?: { group: string; tokensPerDay: number };
}

export type Readiness =
  { kind: "now" } | { kind: "at"; at: number } | { kind: "tomorrow"; reason: string };

const minuteMs = 60_000;
const hourMs = 3_600_000;
const dayMs = 86_400_000;

export const utcDay = (at: number): string => new Date(at).toISOString().slice(0, 10);

export function parseResetMs(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parts = [...value.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)];
  if (parts.length === 0) {
    const seconds = Number(value);
    return Number.isFinite(seconds) ? seconds * 1000 : undefined;
  }
  const unit = { ms: 1, s: 1000, m: minuteMs, h: hourMs } as const;
  return parts.reduce(
    (total, [, amount, name]) => total + Number(amount) * unit[name as keyof typeof unit],
    0,
  );
}

function earliestWithin(
  entries: readonly LedgerEntry[],
  windowMs: number,
  now: number,
  measure: (entry: LedgerEntry) => number,
  needed: number,
  cap: number,
): number {
  if (needed > cap) return Infinity;
  const recent = entries.filter((entry) => entry.at > now - windowMs).sort((a, b) => a.at - b.at);
  let used = recent.reduce((sum, entry) => sum + measure(entry), 0);
  if (used + needed <= cap) return now;
  for (const entry of recent) {
    used -= measure(entry);
    if (used + needed <= cap) return entry.at + windowMs;
  }
  return now + windowMs;
}

export class Pacer {
  private readonly blockedUntil = new Map<string, number>();
  private readonly keys: ReadonlyMap<string, PacingKey>;
  private readonly ledger: LedgerEntry[];
  private readonly share: number;

  constructor(
    keys: ReadonlyMap<string, PacingKey>,
    ledger: LedgerEntry[],
    share = productionShare,
  ) {
    this.keys = keys;
    this.ledger = ledger;
    this.share = share;
  }

  private config(key: string): PacingKey {
    const config = this.keys.get(key);
    if (config === undefined) throw new Error(`no pacing for ${key}`);
    return config;
  }

  readiness(key: string, need: Usage, now: number): Readiness {
    const config = this.config(key);
    const own = this.ledger.filter((entry) => entry.key === key);
    const sum = (entries: readonly LedgerEntry[], field: keyof Usage) =>
      entries.reduce((total, entry) => total + entry[field], 0);
    const plan = config.plan;
    const daily: [string, keyof Usage, number | undefined][] = [
      ["requests per day", "requests", plan?.requestsPerDay],
      ["audio seconds per day", "audioSeconds", plan?.audioSecondsPerDay],
      ["tokens per day", "tokens", plan?.tokensPerDay],
    ];
    for (const [name, field, limit] of daily) {
      if (limit === undefined || need[field] === 0) continue;
      const at = earliestWithin(
        own,
        dayMs,
        now,
        (entry) => entry[field],
        need[field],
        limit * this.share,
      );
      if (at - now > hourMs) {
        return {
          kind: "tomorrow",
          reason: `${name}: the runner keeps half of ${String(limit)} free over any 24 hours; resume after ${new Date(at).toISOString()}`,
        };
      }
    }
    const today = utcDay(now);
    if (config.complimentary) {
      const group = config.complimentary.group;
      const groupToday = this.ledger.filter(
        (entry) => entry.group === group && utcDay(entry.at) === today,
      );
      if (
        sum(groupToday, "tokens") + need.tokens >
        config.complimentary.tokensPerDay * this.share
      ) {
        return {
          kind: "tomorrow",
          reason: `complimentary tokens of ${group}: the runner keeps half of ${String(config.complimentary.tokensPerDay)} free`,
        };
      }
    }

    const waits = [this.blockedUntil.get(key) ?? now];
    if (plan) {
      const windows: [number, (entry: LedgerEntry) => number, number, number | undefined][] = [
        [dayMs, (entry) => entry.requests, need.requests, plan.requestsPerDay],
        [dayMs, (entry) => entry.audioSeconds, need.audioSeconds, plan.audioSecondsPerDay],
        [dayMs, (entry) => entry.tokens, need.tokens, plan.tokensPerDay],
        [minuteMs, (entry) => entry.requests, need.requests, plan.requestsPerMinute],
        [hourMs, (entry) => entry.audioSeconds, need.audioSeconds, plan.audioSecondsPerHour],
        [minuteMs, (entry) => entry.tokens, need.tokens, plan.tokensPerMinute],
      ];
      for (const [windowMs, measure, needed, limit] of windows) {
        if (limit === undefined || needed === 0) continue;
        waits.push(earliestWithin(own, windowMs, now, measure, needed, limit * this.share));
      }
    }
    const at = Math.max(...waits);
    if (at === Infinity)
      return { kind: "tomorrow", reason: "one call needs more than half a limit" };
    return at <= now ? { kind: "now" } : { kind: "at", at };
  }

  record(key: string, usage: Usage, at: number): LedgerEntry {
    const group = this.config(key).complimentary?.group;
    const entry: LedgerEntry = { key, at, ...usage, ...(group !== undefined && { group }) };
    this.ledger.push(entry);
    return entry;
  }

  observe(key: string, headers: Readonly<Record<string, string>>, now: number): void {
    const { provider } = this.config(key);
    const number = (name: string) => {
      const value = headers[name];
      return value === undefined ? undefined : Number(value);
    };
    const block = (until: number) => {
      this.blockedUntil.set(key, Math.max(this.blockedUntil.get(key) ?? 0, until));
    };
    const retryAfter = parseResetMs(headers["retry-after"]);
    if (retryAfter !== undefined) block(now + retryAfter);

    const budgets = ["requests", "tokens", "audio-seconds"] as const;
    for (const budget of budgets) {
      const limit = number(`x-ratelimit-limit-${budget}`);
      const remaining = number(`x-ratelimit-remaining-${budget}`);
      if (limit === undefined || remaining === undefined || remaining >= limit * this.share)
        continue;
      if (provider === "groq" && budget === "requests") {
        block(now + (parseResetMs(headers["x-ratelimit-reset-requests"]) ?? hourMs));
        continue;
      }
      block(now + (parseResetMs(headers[`x-ratelimit-reset-${budget}`]) ?? minuteMs));
    }
  }
}

export class BudgetExceededError extends Error {
  constructor(spent: number, next: number, budget: number) {
    super(
      `the run would spend ${next.toFixed(4)} USD after ${spent.toFixed(4)} USD, above its ${budget.toFixed(2)} USD budget`,
    );
    this.name = "BudgetExceededError";
  }
}

export class CostGuard {
  private spent: number;
  private readonly budgetUsd: number;

  constructor(budgetUsd: number, alreadySpentUsd = 0) {
    this.budgetUsd = budgetUsd;
    this.spent = alreadySpentUsd;
  }

  get spentUsd(): number {
    return this.spent;
  }

  check(estimateUsd: number): void {
    if (this.spent + estimateUsd > this.budgetUsd) {
      throw new BudgetExceededError(this.spent, estimateUsd, this.budgetUsd);
    }
  }

  add(costUsd: number): void {
    this.spent += costUsd;
  }
}
