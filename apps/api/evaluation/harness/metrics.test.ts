import { describe, expect, it } from "vitest";
import {
  bestWordErrors,
  dominantLanguage,
  languageIssue,
  hallucinatedPhrases,
  missedTerms,
  percentile,
  sumDistribution,
  wordErrors,
  wordsOf,
} from "./metrics.ts";

describe("wordErrors", () => {
  it("counts substitutions, deletions and insertions over the reference words, ignoring case and punctuation", () => {
    expect(wordErrors("Run kubectl get pods.", "run cube control get pods")).toMatchObject({
      errors: 2,
      words: 4,
      substitutions: 1,
      insertions: 1,
      deletions: 0,
    });
    expect(wordErrors("¿Lo puedes revisar?", "Lo puedes revisar.").errors).toBe(0);
    expect(wordErrors("Send me the logs.", "Send the logs.")).toMatchObject({
      errors: 1,
      deletions: 1,
    });
  });

  it("splits hyphenated words, so hyphenation is formatting and not a recognition error", () => {
    expect(wordErrors("The CRISPR-Cas9 knockout.", "The CRISPR Cas9 knockout.").errors).toBe(0);
    expect(wordErrors("The CRISPR-Cas9 knockout.", "The crisper Cas9 knockout.").errors).toBe(1);
  });

  it("treats em and en dashes as separators and typographic hyphens as hyphens", () => {
    expect(wordsOf("The token expired\u2014the API token.")).toEqual([
      "the",
      "token",
      "expired",
      "the",
      "api",
      "token",
    ]);
    expect(wordErrors("Hagamos el standup.", "Hagamos el stand\u2011up.").errors).toBe(2);
    expect(wordErrors("Hagamos el stand-up.", "Hagamos el stand\u2011up.").errors).toBe(0);
  });

  it("keeps accents, so a missing tilde is an error", () => {
    expect(wordErrors("Está en verde.", "Esta en verde.").errors).toBe(1);
  });

  it("measures the longest run of inserted words, which flags invented content", () => {
    expect(
      wordErrors("Merge it today.", "Merge it today. Thanks for watching the video.")
        .longestInsertionRun,
    ).toBe(5);
    expect(wordErrors("Merge it today.", "Merge it now today.").longestInsertionRun).toBe(1);
  });

  it("takes the best of the expected text and its allowed variants", () => {
    const references = ["We waited forty-eight hours.", "We waited 48 hours."];
    expect(bestWordErrors(references, "We waited 48 hours.").errors).toBe(0);
    expect(bestWordErrors(references, "We waited forty eight hours.").errors).toBe(0);
    expect(bestWordErrors(references, "We waited forty hours.").errors).toBe(1);
  });
});

describe("missedTerms", () => {
  it("finds terms as whole words, case-insensitively unless exact", () => {
    const text = "Abrí un pr para el pipeline de CI/CD.";
    expect(missedTerms(text, ["PR", "CI/CD", "deploy", "pipe"])).toEqual(["deploy", "pipe"]);
    expect(missedTerms(text, ["PR"], { exact: true })).toEqual(["PR"]);
  });
});

describe("hallucinatedPhrases", () => {
  it("finds known silence hallucinations that the expected text does not contain", () => {
    expect(
      hallucinatedPhrases("Haz el merge. Gracias por ver el video.", ["Haz el merge."]),
    ).toEqual(["gracias por ver el video"]);
    expect(hallucinatedPhrases("Thanks for watching!", ["Thanks for watching!"])).toEqual([]);
  });
});

describe("dominantLanguage", () => {
  it("reads the language from its function words, mixed Spanish included", () => {
    expect(dominantLanguage("Mañana tengo un meeting con el team de marketing.")).toBe("es");
    expect(dominantLanguage("Tomorrow I have a meeting with the marketing team.")).toBe("en");
  });

  it("gives no verdict on too few function words", () => {
    expect(dominantLanguage("Kubectl pods.")).toBeUndefined();
  });
});

describe("languageIssue", () => {
  const cyrillic = "Завтра у меня встреча с командой маркетинга.";
  const portuguese = "Eu não sei se você vai conseguir fazer isso hoje com a equipe.";

  it("fails text in a non-Latin script and Latin text in a third language, which dominantLanguage misses", () => {
    expect(dominantLanguage(cyrillic)).toBeUndefined();
    expect(dominantLanguage(portuguese)).toBeUndefined();
    expect(languageIssue(cyrillic, "es")).toBe("non-Latin script (Завтр)");
    expect(languageIssue("Deploy 明天 the Lambda.", "en")).toMatch(/^non-Latin script/);
    expect(languageIssue(portuguese, "es")).toBe("reads as neither es nor en");
    expect(languageIssue("Domani ho una riunione con il team, ma non è ancora pronto.", "es")).toBe(
      "reads as neither es nor en",
    );
    expect(languageIssue("Je ne sais pas si nous avons le temps pour ça.", "en")).toBe(
      "reads as neither es nor en",
    );
  });

  it("still reports the other of es and en, and passes es, en, mixed and term-only text", () => {
    expect(languageIssue("Tomorrow I have a meeting with the marketing team.", "es")).toBe(
      "reads as en",
    );
    for (const [text, language] of [
      ["Mañana tengo un meeting con el team de marketing.", "es"],
      ["No sé si le dije a Ana que el deploy ya está.", "es"],
      ["Tomorrow I have a meeting with the marketing team.", "en"],
      ["Kubectl pods.", "en"],
      ["Árbol, café y pingüino.", "es"],
    ] as const) {
      expect(languageIssue(text, language)).toBeUndefined();
    }
  });
});

describe("percentile", () => {
  it("uses the nearest rank", () => {
    const values = [5, 1, 4, 2, 3, 6, 7, 8, 9, 10];
    expect(percentile(values, 50)).toBe(5);
    expect(percentile(values, 95)).toBe(10);
    expect(percentile([], 50)).toBeUndefined();
  });

  it("combines two stages over every pair of samples instead of adding percentiles", () => {
    const stage = [...Array.from({ length: 19 }, () => 100), 1000];
    const combined = sumDistribution(stage, stage);
    expect(combined).toHaveLength(400);
    expect(percentile(combined, 95)).toBe(1100);
    expect((percentile(stage, 95) ?? 0) * 2).toBe(200);
  });
});
