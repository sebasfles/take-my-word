import { describe, expect, it } from "vitest";
import { settingsFrom } from "./defaults.ts";

const providers = { transcriber: "groq-whisper", refiner: "openai" };

describe("settingsFrom", () => {
  it("reads an item saved before dictation languages as the language of its locale", () => {
    expect(settingsFrom({ defaultStyleId: "formal", locale: "es-CL", providers })).toEqual({
      defaultStyleId: "formal",
      locale: "es-CL",
      dictationLanguages: ["es"],
      context: { picks: [], detail: "" },
    });
    expect(settingsFrom({ defaultStyleId: "plain", locale: "en", providers })).toMatchObject({
      dictationLanguages: ["en"],
    });
  });

  it("keeps stored languages and derives the locale from the first one", () => {
    expect(
      settingsFrom({
        defaultStyleId: "plain",
        locale: "es",
        dictationLanguages: ["en", "es"],
        providers,
      }),
    ).toMatchObject({ locale: "en", dictationLanguages: ["en", "es"] });
  });

  it("keeps a stored context and falls back per field when one no longer parses", () => {
    const base = { defaultStyleId: "plain", locale: "en", providers };
    expect(
      settingsFrom({ ...base, context: { picks: ["law", "student"], detail: "contracts" } })
        .context,
    ).toEqual({ picks: ["law", "student"], detail: "contracts" });
    expect(
      settingsFrom({ ...base, context: { picks: ["retired-pick"], detail: "contracts" } }).context,
    ).toEqual({ picks: [], detail: "contracts" });
    expect(
      settingsFrom({ ...base, context: { picks: ["law"], detail: "x".repeat(201) } }).context,
    ).toEqual({ picks: ["law"], detail: "" });
    expect(settingsFrom({ ...base, context: "garbage" }).context).toEqual({
      picks: [],
      detail: "",
    });
  });

  it("falls back to English when neither languages nor a locale were stored", () => {
    expect(settingsFrom({ defaultStyleId: "plain", providers })).toMatchObject({
      locale: "en",
      dictationLanguages: ["en"],
    });
  });
});
