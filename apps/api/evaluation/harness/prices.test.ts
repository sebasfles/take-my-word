import { describe, expect, it } from "vitest";
import {
  billedAudioSeconds,
  chargedUsd,
  freePlanAt,
  modelFacts,
  planNotes,
  pricesCheckedFor,
  tokenCostUsd,
  transcriptionCallUsd,
} from "./prices.ts";

describe("transcription prices", () => {
  it("bills Groq by duration with its 10 s minimum", () => {
    const turbo = modelFacts("whisper-large-v3-turbo");
    expect(billedAudioSeconds(turbo, 4.2)).toBe(10);
    expect(billedAudioSeconds(turbo, 14.2)).toBe(15);
    expect(transcriptionCallUsd(turbo, 4.2)).toBeCloseTo((10 / 3600) * 0.04, 10);
  });

  it("bills gpt-transcribe by the seconds the provider reports", () => {
    const facts = modelFacts("gpt-transcribe");
    expect(transcriptionCallUsd(facts, 2.07, { seconds: 3 })).toBeCloseTo((3 / 60) * 0.0045, 10);
  });

  it("bills the gpt-4o models by measured audio and text tokens, estimating only before a call", () => {
    const facts = modelFacts("gpt-4o-transcribe");
    expect(transcriptionCallUsd(facts, 2, { inputTokens: 20, outputTokens: 10 })).toBeCloseTo(
      (20 * 2.5 + 10 * 10) / 1_000_000,
      12,
    );
    expect(transcriptionCallUsd(facts, 60)).toBeCloseTo(0.006, 10);
  });

  it("charges nothing on a free plan while keeping the list price", () => {
    const list = tokenCostUsd(modelFacts("openai/gpt-oss-20b"), 1_000_000, 0);
    expect(list).toBeCloseTo(0.075, 10);
    expect(chargedUsd(modelFacts("openai/gpt-oss-20b"), list, Date.now(), {})).toBe(0);
    expect(chargedUsd(modelFacts("gpt-6-luna"), 0.5)).toBe(0.5);
  });

  it("bills Together per started second with no minimum and charges prepaid calls at list price", () => {
    const parakeet = modelFacts("nvidia/parakeet-tdt-0.6b-v3");
    expect(billedAudioSeconds(parakeet, 4.2)).toBe(5);
    const list = transcriptionCallUsd(parakeet, 4.2);
    expect(list).toBeCloseTo((5 / 60) * 0.0015, 12);
    expect(chargedUsd(parakeet, list)).toBe(list);
    expect(billedAudioSeconds(parakeet, 4.2, { seconds: 4.04 })).toBe(5);
    expect(transcriptionCallUsd(parakeet, 4.2, { seconds: 4.04 })).toBeCloseTo(list, 12);
    const qwen = modelFacts("qwen-3.8-27b");
    expect(chargedUsd(qwen, tokenCostUsd(qwen, 1_000_000, 1_000_000))).toBeCloseTo(2.48, 10);
  });
});

describe("pricesCheckedFor", () => {
  it("dates each provider's prices by the day they were checked", () => {
    expect(
      pricesCheckedFor(["whisper-large-v3-turbo", "gpt-transcribe", "nvidia/parakeet-tdt-0.6b-v3"]),
    ).toBe("2026-10-23 (Groq, OpenAI) and 2026-10-24 (Together)");
  });
});

describe("a provider's move to a paid plan", () => {
  const paid = {
    groq: {
      since: "2026-10-25T00:00:00.000Z",
      plan: "Developer tier",
      monthlySpendLimitUsd: 5,
      creditUsd: 10,
      headerFloors: { requests: 1_000, "audio-seconds": 7_200, tokens: 20_000 },
    },
  };
  const before = Date.parse("2026-10-24T23:59:59.000Z");
  const after = Date.parse("2026-10-25T00:00:01.000Z");

  it("keeps calls before the date free and charges the ones after at list price", () => {
    const turbo = modelFacts("whisper-large-v3-turbo");
    expect(chargedUsd(turbo, 0.01, before, paid)).toBe(0);
    expect(chargedUsd(turbo, 0.01, after, paid)).toBe(0.01);
    expect(freePlanAt(turbo, after, paid)).toBeUndefined();
    expect(freePlanAt(turbo, before, paid)).toBe(turbo.freePlan);
    expect(chargedUsd(turbo, 0.01, before, {})).toBe(0);
  });

  it("states the task's spend since the move against the shared monthly limit", () => {
    const ledger = [
      { key: "groq:whisper-large-v3-turbo", at: before, usd: 0 },
      { key: "groq:whisper-large-v3-turbo", at: after, usd: 0.25 },
      { key: "groq:openai/gpt-oss-20b", at: after, usd: 0.5 },
      { key: "openai:gpt-transcribe", at: after, usd: 1 },
    ];
    expect(planNotes(ledger, paid)).toEqual([
      "Groq moved from its free plan to its Developer tier at 2026-10-25T00:00:00.000Z, with 10.00 USD of credit and a 5.00 USD monthly spend limit that the account shares with production; its calls from then on are charged at list price and count in the run cap, and pace on its rate-limit headers, keeping 1000 requests, 7200 audio seconds and 20000 tokens of each reported allowance for production; this task's Groq spend since then is 0.750 USD",
    ]);
  });
});
