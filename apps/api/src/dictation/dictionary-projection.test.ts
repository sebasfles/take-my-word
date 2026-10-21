import { describe, expect, it } from "vitest";
import {
  decayedScore,
  estimateTokens,
  rankTerms,
  transcriberPrompt,
  type ProjectedTerm,
} from "./dictionary-projection.ts";

const now = new Date("2026-10-21T00:00:00.000Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
const term = (name: string, useCount: number, days: number): ProjectedTerm => ({
  term: name,
  aliases: [],
  useCount,
  lastUsedAt: daysAgo(days),
});

describe("decayedScore", () => {
  it("halves the use count every half-life since the last use", () => {
    expect(decayedScore(term("a", 8, 0), now, 30)).toBe(8);
    expect(decayedScore(term("a", 8, 30), now, 30)).toBeCloseTo(4);
    expect(decayedScore(term("a", 8, 90), now, 30)).toBeCloseTo(1);
    expect(decayedScore(term("a", 8, 15), now, 15)).toBeCloseTo(4);
  });

  it("scores an unreadable date as zero and a future one as undecayed", () => {
    expect(decayedScore({ ...term("a", 5, 0), lastUsedAt: "" }, now, 30)).toBe(0);
    expect(decayedScore(term("a", 5, -3), now, 30)).toBe(5);
  });
});

describe("rankTerms", () => {
  it("puts a recently used term above a once popular one", () => {
    const ranked = rankTerms(
      [term("old", 40, 180), term("recent", 3, 1), term("never", 1, 400)],
      now,
      30,
    );
    expect(ranked.map((entry) => entry.term)).toEqual(["recent", "old", "never"]);
  });
});

describe("transcriberPrompt", () => {
  it("joins the top terms within the budget and skips one that does not fit", () => {
    const terms = [term("Kubernetes", 9, 0), term("x".repeat(30), 8, 0), term("Groq", 7, 0)];
    expect(transcriberPrompt(terms, { now, halfLifeDays: 30, tokenBudget: 20 })).toEqual({
      prompt: "Kubernetes, Groq",
      terms: 2,
    });
  });

  it("never exceeds the budget, counting accented letters as more than one token", () => {
    const terms = Array.from({ length: 200 }, (_, index) =>
      term(`término ${String(index)}`, 1, index),
    );
    const { prompt, terms: included } = transcriberPrompt(terms, {
      now,
      halfLifeDays: 30,
      tokenBudget: 224,
    });
    expect(estimateTokens(prompt)).toBeLessThanOrEqual(224);
    expect(estimateTokens("término")).toBe(8);
    expect(included).toBeGreaterThan(10);
    expect(prompt.startsWith("término 0, término 1,")).toBe(true);
  });

  it("is empty without terms", () => {
    expect(transcriberPrompt([], { now, halfLifeDays: 30, tokenBudget: 224 })).toEqual({
      prompt: "",
      terms: 0,
    });
  });
});
