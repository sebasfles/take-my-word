import type { FreePlanLimits, HeaderFloors, PrepaidBalance, Provider } from "./prices.ts";

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
  usd?: number;
}

export interface PacingKey {
  provider: Provider;
  plan?: FreePlanLimits;
  complimentary?: { group: string; tokensPerDay: number };
  prepaid?: PrepaidBalance;
  paidFloors?: HeaderFloors;
}

interface Window {
  name: string;
  ms: number;
  field: keyof Usage;
  cap: { limit: number; allowed: number } | undefined;
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

export interface PacingOverrides {
  whisperDailyKept?: number;
}

export const minimumWhisperDailyKept = 0.1;

export class Pacer {
  private readonly blockedUntil = new Map<string, number>();
  private readonly keys: ReadonlyMap<string, PacingKey>;
  private readonly ledger: LedgerEntry[];
  private readonly share: number;
  private readonly overrides: PacingOverrides;

  constructor(
    keys: ReadonlyMap<string, PacingKey>,
    ledger: LedgerEntry[],
    share = productionShare,
    overrides: PacingOverrides = {},
  ) {
    const kept = overrides.whisperDailyKept;
    if (kept !== undefined && (kept < minimumWhisperDailyKept || kept > 1 - share)) {
      throw new Error(
        `whisperDailyKept must keep between ${String(minimumWhisperDailyKept)} and ${String(1 - share)} of a daily limit`,
      );
    }
    this.keys = keys;
    this.ledger = ledger;
    this.share = share;
    this.overrides = overrides;
  }

  private config(key: string): PacingKey {
    const config = this.keys.get(key);
    if (config === undefined) throw new Error(`no pacing for ${key}`);
    return config;
  }

  private windows(plan: FreePlanLimits): Window[] {
    const half = (limit: number | undefined) =>
      limit === undefined ? undefined : { limit, allowed: limit * this.share };
    const whisperKept =
      plan.audioSecondsPerDay !== undefined ? this.overrides.whisperDailyKept : undefined;
    const daily = (limit: number | undefined) =>
      limit === undefined || whisperKept === undefined
        ? half(limit)
        : { limit, allowed: limit * (1 - whisperKept) };
    const tokensPerDay =
      plan.tokensPerDay !== undefined && plan.tokensPerDayKept !== undefined
        ? { limit: plan.tokensPerDay, allowed: plan.tokensPerDay - plan.tokensPerDayKept }
        : half(plan.tokensPerDay);
    return [
      { name: "requests per day", ms: dayMs, field: "requests", cap: daily(plan.requestsPerDay) },
      {
        name: "audio seconds per day",
        ms: dayMs,
        field: "audioSeconds",
        cap: daily(plan.audioSecondsPerDay),
      },
      { name: "tokens per day", ms: dayMs, field: "tokens", cap: tokensPerDay },
      {
        name: "requests per minute",
        ms: minuteMs,
        field: "requests",
        cap:
          plan.minuteShare === undefined
            ? half(plan.requestsPerMinute)
            : {
                limit: plan.requestsPerMinute,
                allowed: plan.requestsPerMinute * plan.minuteShare,
              },
      },
      {
        name: "audio seconds per hour",
        ms: hourMs,
        field: "audioSeconds",
        cap: half(plan.audioSecondsPerHour),
      },
      {
        name: "tokens per minute",
        ms: minuteMs,
        field: "tokens",
        cap: half(plan.tokensPerMinute),
      },
    ];
  }

  prepaidSpentUsd(provider: Provider, since: string): number {
    const start = Date.parse(since);
    return this.ledger
      .filter((entry) => entry.key.startsWith(`${provider}:`) && entry.at >= start)
      .reduce((total, entry) => total + (entry.usd ?? 0), 0);
  }

