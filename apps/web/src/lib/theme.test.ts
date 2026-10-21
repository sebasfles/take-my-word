import { describe, expect, it } from "vitest";
import { themeAttribute, themeFrom } from "./theme.ts";

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
