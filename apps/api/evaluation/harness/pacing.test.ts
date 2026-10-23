import { describe, expect, it } from "vitest";
import {
  BudgetExceededError,
  CostGuard,
  Pacer,
  parseResetMs,
  type LedgerEntry,
  type PacingKey,
} from "./pacing.ts";
import { models } from "./prices.ts";

const whisper = models["whisper-large-v3-turbo"];
const chat = models["openai/gpt-oss-20b"];
const nano = models["gpt-5.4-nano"];
const keys = new Map<string, PacingKey>([
  ["groq:whisper", { provider: "groq", ...(whisper?.freePlan && { plan: whisper.freePlan }) }],
  ["groq:chat", { provider: "groq", ...(chat?.freePlan && { plan: chat.freePlan }) }],
  [
    "openai:nano",
    { provider: "openai", complimentary: { group: "openai-small", tokensPerDay: 1_000 } },
  ],
  [
    "openai:other",
    { provider: "openai", complimentary: { group: "openai-small", tokensPerDay: 1_000 } },
  ],
]);
const noon = Date.parse("2026-10-23T12:00:00.000Z");
const call = { requests: 1, audioSeconds: 10, tokens: 0 };

const entries = (
  key: string,
  count: number,
  at: (index: number) => number,
  usage = call,
): LedgerEntry[] => Array.from({ length: count }, (_, index) => ({ key, at: at(index), ...usage }));

describe("parseResetMs", () => {
  it("reads Groq's and OpenAI's reset durations and plain seconds", () => {
    expect(parseResetMs("4m19.2s")).toBe(259_200);
    expect(parseResetMs("12ms")).toBe(12);
    expect(parseResetMs("1h2m")).toBe(3_720_000);
    expect(parseResetMs("7")).toBe(7_000);
    expect(parseResetMs(undefined)).toBeUndefined();
  });
});

