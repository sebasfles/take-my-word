import { setTimeout as sleep } from "node:timers/promises";
import { CostGuard, Pacer, type LedgerEntry, type Usage } from "./pacing.ts";

export interface Failure {
  status?: number | undefined;
  message: string;
}

export interface StageUse {
  pacingKey: string;
  usage: Usage;
  costUsd: number;
  headers: Record<string, string>;
}

export interface Attempt<R> {
  result?: R;
  usage: Usage;
  costUsd: number;
  headers: Record<string, string>;
  failure?: Failure;
  alsoUsed?: StageUse[];
}

export interface PlannedItem<R> {
  id: string;
  pacingKey: string;
  estimate: Usage & { costUsd: number };
  alsoPaced?: { pacingKey: string; estimate: Usage & { costUsd: number } }[];
  run: () => Promise<Attempt<R>>;
  exhausted: (failure: Failure) => R;
}

export interface SchedulerHooks<R> {
  done: (id: string, result: R) => void;
  failed: (id: string, failure: Failure, attempt: number, costUsd: number) => void;
  usage: (entry: LedgerEntry) => void;
  progress?: (message: string) => void;
}

export type SchedulerOutcome = { kind: "complete" } | { kind: "paused"; reasons: string[] };

export const maxAttempts = 3;
export const maxRateLimited = 10;

export async function runSchedule<R>(
  items: readonly PlannedItem<R>[],
  pacer: Pacer,
  guard: CostGuard,
  hooks: SchedulerHooks<R>,
  now: () => number = Date.now,
  wait: (ms: number) => Promise<unknown> = sleep,
): Promise<SchedulerOutcome> {
  const pending = [...items];
  const attempts = new Map<string, { failures: number; limited: number }>();
  let completed = 0;
  while (pending.length > 0) {
    const at = now();
    let next: PlannedItem<R> | undefined;
    let earliest = Infinity;
    const reasons = new Set<string>();
    for (const item of pending) {
      const stages = [
        { pacingKey: item.pacingKey, estimate: item.estimate },
        ...(item.alsoPaced ?? []),
      ];
      let readyAt = at;
      let paused = false;
      for (const stage of stages) {
        const readiness = pacer.readiness(stage.pacingKey, stage.estimate, at);
        if (readiness.kind === "tomorrow") {
          reasons.add(`${stage.pacingKey}: ${readiness.reason}`);
          paused = true;
        } else if (readiness.kind === "at") readyAt = Math.max(readyAt, readiness.at);
      }
      if (paused) continue;
      if (readyAt <= at) {
        next = item;
        break;
      }
      earliest = Math.min(earliest, readyAt);
    }
    if (next === undefined) {
      if (earliest === Infinity) return { kind: "paused", reasons: [...reasons] };
      await wait(earliest - at);
      continue;
    }
    guard.check(
      (next.alsoPaced ?? []).reduce(
        (sum, stage) => sum + stage.estimate.costUsd,
        next.estimate.costUsd,
      ),
    );
    const attempt = await next.run();
    const finishedAt = now();
    const used: StageUse[] = [
      {
        pacingKey: next.pacingKey,
        usage: attempt.usage,
        costUsd: attempt.costUsd,
        headers: attempt.headers,
      },
      ...(attempt.alsoUsed ?? []),
    ];
    for (const stage of used) {
      hooks.usage(pacer.record(stage.pacingKey, stage.usage, finishedAt, stage.costUsd));
      pacer.observe(stage.pacingKey, stage.headers, finishedAt);
      guard.add(stage.costUsd);
    }

    const counts = attempts.get(next.id) ?? { failures: 0, limited: 0 };
    attempts.set(next.id, counts);
    if (attempt.failure === undefined && attempt.result !== undefined) {
      hooks.done(next.id, attempt.result);
      pending.splice(pending.indexOf(next), 1);
      completed += 1;
      if (completed % 25 === 0) {
        hooks.progress?.(
          `${String(completed)} done, ${String(pending.length)} left, ${guard.spentUsd.toFixed(3)} USD`,
        );
      }
      continue;
    }
    const failure = attempt.failure ?? { message: "no result" };
    if (failure.status === 429) counts.limited += 1;
    else counts.failures += 1;
    hooks.failed(next.id, failure, counts.failures + counts.limited, attempt.costUsd);
    if (counts.failures >= maxAttempts || counts.limited >= maxRateLimited) {
      hooks.done(next.id, attempt.result ?? next.exhausted(failure));
      pending.splice(pending.indexOf(next), 1);
    }
  }
  return { kind: "complete" };
}
