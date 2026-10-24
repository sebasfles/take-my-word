import { describe, expect, it } from "vitest";
import { chainedCases } from "./chained.ts";
import type { TranscriptionFixtures } from "./fixtures.ts";
import type { TranscriptionResult } from "./transcription-analysis.ts";

const fixtures: TranscriptionFixtures = {
  voices: { es: ["Lupe", "Andres"], en: ["Joanna", "Matthew"], mixed: ["Pedro", "Mia"] },
  dictionaryUsedAt: "2026-10-23T00:00:00.000Z",
  dictionaries: { developer: [{ term: "hotfix", aliases: [] }] },
  cases: [
    {
      id: "dev-en-4",
      kind: "speech",
      language: "en",
      dictionary: "developer",
      text: "Push the hotfix.",
      variants: ["Push the hot fix."],
      terms: ["hotfix"],
      mixed: false,
      endToEnd: false,
    },
    {
      id: "noise-room-en",
      kind: "noise",
      language: "en",
      dictionary: "developer",
      color: "brown",
      levelDbfs: -45,
      seconds: 4,
      seed: 2,
    },
  ],
};

const result = (overrides: Partial<TranscriptionResult>): TranscriptionResult => ({
  id: "x",
  candidate: "turbo",
  caseId: "dev-en-4",
  voice: "Joanna",
  mode: "one",
  run: 1,
  connection: "fresh",
  audioSeconds: 2,
  levelDbfs: -18,
  ok: true,
  text: "Push the hot fix",
  language: "en",
  calls: [],
  coldStart: false,
  region: "us-east-1",
  memoryMb: 1024,
  listUsd: 0,
  chargedUsd: 0,
  at: "2026-10-24T00:00:00.000Z",
  ...overrides,
});

const checks = { "dev-en-4": { required: ["push"], forbidden: ["pull"], allowed: [] } };

describe("chainedCases", () => {
  it("takes run 1 of the case's first voice in its own language, one case per distinct raw", () => {
    const cases = chainedCases(
      fixtures,
      [
        result({}),
        result({ candidate: "gpt", text: "Push the hot fix" }),
        result({ candidate: "parakeet", text: "Push the hot fix." }),
        result({ candidate: "parakeet", run: 2, text: "ignored" }),
        result({ candidate: "parakeet", voice: "Matthew", text: "ignored" }),
        result({ candidate: "parakeet", mode: "both", text: "ignored" }),
      ],
      ["turbo", "gpt", "parakeet"],
      checks,
    );
    expect(cases.map((item) => [item.raw, item.chain?.transcribers])).toEqual([
      ["Push the hot fix", ["turbo", "gpt"]],
      ["Push the hot fix.", ["parakeet"]],
    ]);
    expect(cases[0]).toMatchObject({
      language: "en",
      style: "plain",
      dictionary: "developer",
      expected: ["Push the hotfix.", "Push the hot fix."],
      terms: ["hotfix"],
      required: ["push"],
      forbidden: ["pull"],
      chain: { caseId: "dev-en-4" },
    });
    expect(cases[0]?.id).toMatch(/^chained-dev-en-4-[0-9a-f]{8}$/);
  });

  it("leaves out raws production would not refine: failed calls, empty text and dropped speech", () => {
    const cases = chainedCases(
      fixtures,
      [
        result({ ok: false, error: { message: "timeout" } }),
        result({ candidate: "gpt", text: "" }),
        result({ candidate: "parakeet", text: "Push the hot fix", levelDbfs: -60 }),
      ],
      ["turbo", "gpt", "parakeet"],
      checks,
    );
    expect(cases).toEqual([]);
  });

  it("refuses a missing run-1 result or a case without hand-written checks", () => {
    expect(() => chainedCases(fixtures, [], ["turbo"], checks)).toThrow(/no run-1 result/);
    expect(() => chainedCases(fixtures, [result({})], ["turbo"], {})).toThrow(
      /no hand-written checks for dev-en-4/,
    );
  });
});
