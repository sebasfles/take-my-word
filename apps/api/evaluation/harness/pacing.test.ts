import { describe, expect, it } from "vitest";
import {
  BalanceFloorError,
  BudgetExceededError,
  CostGuard,
  Pacer,
  parseResetMs,
  prepaidOutlook,
  requireAboveFloor,
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
    "together:parakeet",
    { provider: "together", prepaid: { startUsd: 15, since: "2026-10-24", floorUsd: 5 } },
  ],
  [
    "together:whisper",
    { provider: "together", prepaid: { startUsd: 15, since: "2026-10-24", floorUsd: 5 } },
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
    const ledger = entries("groq:chat", 15, (index) => noon - 50_000 + index * 1_000, {
      requests: 1,
      audioSeconds: 0,
      tokens: 0,
    });
    const need = { requests: 1, audioSeconds: 0, tokens: 0 };
    const pacer = new Pacer(keys, ledger);
    expect(pacer.readiness("groq:chat", need, noon)).toEqual({ kind: "at", at: noon + 10_000 });
    expect(new Pacer(keys, ledger.slice(1)).readiness("groq:chat", need, noon)).toEqual({
      kind: "now",
    });
  });

  it("paces a Groq model on a paid plan only by Groq's headers, with no free-plan windows", () => {
    const paid = new Map<string, PacingKey>([["groq:whisper", { provider: "groq" }]]);
    const pacer = new Pacer(
      paid,
      entries("groq:whisper", 40, (index) => noon - 50_000 + index * 1_000, {
        requests: 1,
        audioSeconds: 7_200,
        tokens: 0,
      }),
    );
    expect(pacer.readiness("groq:whisper", call, noon)).toEqual({ kind: "now" });
    pacer.observe("groq:whisper", { "retry-after": "2" }, noon);
    expect(pacer.readiness("groq:whisper", call, noon)).toEqual({ kind: "at", at: noon + 2_000 });
  });

  it("waits on a paid plan's headers only when nothing remains, not at half", () => {
    const paid = new Map<string, PacingKey>([["groq:whisper", { provider: "groq", paid: true }]]);
    const headers = {
      "x-ratelimit-limit-requests": "200000",
      "x-ratelimit-remaining-requests": "2320",
      "x-ratelimit-reset-requests": "23h43m17.76s",
      "x-ratelimit-limit-audio-seconds": "400000",
      "x-ratelimit-remaining-audio-seconds": "48481",
      "x-ratelimit-reset-audio-seconds": "52m43.671s",
    };
    const pacer = new Pacer(paid, []);
    pacer.observe("groq:whisper", headers, noon);
    expect(pacer.readiness("groq:whisper", call, noon)).toEqual({ kind: "now" });
    pacer.observe("groq:whisper", { ...headers, "x-ratelimit-remaining-audio-seconds": "0" }, noon);
    expect(pacer.readiness("groq:whisper", call, noon)).toEqual({
      kind: "at",
      at: noon + 3_163_671,
    });
    const free = new Pacer(keys, []);
    free.observe(
      "openai:nano",
      { "x-ratelimit-limit-tokens": "200000", "x-ratelimit-remaining-tokens": "90000" },
      noon,
    );
    expect(free.readiness("openai:nano", call, noon).kind).toBe("at");
  });

  it("paces Groq Whisper at a quarter of its per-minute limit, 5 of 20", () => {
    const ledger = entries("groq:whisper", 5, (index) => noon - 50_000 + index * 1_000);
    expect(new Pacer(keys, ledger).readiness("groq:whisper", call, noon)).toEqual({
      kind: "at",
      at: noon + 10_000,
    });
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

describe("whisper daily override", () => {
  const usedToday = entries("groq:whisper", 1, () => noon - 3_600_000, {
    requests: 1_500,
    audioSeconds: 20_000,
    tokens: 0,
  });

  it("is off by default: Whisper keeps half of each daily limit", () => {
    expect(new Pacer(keys, usedToday).readiness("groq:whisper", call, noon)).toMatchObject({
      kind: "tomorrow",
    });
  });

  it("when opted in, lets Whisper use its daily limits down to the kept share, never below 10%", () => {
    const pacer = new Pacer(keys, usedToday, undefined, { whisperDailyKept: 0.1 });
    expect(pacer.readiness("groq:whisper", call, noon)).toEqual({ kind: "now" });
    const nearlyAll = entries("groq:whisper", 1, () => noon - 3_600_000, {
      requests: 1_795,
      audioSeconds: 0,
      tokens: 0,
    });
    const full = new Pacer(keys, nearlyAll, undefined, { whisperDailyKept: 0.1 }).readiness(
      "groq:whisper",
      { requests: 6, audioSeconds: 0, tokens: 0 },
      noon,
    );
    expect(full.kind === "tomorrow" && full.reason).toMatch(/keeps 200 of 2000 free/);
    expect(() => new Pacer(keys, [], undefined, { whisperDailyKept: 0.05 })).toThrow(/between 0.1/);
  });

  it("lets Groq's daily-requests header fall to the kept share before pausing", () => {
    const headers = (remaining: number) => ({
      "x-ratelimit-limit-requests": "2000",
      "x-ratelimit-remaining-requests": String(remaining),
      "x-ratelimit-reset-requests": "32m24s",
    });
    const overridden = new Pacer(keys, [], undefined, { whisperDailyKept: 0.1 });
    overridden.observe("groq:whisper", headers(400), noon);
    expect(overridden.readiness("groq:whisper", call, noon)).toEqual({ kind: "now" });
    overridden.observe("groq:whisper", headers(199), noon);
    expect(overridden.readiness("groq:whisper", call, noon)).toEqual({
      kind: "at",
      at: noon + 1_944_000,
    });
    const standard = new Pacer(keys, []);
    standard.observe("groq:whisper", headers(400), noon);
    expect(standard.readiness("groq:whisper", call, noon)).toMatchObject({ kind: "at" });
  });

  it("leaves the per-minute pace, the chat reserve and OpenAI's half untouched", () => {
    const recent = entries("groq:whisper", 5, (index) => noon - 50_000 + index * 1_000);
    expect(
      new Pacer(keys, recent, undefined, { whisperDailyKept: 0.1 }).readiness(
        "groq:whisper",
        call,
        noon,
      ),
    ).toEqual({ kind: "at", at: noon + 10_000 });
    const chat = new Pacer(
      keys,
      entries("groq:chat", 1, () => noon - 3_600_000, {
        requests: 1,
        audioSeconds: 0,
        tokens: 189_500,
      }),
      undefined,
      { whisperDailyKept: 0.1 },
    ).readiness("groq:chat", { requests: 1, audioSeconds: 0, tokens: 600 }, noon);
    expect(chat.kind).toBe("tomorrow");
    const openai = new Pacer(
      keys,
      [
        {
          key: "openai:nano",
          group: "openai-small",
          at: noon - 1_000,
          requests: 1,
          audioSeconds: 0,
          tokens: 450,
        },
      ],
      undefined,
      { whisperDailyKept: 0.1 },
    ).readiness("openai:nano", { requests: 1, audioSeconds: 0, tokens: 100 }, noon);
    expect(openai.kind).toBe("tomorrow");
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

describe("prepaid balance floor", () => {
  const day = Date.parse("2026-10-24T12:00:00.000Z");
  const spent = (key: string, usd: number, at = day - 1_000): LedgerEntry => ({
    key,
    at,
    requests: 1,
    audioSeconds: 0,
    tokens: 0,
    usd,
  });

  it("refuses a call that would leave the provider's balance under the floor", () => {
    const pacer = new Pacer(keys, [spent("together:parakeet", 9.5)]);
    const need = { requests: 1, audioSeconds: 10, tokens: 0 };
    expect(pacer.readiness("together:whisper", { ...need, costUsd: 0.4 }, day)).toEqual({
      kind: "now",
    });
    const refused = pacer.readiness("together:whisper", { ...need, costUsd: 0.6 }, day);
    expect(refused.kind === "tomorrow" && refused.reason).toMatch(
      /^together balance: 5\.5000 of 15\.00 USD left .* under the 5\.00 USD floor$/,
    );
  });

  it("counts only the provider's own spend since the balance date", () => {
    const pacer = new Pacer(keys, [
      spent("together:parakeet", 4, Date.parse("2026-10-23T23:00:00.000Z")),
      spent("openai:nano", 20),
      spent("together:whisper", 1),
    ]);
    expect(pacer.prepaidSpentUsd("together", "2026-10-24")).toBe(1);
  });

  it("states each prepaid provider's estimate and refuses a run that would cross the floor", () => {
    const pacer = new Pacer(keys, [spent("together:parakeet", 9)]);
    const planned = [
      { pacingKey: "together:parakeet", estimate: { costUsd: 0.5 } },
      { pacingKey: "together:whisper", estimate: { costUsd: 0.6 } },
      { pacingKey: "groq:whisper", estimate: { costUsd: 0 } },
    ];
    const outlooks = prepaidOutlook(keys, pacer, planned);
    expect(outlooks).toEqual([{ provider: "together", leftUsd: 6, estimateUsd: 1.1, floorUsd: 5 }]);
    expect(() => {
      requireAboveFloor(outlooks);
    }).toThrow(BalanceFloorError);
    expect(() => {
      requireAboveFloor(prepaidOutlook(keys, pacer, planned.slice(0, 1)));
    }).not.toThrow();
  });
});
