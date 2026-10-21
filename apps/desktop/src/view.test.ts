import { describe, expect, it } from "vitest";
import { viewFromSearch } from "./view.ts";

describe("viewFromSearch", () => {
  it("reads the view the shell asked for", () => {
    expect(viewFromSearch("?view=overlay")).toBe("overlay");
    expect(viewFromSearch("?view=first-run")).toBe("first-run");
  });

  it("falls back to settings for unknown or missing views", () => {
    expect(viewFromSearch("?view=nope")).toBe("settings");
    expect(viewFromSearch("")).toBe("settings");
  });
});
