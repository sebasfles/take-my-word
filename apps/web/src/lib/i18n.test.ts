import { describe, expect, it } from "vitest";
import { format, localeFrom } from "./i18n.ts";

describe("localeFrom", () => {
  it("defaults to Spanish and switches to English only from the cookie", () => {
    expect(localeFrom(undefined)).toBe("es");
    expect(localeFrom("en")).toBe("en");
    expect(localeFrom("es")).toBe("es");
    expect(localeFrom("fr")).toBe("es");
    expect(localeFrom("EN")).toBe("es");
  });
});

describe("format", () => {
  it("fills named placeholders and leaves unknown ones visible", () => {
    expect(format("Hola, {username} {missing}", { username: "ana" })).toBe("Hola, ana {missing}");
  });
});
