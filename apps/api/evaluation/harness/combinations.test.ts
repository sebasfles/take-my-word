import { describe, expect, it } from "vitest";
import {
  dictationsPerMonth,
  rankPassing,
  scenarios,
  stageMonth,
  transcriptionStage,
} from "./combinations.ts";

const [light, heavy] = scenarios;

describe("monthly scenarios", () => {
  it("counts 15 s dictations: 480 in a light month, 7200 in a heavy one", () => {
    expect(dictationsPerMonth(light)).toBe(480);
    expect(dictationsPerMonth(heavy)).toBe(7200);
  });

  it("prices Groq per dictation with its billing minimum and finds its free plan covers a heavy month", () => {
    const stage = transcriptionStage("whisper-large-v3-turbo", 1.2);
    expect(stage.usdPerDictation).toBeCloseTo((15 / 3600) * 0.04 * 1.2, 10);
    const month = stageMonth(stage, heavy, {});
    expect(month.listUsd).toBeCloseTo(stage.usdPerDictation * 7200, 8);
    expect(month.covered).toBe(true);
  });

  it("prices token-billed transcription from its measured cost per audio second, with no free allowance", () => {
    const stage = transcriptionStage("gpt-4o-transcribe", 2, 0.0001);
    expect(stage.usdPerDictation).toBeCloseTo(0.0001 * 15 * 2, 10);
    expect(stageMonth(stage, light)).toMatchObject({ covered: false, why: "no free allowance" });
  });

  it("stops counting a Groq chat model as free once a heavy month passes its daily tokens", () => {
    const small = {
      model: "openai/gpt-oss-20b",
      callsPerDictation: 1,
      usdPerDictation: 0.0001,
      tokensPerCall: 700,
    };
    expect(stageMonth(small, heavy, {}).covered).toBe(true);
    const large = { ...small, tokensPerCall: 900 };
    expect(stageMonth(large, heavy, {})).toMatchObject({ covered: false });
    expect(stageMonth(large, heavy, {}).why).toMatch(/216000 of 200000 tokens per day/);
  });

  it("uses OpenAI's complimentary group for the models in it", () => {
    const nano = {
      model: "gpt-5.4-nano",
      callsPerDictation: 1,
      usdPerDictation: 0.0001,
      tokensPerCall: 700,
    };
    expect(stageMonth(nano, heavy).covered).toBe(true);
    expect(stageMonth({ ...nano, model: "gpt-6-luna" }, heavy).covered).toBe(false);
  });
});

describe("rankPassing", () => {
  it("ranks only combinations that pass both gates, fastest release to text first", () => {
    const row = (transcriber: string, passed: boolean, releaseP50: number | undefined) => ({
      transcriber,
      refiner: "r",
      passed,
      releaseP50,
    });
    expect(
      rankPassing([
        row("slow", true, 1_900),
        row("fast but failing", false, 900),
        row("fast", true, 1_100),
        row("unmeasured", true, undefined),
      ]).map((ranked) => ranked.transcriber),
    ).toEqual(["fast", "slow"]);
  });

  it("bills a prepaid provider at list price with no free allowance", () => {
    const stage = transcriptionStage("nvidia/parakeet-tdt-0.6b-v3", 1);
    expect(stage.usdPerDictation).toBeCloseTo((15 / 60) * 0.0015, 10);
    expect(stageMonth(stage, heavy)).toMatchObject({
      covered: false,
      why: "prepaid balance, billed at list price",
    });
  });
});

describe("monthly cost on a paid plan", () => {
  it("bills Groq at list price once it moved to its paid tier", () => {
    const stage = transcriptionStage("whisper-large-v3-turbo", 1);
    const paid = {
      groq: {
        since: "2026-10-01T00:00:00.000Z",
        plan: "paid Developer tier",
        monthlySpendLimitUsd: 5,
        creditUsd: 10,
        headerFloors: { requests: 1_000, "audio-seconds": 7_200, tokens: 20_000 },
      },
    };
    expect(stageMonth(stage, heavy, paid)).toMatchObject({
      covered: false,
      why: "paid Developer tier since 2026-10-01T00:00:00.000Z, billed at list price",
    });
    expect(stageMonth(stage, heavy, {}).covered).toBe(true);
  });
});
