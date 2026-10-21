import { describe, expect, it } from "vitest";
import { appRuleInputSchema } from "./app-rules.ts";
import { dictationMetaSchema } from "./dictations.ts";
import { dictionaryTermInputSchema, normalizeTerm } from "./dictionary.ts";

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