  readiness(key: string, need: Usage & { costUsd?: number }, now: number): Readiness {
    const config = this.config(key);
    if (config.prepaid) {
      const { startUsd, since, floorUsd } = config.prepaid;
      const left = startUsd - this.prepaidSpentUsd(config.provider, since);
      if (left - (need.costUsd ?? 0) < floorUsd) {
        return {
          kind: "tomorrow",
          reason: `${config.provider} balance: ${left.toFixed(4)} of ${startUsd.toFixed(2)} USD left after the ledger's spend since ${since}; a call of ${(need.costUsd ?? 0).toFixed(4)} USD would go under the ${floorUsd.toFixed(2)} USD floor`,
        };
      }
    }
    const own = this.ledger.filter((entry) => entry.key === key);
    const waits = [this.blockedUntil.get(key) ?? now];
    for (const window of config.plan ? this.windows(config.plan) : []) {
      if (window.cap === undefined || need[window.field] === 0) continue;
      const at = earliestWithin(
        own,
        window.ms,
        now,
        (entry) => entry[window.field],
        need[window.field],
        window.cap.allowed,
      );
      if (at === Infinity) {
        return {
          kind: "tomorrow",
          reason: `${window.name}: one call needs more than the runner may use`,
        };
      }
      if (window.ms === dayMs && at - now > hourMs) {
        return {
          kind: "tomorrow",
          reason: `${window.name}: the runner keeps ${String(window.cap.limit - window.cap.allowed)} of ${String(window.cap.limit)} free over any 24 hours; resume after ${new Date(at).toISOString()}`,
        };
      }
      waits.push(at);
    }
    if (config.complimentary) {
      const group = config.complimentary.group;
      const today = utcDay(now);
      const used = this.ledger
        .filter((entry) => entry.group === group && utcDay(entry.at) === today)
        .reduce((total, entry) => total + entry.tokens, 0);
      if (used + need.tokens > config.complimentary.tokensPerDay * this.share) {
        return {
          kind: "tomorrow",
          reason: `complimentary tokens of ${group}: the runner keeps half of ${String(config.complimentary.tokensPerDay)} free`,
        };
      }
    }
    const at = Math.max(...waits);
    return at <= now ? { kind: "now" } : { kind: "at", at };
  }

  record(key: string, usage: Usage, at: number, usd?: number): LedgerEntry {
    const group = this.config(key).complimentary?.group;
    const entry: LedgerEntry = {
      key,
      at,
      ...usage,
      ...(group !== undefined && { group }),
      ...(usd !== undefined && { usd }),
    };
    this.ledger.push(entry);
    return entry;
  }

  observe(key: string, headers: Readonly<Record<string, string>>, now: number): void {
    const { provider, plan, paidFloors } = this.config(key);
    const dailyRequestsKept =
      plan?.audioSecondsPerDay !== undefined && this.overrides.whisperDailyKept !== undefined
        ? this.overrides.whisperDailyKept
        : 1 - this.share;
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
      if (limit === undefined || remaining === undefined) continue;
      if (provider === "groq" && plan !== undefined && budget === "requests") {
        if (remaining < limit * dailyRequestsKept) {
          block(now + (parseResetMs(headers["x-ratelimit-reset-requests"]) ?? hourMs));
        }
        continue;
      }
      if (paidFloors ? remaining >= paidFloors[budget] : remaining >= limit * this.share) continue;
      block(now + (parseResetMs(headers[`x-ratelimit-reset-${budget}`]) ?? minuteMs));
    }
  }
}

export class BalanceFloorError extends Error {
  constructor(provider: Provider, leftUsd: number, estimateUsd: number, floorUsd: number) {
    super(
      `${provider}: the run's estimated ${estimateUsd.toFixed(4)} USD would leave ${(leftUsd - estimateUsd).toFixed(4)} of the ${leftUsd.toFixed(4)} USD left, under the ${floorUsd.toFixed(2)} USD floor`,
    );
    this.name = "BalanceFloorError";
  }
}

export interface PrepaidOutlook {
  provider: Provider;
  leftUsd: number;
  estimateUsd: number;
  floorUsd: number;
}

export function prepaidOutlook(
  keys: ReadonlyMap<string, PacingKey>,
  pacer: Pacer,
  planned: readonly { pacingKey: string; estimate: { costUsd: number } }[],
): PrepaidOutlook[] {
  const outlooks = new Map<Provider, PrepaidOutlook>();
  for (const item of planned) {
    const config = keys.get(item.pacingKey);
    if (config?.prepaid === undefined) continue;
    const outlook = outlooks.get(config.provider) ?? {
      provider: config.provider,
      leftUsd:
        config.prepaid.startUsd - pacer.prepaidSpentUsd(config.provider, config.prepaid.since),
      estimateUsd: 0,
      floorUsd: config.prepaid.floorUsd,
    };
    outlook.estimateUsd += item.estimate.costUsd;
    outlooks.set(config.provider, outlook);
  }
  return [...outlooks.values()];
}

export function requireAboveFloor(outlooks: readonly PrepaidOutlook[]): void {
  for (const { provider, leftUsd, estimateUsd, floorUsd } of outlooks) {
    if (leftUsd - estimateUsd < floorUsd) {
      throw new BalanceFloorError(provider, leftUsd, estimateUsd, floorUsd);
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
