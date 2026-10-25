import { describe, expect, it } from "vitest";
import {
  dictationMetaSchema,
  earlierSegmentsSchema,
  segmentMetaSchema,
  segmentResponseSchema,
} from "./dictations.ts";

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

describe("segments", () => {
  it("lets a final carry the language detected on the first segment", () => {
    expect(dictationMetaSchema.parse({ appId: "notepad.exe", language: "es" })).toEqual({
      appId: "notepad.exe",
      language: "es",
    });
    expect(dictationMetaSchema.safeParse({ language: "fr" }).success).toBe(false);
  });

  it("refuses an empty list of earlier segments and one without its receipt", () => {
    expect(earlierSegmentsSchema.safeParse([]).success).toBe(false);
    expect(earlierSegmentsSchema.safeParse([{ text: "hola" }]).success).toBe(false);
    expect(earlierSegmentsSchema.safeParse([{ text: "", receipt: "r" }]).success).toBe(true);
  });

  it("answers a silent segment without a receipt", () => {
    const silent = { raw: "", skipped: "silence", providers: {}, latencyMs: { total: 3 } };
    expect(segmentResponseSchema.parse(silent)).toEqual(silent);
    expect(segmentMetaSchema.safeParse({ language: "en", appId: "x" }).data).toEqual({
      language: "en",
    });
  });
});
