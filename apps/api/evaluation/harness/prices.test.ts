import { describe, expect, it } from "vitest";
import {
  billedAudioSeconds,
  chargedUsd,
  modelFacts,
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
    expect(chargedUsd(modelFacts("openai/gpt-oss-20b"), list)).toBe(0);
    expect(chargedUsd(modelFacts("gpt-6-luna"), 0.5)).toBe(0.5);
  });

  it("bills Together per started second with no minimum and charges prepaid calls at list price", () => {
    const parakeet = modelFacts("nvidia/parakeet-tdt-0.6b-v3");
    expect(billedAudioSeconds(parakeet, 4.2)).toBe(5);
    const list = transcriptionCallUsd(parakeet, 4.2);
    expect(list).toBeCloseTo((5 / 60) * 0.0015, 12);
    expect(chargedUsd(parakeet, list)).toBe(list);
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
