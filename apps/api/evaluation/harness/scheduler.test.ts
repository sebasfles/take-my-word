import { describe, expect, it } from "vitest";
import {
  BudgetExceededError,
  CostGuard,
  Pacer,
  type LedgerEntry,
  type PacingKey,
} from "./pacing.ts";
import { runSchedule, type Attempt, type PlannedItem } from "./scheduler.ts";

const keys = new Map<string, PacingKey>([
  [
    "slow",
    { provider: "groq", plan: { requestsPerMinute: 2, requestsPerDay: 1_000, source: "test" } },
  ],
  ["fast", { provider: "openai" }],
  [
    "tiny",
    { provider: "groq", plan: { requestsPerMinute: 100, requestsPerDay: 2, source: "test" } },
  ],
]);

function clock() {
  let now = Date.parse("2026-10-23T12:00:00.000Z");
  return {
    now: () => now,
    wait: (ms: number) => {
      now += ms;
      return Promise.resolve();
    },
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const ok = (id: string): Attempt<string> => ({
  result: id,
  usage: { requests: 1, audioSeconds: 0, tokens: 0 },
  costUsd: 0.01,
  headers: {},
});

function item(
  id: string,
  key: string,
  run: () => Promise<Attempt<string>> = () => Promise.resolve(ok(id)),
): PlannedItem<string> {
  return {
    id,
    pacingKey: key,
    estimate: { requests: 1, audioSeconds: 0, tokens: 0, costUsd: 0.01 },
    run,
  };
}

function hooks() {
  const done: string[] = [];
  const failed: string[] = [];
  const ledger: LedgerEntry[] = [];
  return {
    done,
    failed,
    ledger,
    hooks: {
      done: (id: string) => done.push(id),
      failed: (id: string, failure: { message: string }) =>
        failed.push(`${id}: ${failure.message}`),
      usage: (entry: LedgerEntry) => ledger.push(entry),
    },
  };
}

describe("runSchedule", () => {
  it("fills the wait of a paced provider with calls to another", async () => {
    const time = clock();
    const recorder = hooks();
    const items = [item("s1", "slow"), item("s2", "slow"), item("f1", "fast"), item("f2", "fast")];
    const outcome = await runSchedule(
      items,
      new Pacer(keys, []),
      new CostGuard(3),
      recorder.hooks,
      time.now,
      time.wait,
    );
    expect(outcome).toEqual({ kind: "complete" });
    expect(recorder.done).toEqual(["s1", "f1", "f2", "s2"]);
    expect(
      recorder.ledger.find(
        (entry) => entry.key === "slow" && entry.at > Date.parse("2026-10-23T12:00:30.000Z"),
      ),
    ).toBeDefined();
  });

  it("pauses for the day with the reason when a daily limit leaves nothing to run", async () => {
    const time = clock();
    const recorder = hooks();
    const items = [item("t1", "tiny"), item("t2", "tiny")];
    const outcome = await runSchedule(
      items,
      new Pacer(keys, []),
      new CostGuard(3),
      recorder.hooks,
      time.now,
      time.wait,
    );
    expect(recorder.done).toEqual(["t1"]);
    expect(outcome).toMatchObject({ kind: "paused" });
    expect(outcome.kind === "paused" && outcome.reasons[0]).toMatch(/^tiny: requests per day/);
  });

  it("retries a failed call and keeps the failure apart from the result", async () => {
    const time = clock();
    const recorder = hooks();
    let calls = 0;
    const flaky = item("x", "fast", () => {
      calls += 1;
      return Promise.resolve(
        calls === 1
          ? {
              usage: { requests: 1, audioSeconds: 0, tokens: 0 },
              costUsd: 0,
              headers: {},
              failure: { status: 500, message: "boom" },
            }
          : ok("x"),
      );
    });
    await runSchedule(
      [flaky],
      new Pacer(keys, []),
      new CostGuard(3),
      recorder.hooks,
      time.now,
      time.wait,
    );
    expect(recorder.failed).toEqual(["x: boom"]);
    expect(recorder.done).toEqual(["x"]);
  });

  it("stops before a call that would pass the budget", async () => {
    const time = clock();
    const recorder = hooks();
    const items = [item("a", "fast"), item("b", "fast")];
    await expect(
      runSchedule(
        items,
        new Pacer(keys, []),
        new CostGuard(0.015),
        recorder.hooks,
        time.now,
        time.wait,
      ),
    ).rejects.toThrow(BudgetExceededError);
    expect(recorder.done).toEqual(["a"]);
  });
});
