import { describe, expect, it } from "vitest";
import { settingsFrom } from "./defaults.ts";

const providers = { transcriber: "groq-whisper", refiner: "openai" };

describe("settingsFrom", () => {
  it("reads an item saved before dictation languages as the language of its locale", () => {
    expect(settingsFrom({ defaultStyleId: "formal", locale: "es-CL", providers })).toEqual({
      defaultStyleId: "formal",
      locale: "es-CL",
      dictationLanguages: ["es"],
      providers,
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

  it("falls back to English when neither languages nor a locale were stored", () => {
    expect(settingsFrom({ defaultStyleId: "plain", providers })).toMatchObject({
      locale: "en",
      dictationLanguages: ["en"],
    });
  });
});
