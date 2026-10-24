import { describe, expect, it } from "vitest";
import { dictationMetaSchema } from "./dictations.ts";

describe("dictationMetaSchema", () => {
  it("accepts a locale alone", () => {
    expect(dictationMetaSchema.parse({ locale: "es-CO" })).toEqual({ locale: "es-CO" });
  });

  it("accepts no locale, since the server picks the language from settings", () => {
    expect(dictationMetaSchema.parse({ appId: "notepad.exe" })).toEqual({ appId: "notepad.exe" });
    expect(dictationMetaSchema.parse({})).toEqual({});
  });

  it("accepts the phase 3 fields so clients can send them early", () => {
    const meta = { locale: "en", styleId: "plain", appId: "com.slack" };
    expect(dictationMetaSchema.parse(meta)).toEqual(meta);
  });

  it.each([
    { locale: "es", sttProvider: "groq-whisper", refineProvider: "openai" },
    { locale: "es", sttProvider: "aws-transcribe", refineProvider: "bedrock-claude" },
  ])("drops the provider fields released clients send, whatever they hold: %j", (meta) => {
    expect(dictationMetaSchema.parse(meta)).toEqual({ locale: "es" });
  });

  it.each([{ locale: "fr" }, { locale: "es_CO" }])("rejects %j", (meta) => {
    expect(dictationMetaSchema.safeParse(meta).success).toBe(false);
  });
});
