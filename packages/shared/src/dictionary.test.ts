import { describe, expect, it } from "vitest";
import { appRuleInputSchema } from "./app-rules.ts";
import { dictationMetaSchema } from "./dictations.ts";
import {
  decayedScore,
  dictionaryTermInputSchema,
  normalizeTerm,
  rankTerms,
  type RankableTerm,
} from "./dictionary.ts";

describe("normalizeTerm", () => {
  it.each([
    ["Kubernetes", "kubernetes"],
    ["KUBÉRNETES", "kubernetes"],
    ["  Visual   Studio\n", "visual studio"],
    ["Ñandú", "nandu"],
    ["Raúl", "raul"],
    ["C#", "c#"],
  ])("folds %j to %j", (input, output) => {
    expect(normalizeTerm(input)).toBe(output);
  });
});

describe("dictionaryTermInputSchema", () => {
  it("trims and collapses spaces, defaults aliases and enforces the limits", () => {
    expect(dictionaryTermInputSchema.parse({ term: "  Visual  Studio " })).toEqual({
      term: "Visual Studio",
      aliases: [],
    });
    expect(dictionaryTermInputSchema.safeParse({ term: "   " }).success).toBe(false);
    expect(dictionaryTermInputSchema.safeParse({ term: "x".repeat(65) }).success).toBe(false);
    const aliases = Array.from({ length: 11 }, (_, index) => `a${String(index)}`);
    expect(dictionaryTermInputSchema.safeParse({ term: "t", aliases }).success).toBe(false);
  });
});

describe("app ids", () => {
  it("are lowercased in rules and in dictation meta alike", () => {
    expect(appRuleInputSchema.parse({ appId: " Notepad.EXE ", keystroke: "ctrl+v" }).appId).toBe(
      "notepad.exe",
    );
    expect(dictationMetaSchema.parse({ locale: "es", appId: "Notepad.EXE" }).appId).toBe(
      "notepad.exe",
    );
  });
});

const now = new Date("2026-10-21T00:00:00.000Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
const term = (name: string, useCount: number, days: number): RankableTerm => ({
  term: name,
  useCount,
  lastUsedAt: daysAgo(days),
});

describe("decayedScore", () => {
  it("halves the use count every half-life since the last use, 30 days by default", () => {
    expect(decayedScore(term("a", 8, 0), now)).toBe(8);
    expect(decayedScore(term("a", 8, 30), now)).toBeCloseTo(4);
    expect(decayedScore(term("a", 8, 90), now, 30)).toBeCloseTo(1);
    expect(decayedScore(term("a", 8, 15), now, 15)).toBeCloseTo(4);
  });

  it("scores an unreadable date as zero and a future one as undecayed", () => {
    expect(decayedScore({ ...term("a", 5, 0), lastUsedAt: "" }, now)).toBe(0);
    expect(decayedScore(term("a", 5, -3), now)).toBe(5);
  });
});

describe("rankTerms", () => {
  it("puts a recently used term above a once popular one", () => {
    const ranked = rankTerms(
      [term("old", 40, 180), term("recent", 3, 1), term("never", 1, 400)],
      now,
    );
    expect(ranked.map((entry) => entry.term)).toEqual(["recent", "old", "never"]);
  });

  it("breaks score ties by the most recent use, then by the term", () => {
    const ranked = rankTerms(
      [term("beta", 0, 2), term("alpha", 0, 2), term("gamma", 0, 1), term("delta", 2, 5)],
      now,
    );
    expect(ranked.map((entry) => entry.term)).toEqual(["delta", "gamma", "alpha", "beta"]);
  });
});
