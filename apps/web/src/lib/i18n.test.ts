import { describe, expect, it } from "vitest";
import { dictionary, format, localeFrom } from "./i18n.ts";

describe("localeFrom", () => {
  it("defaults to Spanish and switches to English only from the cookie", () => {
    expect(localeFrom(undefined)).toBe("es");
    expect(localeFrom("en")).toBe("en");
    expect(localeFrom("es")).toBe("es");
    expect(localeFrom("fr")).toBe("es");
    expect(localeFrom("EN")).toBe("es");
  });

  it("serves different copy per language", () => {
    expect(dictionary("es").landing.download).not.toBe(dictionary("en").landing.download);
  });
});

describe("format", () => {
  it("fills named placeholders and leaves unknown ones visible", () => {
    expect(format("Hola, {username} {missing}", { username: "ana" })).toBe("Hola, ana {missing}");
  });
});
