import { describe, expect, it } from "vitest";
import { localeFor, settingsSchema, settingsUpdateSchema } from "./settings.ts";

const settings = {
  defaultStyleId: "plain",
  locale: "es-CL",
  dictationLanguages: ["es"],
  providers: { transcriber: "groq-whisper", refiner: "openai" },
};

describe("settings", () => {
  it("takes one or both dictation languages, each once", () => {
    expect(
      settingsSchema.safeParse({ ...settings, dictationLanguages: ["en", "es"] }).success,
    ).toBe(true);
    expect(settingsSchema.safeParse({ ...settings, dictationLanguages: [] }).success).toBe(false);
    expect(
      settingsSchema.safeParse({ ...settings, dictationLanguages: ["es", "es"] }).success,
    ).toBe(false);
    expect(settingsSchema.safeParse({ ...settings, dictationLanguages: ["fr"] }).success).toBe(
      false,
    );
  });

  it("lets an update leave out the languages and the locale, as older clients do", () => {
    const older = { defaultStyleId: settings.defaultStyleId, providers: settings.providers };
    expect(settingsUpdateSchema.parse(older)).toEqual(older);
    expect(settingsSchema.safeParse(older).success).toBe(false);
  });

  it("derives the locale from the first dictation language, keeping a stored region", () => {
    expect(localeFor(["es", "en"], "es-CL")).toBe("es-CL");
    expect(localeFor(["en"], "es-CL")).toBe("en");
    expect(localeFor(["en", "es"])).toBe("en");
  });
});
