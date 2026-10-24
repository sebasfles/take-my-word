import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  BudgetExceededError,
  CostGuard,
  Pacer,
  type LedgerEntry,
  type PacingKey,
} from "./pacing.ts";
import { maxAttempts, runSchedule, type Attempt, type PlannedItem } from "./scheduler.ts";
import { appendJsonl, openResultsDir, paths, readJsonl } from "./store.ts";
import {
  executePlan,
  recordedSpendUsd,
  recordSynthesis,
  requireSynthesisBudget,
  synthesisUsd,
} from "./suite.ts";

const keys = new Map<string, PacingKey>([
  [
    "slow",
    { provider: "groq", plan: { requestsPerMinute: 2, requestsPerDay: 1_000, source: "test" } },
  ],
  ["fast", { provider: "openai" }],
  [
    "cerebras:qwen",
    { provider: "cerebras", prepaid: { startUsd: 15, since: "2026-10-23", floorUsd: 5 } },
  ],
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
    exhausted: (failure) => `${id} exhausted: ${failure.message}`,
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
      done: (_id: string, result: string) => done.push(result),
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

  it("stores an item that exhausts its retries as a failed result", async () => {
    const time = clock();
    const recorder = hooks();
    const broken = item("y", "fast", () => Promise.reject(new Error("unreachable")));
    const throwing: PlannedItem<string> = {
      ...broken,
      run: () =>
        Promise.resolve({
          usage: { requests: 0, audioSeconds: 0, tokens: 0 },
          costUsd: 0,
          headers: {},
          failure: { message: "invoke failed" },
        }),
    };
    await runSchedule(
      [throwing],
      new Pacer(keys, []),
      new CostGuard(3),
      recorder.hooks,
      time.now,
      time.wait,
    );
    expect(recorder.failed).toHaveLength(maxAttempts);
    expect(recorder.done).toEqual(["y exhausted: invoke failed"]);
  });
});

describe("runSchedule across two stages", () => {
  it("waits for the slower of a dictation's two providers and records the use of both", async () => {
    const time = clock();
    const recorder = hooks();
    const dictation = (id: string): PlannedItem<string> => ({
      ...item(id, "slow", () =>
        Promise.resolve({
          ...ok(id),
          alsoUsed: [
            {
              pacingKey: "cerebras:qwen",
              usage: { requests: 1, audioSeconds: 0, tokens: 500 },
              costUsd: 0.002,
              headers: {},
            },
          ],
        }),
      ),
      alsoPaced: [
        {
          pacingKey: "cerebras:qwen",
          estimate: { requests: 1, audioSeconds: 0, tokens: 500, costUsd: 0.002 },
        },
      ],
    });
    const guard = new CostGuard(3);
    const outcome = await runSchedule(
      [dictation("d1"), dictation("d2")],
      new Pacer(keys, []),
      guard,
      recorder.hooks,
      time.now,
      time.wait,
    );
    expect(outcome).toEqual({ kind: "complete" });
    expect(recorder.ledger.map((entry) => [entry.key, entry.usd])).toEqual([
      ["slow", 0.01],
      ["cerebras:qwen", 0.002],
      ["slow", 0.01],
      ["cerebras:qwen", 0.002],
    ]);
    expect(guard.spentUsd).toBeCloseTo(0.024, 10);
  });

  it("stops before a call whose second stage alone would pass the budget", async () => {
    const time = clock();
    const recorder = hooks();
    const run = vi.fn(() => Promise.resolve(ok("d1")));
    await expect(
      runSchedule(
        [
          {
            ...item("d1", "fast", run),
            alsoPaced: [
              {
                pacingKey: "fast",
                estimate: { requests: 1, audioSeconds: 0, tokens: 0, costUsd: 0.5 },
              },
            ],
          },
        ],
        new Pacer(keys, []),
        new CostGuard(0.2),
        recorder.hooks,
        time.now,
        time.wait,
      ),
    ).rejects.toThrow(BudgetExceededError);
    expect(run).not.toHaveBeenCalled();
  });

  it("pauses an item whose second stage would take a prepaid balance under its floor", async () => {
    const time = clock();
    const recorder = hooks();
    const spent: LedgerEntry = {
      key: "cerebras:qwen",
      at: time.now() - 1_000,
      requests: 1,
      audioSeconds: 0,
      tokens: 0,
      usd: 9.999,
    };
    const outcome = await runSchedule(
      [
        {
          ...item("d1", "fast"),
          alsoPaced: [
            {
              pacingKey: "cerebras:qwen",
              estimate: { requests: 1, audioSeconds: 0, tokens: 500, costUsd: 0.002 },
            },
          ],
        },
      ],
      new Pacer(keys, [spent]),
      new CostGuard(3),
      recorder.hooks,
      time.now,
      time.wait,
    );
    expect(outcome.kind).toBe("paused");
    expect(outcome.kind === "paused" && outcome.reasons[0]).toMatch(
      /^cerebras:qwen: cerebras balance: 5\.0010 of 15\.00 USD left/,
    );
    expect(recorder.done).toEqual([]);
  });
});

describe("executePlan", () => {
  it("counts what earlier days of the same run already spent, failed attempts included", async () => {
    const root = mkdtempSync(join(tmpdir(), "tmw-plan-"));
    try {
      const dir = openResultsDir(
        join(root, "run"),
        {
          suite: "test",
          fixturesSha256: "f",
          codeCommit: "c",
          runs: 3,
          requestsSha256: "r",
          evalBundleSha256: "b",
        },
        new Date(),
      );
      appendJsonl(dir.results, { chargedUsd: 2.5 });
      const pending: PlannedItem<{ chargedUsd: number }> = {
        id: "b",
        pacingKey: "openai:gpt-6-luna",
        estimate: { requests: 1, audioSeconds: 0, tokens: 0, costUsd: 0.01 },
        run: () =>
          Promise.resolve({
            result: { chargedUsd: 0.01 },
            usage: { requests: 1, audioSeconds: 0, tokens: 0 },
            costUsd: 0.01,
            headers: {},
          }),
        exhausted: () => ({ chargedUsd: 0 }),
      };
      expect(await executePlan(dir, ["gpt-6-luna"], [pending])).toBe(true);
      appendJsonl(dir.failures, { id: "a", attempt: 1, message: "x", chargedUsd: 0.485, at: "" });
      await expect(executePlan(dir, ["gpt-6-luna"], [{ ...pending, id: "c" }])).rejects.toThrow(
        BudgetExceededError,
      );
      expect(readJsonl(dir.results)).toHaveLength(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("speech synthesis spend", () => {
  it("counts each run's Polly characters in its cap, before synthesizing again", () => {
    const root = mkdtempSync(join(tmpdir(), "tmw-polly-"));
    try {
      const at = join(root, "run");
      expect(synthesisUsd(1_000_000)).toBeCloseTo(19.2, 10);
      requireSynthesisBudget(paths(at, "test"), 20_000);
      const dir = openResultsDir(
        at,
        {
          suite: "test",
          fixturesSha256: "f",
          codeCommit: "c",
          runs: 3,
          requestsSha256: "r",
          evalBundleSha256: "b",
        },
        new Date(),
      );
      recordSynthesis(dir, 20_000);
      appendJsonl(dir.results, { chargedUsd: 2.3 });
      expect(recordedSpendUsd(dir)).toBeCloseTo(2.3 + synthesisUsd(20_000), 10);
      expect(() => {
        requireSynthesisBudget(paths(at, "test"), 20_000);
      }).toThrow(BudgetExceededError);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