describe("Pacer", () => {
  it("keeps half of the per-minute requests free and waits until the window frees one", () => {
    expect(nano).toBeDefined();
    const ledger = entries("groq:whisper", 10, (index) => noon - 50_000 + index * 1_000);
    const pacer = new Pacer(keys, ledger);
    expect(pacer.readiness("groq:whisper", call, noon)).toEqual({ kind: "at", at: noon + 10_000 });
    expect(new Pacer(keys, ledger.slice(1)).readiness("groq:whisper", call, noon)).toEqual({
      kind: "now",
    });
  });

  it("keeps half of the audio seconds per hour free", () => {
    const ledger = entries("groq:whisper", 3, (index) => noon - 3_000_000 + index * 1_000, {
      requests: 0,
      audioSeconds: 1_200,
      tokens: 0,
    });
    const readiness = new Pacer(keys, ledger).readiness("groq:whisper", call, noon);
    expect(readiness).toEqual({ kind: "at", at: noon - 3_000_000 + 3_600_000 });
  });

  it("keeps half of a daily limit free over any 24 hours, not per calendar day", () => {
    const ledger = entries("groq:whisper", 1, () => noon - 3_600_000, {
      requests: 999,
      audioSeconds: 0,
      tokens: 0,
    });
    const pacer = new Pacer(keys, ledger);
    const two = { requests: 2, audioSeconds: 0, tokens: 0 };
    const readiness = pacer.readiness("groq:whisper", two, noon);
    expect(readiness).toMatchObject({ kind: "tomorrow" });
    expect(readiness.kind === "tomorrow" && readiness.reason).toMatch(
      /keeps 1000 of 2000 free over any 24 hours; resume after 2026-10-24T11:00:00.000Z$/,
    );
    expect(
      pacer.readiness("groq:whisper", { requests: 1, audioSeconds: 0, tokens: 0 }, noon),
    ).toEqual({ kind: "now" });
    expect(pacer.readiness("groq:whisper", two, noon + 13 * 3_600_000)).toMatchObject({
      kind: "tomorrow",
    });
    expect(pacer.readiness("groq:whisper", two, noon + 23 * 3_600_000 + 60_000)).toEqual({
      kind: "now",
    });
  });

  it("lets Groq chat use its daily tokens down to 10K left, while Whisper and OpenAI keep half", () => {
    const chatLedger = entries("groq:chat", 1, () => noon - 3_600_000, {
      requests: 1,
      audioSeconds: 0,
      tokens: 189_500,
    });
    const chatPacer = new Pacer(keys, chatLedger);
    const tokens = (count: number) => ({ requests: 1, audioSeconds: 0, tokens: count });
    expect(chatPacer.readiness("groq:chat", tokens(400), noon)).toEqual({ kind: "now" });
    const over = chatPacer.readiness("groq:chat", tokens(600), noon);
    expect(over.kind === "tomorrow" && over.reason).toMatch(/keeps 10000 of 200000 free/);

    const whisperLedger = entries("groq:whisper", 1, () => noon - 3_600_000, {
      requests: 0,
      audioSeconds: 14_390,
      tokens: 0,
    });
    const audio = new Pacer(keys, whisperLedger).readiness(
      "groq:whisper",
      { requests: 0, audioSeconds: 20, tokens: 0 },
      noon,
    );
    expect(audio.kind === "tomorrow" && audio.reason).toMatch(/keeps 14400 of 28800 free/);

    const openai = new Pacer(keys, [
      { key: "openai:nano", group: "openai-small", at: noon - 1_000, ...tokens(450) },
    ]);
    expect(openai.readiness("openai:nano", tokens(100), noon)).toMatchObject({
      kind: "tomorrow",
    });
  });

  it("shares a complimentary group's daily tokens across its models", () => {
    const ledger: LedgerEntry[] = [
      {
        key: "openai:nano",
        group: "openai-small",
        at: noon - 1_000,
        requests: 1,
        audioSeconds: 0,
        tokens: 450,
      },
    ];
    const pacer = new Pacer(keys, ledger);
    expect(
      pacer.readiness("openai:other", { requests: 1, audioSeconds: 0, tokens: 100 }, noon),
    ).toMatchObject({
      kind: "tomorrow",
    });
    expect(
      pacer.readiness("openai:other", { requests: 1, audioSeconds: 0, tokens: 50 }, noon),
    ).toEqual({ kind: "now" });
  });

  it("records usage under the key's complimentary group", () => {
    const ledger: LedgerEntry[] = [];
    new Pacer(keys, ledger).record(
      "openai:nano",
      { requests: 1, audioSeconds: 0, tokens: 30 },
      noon,
    );
    expect(ledger).toEqual([
      {
        key: "openai:nano",
        group: "openai-small",
        at: noon,
        requests: 1,
        audioSeconds: 0,
        tokens: 30,
      },
    ]);
  });

  it("waits for Groq's reset once production's half of the daily requests is reached", () => {
    const pacer = new Pacer(keys, []);
    pacer.observe(
      "groq:whisper",
      {
        "x-ratelimit-limit-requests": "2000",
        "x-ratelimit-remaining-requests": "999",
        "x-ratelimit-reset-requests": "32m24s",
      },
      noon,
    );
    expect(pacer.readiness("groq:whisper", call, noon + 60_000)).toEqual({
      kind: "at",
      at: noon + 1_944_000,
    });
  });

  it("waits for the reset when a per-window budget falls under half, and after a retry-after", () => {
    const pacer = new Pacer(keys, []);
    pacer.observe(
      "groq:whisper",
      {
        "x-ratelimit-limit-audio-seconds": "7200",
        "x-ratelimit-remaining-audio-seconds": "3000",
        "x-ratelimit-reset-audio-seconds": "2m",
        "x-ratelimit-limit-requests": "2000",
        "x-ratelimit-remaining-requests": "1500",
      },
      noon,
    );
    expect(pacer.readiness("groq:whisper", call, noon)).toEqual({ kind: "at", at: noon + 120_000 });
    pacer.observe("openai:nano", { "retry-after": "7" }, noon);
    expect(
      pacer.readiness("openai:nano", { requests: 1, audioSeconds: 0, tokens: 1 }, noon),
    ).toEqual({
      kind: "at",
      at: noon + 7_000,
    });
  });
});

describe("CostGuard", () => {
  it("refuses a call that would take the run above its budget", () => {
    const guard = new CostGuard(3);
    guard.check(2.5);
    guard.add(2.5);
    guard.check(0.5);
    expect(() => {
      guard.check(0.6);
    }).toThrow(BudgetExceededError);
  });
});
