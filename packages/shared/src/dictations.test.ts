import { describe, expect, it } from "vitest";
import { dictationMetaSchema } from "./dictations.ts";

describe("dictationMetaSchema", () => {
  it("accepts a locale alone and leaves providers to the server defaults", () => {
    expect(dictationMetaSchema.parse({ locale: "es-CO" })).toEqual({ locale: "es-CO" });
  });

  it("accepts the phase 3 fields so clients can send them early", () => {
    const meta = { locale: "en", styleId: "plain", appId: "com.slack" };
    expect(dictationMetaSchema.parse(meta)).toEqual(meta);
  });

  it.each([
    { locale: "fr" },
    { locale: "es_CO" },
    {},
    { locale: "es", sttProvider: "aws-transcribe" },
    { locale: "es", refineProvider: "bedrock-claude" },
  ])("rejects %j", (meta) => {
    expect(dictationMetaSchema.safeParse(meta).success).toBe(false);
  });
});
