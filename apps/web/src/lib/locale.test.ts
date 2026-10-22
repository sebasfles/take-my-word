import { describe, expect, it } from "vitest";
import { localeFrom, preferredLocale } from "./locale.ts";

describe("preferredLocale", () => {
  it("serves English without a header", () => {
    expect(preferredLocale(undefined)).toBe("en");
    expect(preferredLocale(null)).toBe("en");
    expect(preferredLocale("")).toBe("en");
  });

  it("serves Spanish to a browser that asks for it in any region", () => {
    expect(preferredLocale("es")).toBe("es");
    expect(preferredLocale("es-MX,es;q=0.9")).toBe("es");
    expect(preferredLocale("ES-419")).toBe("es");
  });

  it("serves English to any other language", () => {
    expect(preferredLocale("fr-FR,fr;q=0.9,de;q=0.8")).toBe("en");
    expect(preferredLocale("pt-BR")).toBe("en");
  });

  it("follows the q-values between Spanish and English", () => {
    expect(preferredLocale("fr;q=1, en;q=0.5, es;q=0.8")).toBe("es");
    expect(preferredLocale("es;q=0.4, en-GB;q=0.7")).toBe("en");
    expect(preferredLocale("en-US,en;q=0.9,es;q=0.8")).toBe("en");
    expect(preferredLocale("es;q=0, en;q=0.1")).toBe("en");
  });

  it("keeps the first of two equal preferences", () => {
    expect(preferredLocale("es, en")).toBe("es");
    expect(preferredLocale("en;q=0.8, es;q=0.8")).toBe("en");
  });

  it("does not let a wildcard pick Spanish", () => {
    expect(preferredLocale("*")).toBe("en");
    expect(preferredLocale("fr, *;q=0.5")).toBe("en");
    expect(preferredLocale("*, es;q=0.5")).toBe("es");
  });

  it("ignores malformed entries and falls back to English", () => {
    expect(preferredLocale(";;;,,,")).toBe("en");
    expect(preferredLocale("es;q=high")).toBe("en");
    expect(preferredLocale("es;q=1.5")).toBe("en");
    expect(preferredLocale("es;q=-1, fr")).toBe("en");
    expect(preferredLocale("español")).toBe("en");
    expect(preferredLocale("es;q=garbage, es-MX;q=0.3")).toBe("es");
  });
});

describe("localeFrom", () => {
  it("lets the switch cookie override the header", () => {
    expect(localeFrom("en", "es-MX,es;q=0.9")).toBe("en");
    expect(localeFrom("es", "en-US")).toBe("es");
    expect(localeFrom("es", undefined)).toBe("es");
  });

  it("falls back to the header when the cookie is missing or unknown", () => {
    expect(localeFrom(undefined, "es-AR")).toBe("es");
    expect(localeFrom("fr", "es-AR")).toBe("es");
    expect(localeFrom("EN", "fr")).toBe("en");
    expect(localeFrom(undefined, undefined)).toBe("en");
  });
});
