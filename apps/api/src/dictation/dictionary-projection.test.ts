import { describe, expect, it } from "vitest";
import {
  estimateTokens,
  promptWithPreviousText,
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

describe("promptWithPreviousText", () => {
  it("keeps the terms and fills what is left of the budget with whole words from the tail", () => {
    expect(promptWithPreviousText("Kubernetes, Groq", "uno dos tres cuatro", 30)).toEqual({
      prompt: "Kubernetes, Groq. tres cuatro",
      tailBytes: 11,
    });
  });

  it("uses the whole previous text when it fits and nothing when the terms fill the budget", () => {
    expect(promptWithPreviousText("", "  hola   mundo ", 224)).toEqual({
      prompt: "hola mundo",
      tailBytes: 10,
    });
    expect(promptWithPreviousText("x".repeat(222), "hola", 224)).toEqual({
      prompt: "x".repeat(222),
      tailBytes: 0,
    });
  });

  it("never splits an accented letter or exceeds the budget", () => {
    const { prompt } = promptWithPreviousText("", "canción ".repeat(60), 224);
    expect(estimateTokens(prompt)).toBeLessThanOrEqual(224);
    expect(prompt.startsWith("canción")).toBe(true);
  });
});
