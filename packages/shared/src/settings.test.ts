import { describe, expect, it } from "vitest";
import { localeFor, settingsSchema, settingsUpdateSchema } from "./settings.ts";

const settings = {
  defaultStyleId: "plain",
  locale: "es-CL",
  dictationLanguages: ["es"],
  providers: { transcriber: "groq-whisper", refiner: "openai" },
  context: { picks: [], detail: "" },
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
    expect(settingsUpdateSchema.parse(older)).not.toHaveProperty("context");
    expect(settingsUpdateSchema.parse(older)).toEqual(older);
    expect(settingsSchema.safeParse(older).success).toBe(false);
  });

  it("takes up to three distinct picks and a trimmed detail of at most 200 characters", () => {
    const withContext = (context: unknown) => settingsSchema.safeParse({ ...settings, context });
    expect(
      withContext({ picks: ["software-development", "law", "student"], detail: "" }).success,
    ).toBe(true);
    expect(
      withContext({ picks: ["software-development", "law", "student", "design"], detail: "" })
        .success,
    ).toBe(false);
    expect(withContext({ picks: ["law", "law"], detail: "" }).success).toBe(false);
    expect(withContext({ picks: ["astrology"], detail: "" }).success).toBe(false);
    expect(withContext({ picks: [], detail: "x".repeat(201) }).success).toBe(false);
    expect(
      settingsSchema.parse({
        ...settings,
        context: { picks: [], detail: `  ${"x".repeat(200)}  ` },
      }).context.detail,
    ).toBe("x".repeat(200));
    expect(withContext(undefined).success).toBe(false);
  });

  it("derives the locale from the first dictation language, keeping a stored region", () => {
    expect(localeFor(["es", "en"], "es-CL")).toBe("es-CL");
    expect(localeFor(["en"], "es-CL")).toBe("en");
    expect(localeFor(["en", "es"])).toBe("en");
  });
});
