import { describe, expect, it } from "vitest";
import {
  checkDictation,
  combinationOf,
  summarizeDictations,
  type DictateResult,
} from "./dictate-analysis.ts";
import type { SpeechCase } from "./fixtures.ts";
import { percentile, sumDistribution } from "./metrics.ts";

const item: SpeechCase = {
  id: "dev-en-3",
  kind: "speech",
  language: "en",
  dictionary: "developer",
  text: "The Terraform plan shows the Lambda will be replaced, so let's not merge yet.",
  variants: [],
  terms: ["Terraform", "Lambda", "merge"],
  mixed: false,
  endToEnd: true,
};

const name = combinationOf("together-parakeet", "cerebras-qwen-3.8-27b@none");

function result(
  text: string,
  total: number,
  overrides: Partial<DictateResult> = {},
): DictateResult {
  return {
    id: `${name}|dev-en-3/Joanna|one|1`,
    combination: name,
    transcriber: "together-parakeet",
    refiner: "cerebras-qwen-3.8-27b@none",
    caseId: item.id,
    voice: "Joanna",
    run: 1,
    language: "en",
    ok: true,
    dictation: {
      raw: text,
      text,
      providers: {},
      latencyMs: { transcribe: total - 300, refine: 250, total },
    },
    calls: [],
    coldStart: false,
    region: "us-east-1",
    memoryMb: 1024,
    listUsd: 0,
    chargedUsd: 0,
    at: "2026-10-24T00:00:00.000Z",
    ...overrides,
  };
}

describe("checkDictation", () => {
  it("scores the pasted text against the expected one and flags what the hard gate fails", () => {
    expect(checkDictation(result(item.text, 900), item)).toMatchObject({
      errors: 0,
      termsWrong: [],
      flags: [],
    });
    const wrong = checkDictation(
      result(
        "O plano do Terraform mostra que a Lambda vai ser substituída, então não faça merge.",
        900,
      ),
      item,
    );
    expect(wrong.flags).toEqual(["wrong language: reads as neither es nor en"]);
    expect(
      checkDictation(result("The terraform plan shows the lambda will be replaced.", 900), item)
        .termsWrong,
    ).toEqual(["Terraform", "Lambda", "merge"]);
  });
});

describe("summarizeDictations", () => {
  it("adds the client overhead as a distribution and leaves cold starts and failures out", () => {
    const checked = [
      result(item.text, 800),
      result(item.text, 1_000),
      result(item.text, 5_000, { coldStart: true }),
      result(item.text, 0, { ok: false, error: { status: 429, message: "limited" } }),
    ].map((entry) => checkDictation(entry, item));
    const overhead = [400, 600, 1_400];
    const summary = summarizeDictations(name, checked, overhead);
    expect(summary).toMatchObject({ results: 4, failed: 1, wer: 0 });
    expect(summary.latency.inLambdaSamples).toEqual([800, 1_000]);
    const sums = sumDistribution([800, 1_000], overhead);
    expect(summary.latency.releaseToText).toEqual({
      count: 6,
      p50: percentile(sums, 50),
      p95: percentile(sums, 95),
    });
    expect(summary.latency.releaseToText.p95).toBe(2_400);
  });
});
