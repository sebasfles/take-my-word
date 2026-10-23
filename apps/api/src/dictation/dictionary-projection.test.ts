import { describe, expect, it } from "vitest";
import {
  estimateTokens,
  transcriberPrompt,
  withHint,
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

describe("withHint", () => {
  it("adds the hint only when it fits whole in the budget, counting bytes", () => {
    expect(withHint("Kubernetes", "Diseño", 20)).toBe("Kubernetes. Diseño");
    expect(estimateTokens("Kubernetes. Diseño")).toBe(19);
    expect(withHint("Kubernetes", "Diseño", 18)).toBe("Kubernetes");
    expect(withHint("", "Law", 3)).toBe("Law");
    expect(withHint("Kubernetes", "", 224)).toBe("Kubernetes");
  });
});
