import { describe, expect, it } from "vitest";
import { tokens } from "@take-my-word/brand";
import { themeAttribute, themeColor, themeFrom } from "./theme.ts";

describe("themeFrom", () => {
  it("follows the system unless the cookie forces a theme", () => {
    expect(themeFrom(undefined)).toBe("system");
    expect(themeFrom("dark")).toBe("dark");
    expect(themeFrom("light")).toBe("light");
    expect(themeFrom("sepia")).toBe("system");
  });
});

describe("themeAttribute", () => {
  it("leaves <html> unmarked for the system theme so the media query decides", () => {
    expect(themeAttribute("system")).toBeUndefined();
    expect(themeAttribute("dark")).toBe("dark");
  });
});

describe("themeColor", () => {
  it("paints the browser chrome with the forced theme, whatever the system says", () => {
    expect(themeColor("dark")).toBe(tokens.dark.colors.bg);
    expect(themeColor("light")).toBe(tokens.light.colors.bg);
  });

  it("follows the system with one color per scheme", () => {
    expect(themeColor("system")).toEqual([
      { media: "(prefers-color-scheme: light)", color: tokens.light.colors.bg },
      { media: "(prefers-color-scheme: dark)", color: tokens.dark.colors.bg },
    ]);
  });
});
