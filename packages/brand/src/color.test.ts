import { describe, expect, it } from "vitest";
import { contrast, luminance } from "./color.ts";

describe("contrast", () => {
  it("matches the WCAG reference values", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(contrast("#ffffff", "#767676")).toBeCloseTo(4.54, 2);
  });

  it("does not depend on the order of the pair", () => {
    expect(contrast("#1f8e60", "#fbf6ee")).toBe(contrast("#fbf6ee", "#1f8e60"));
  });

  it("rejects anything that is not #rrggbb", () => {
    expect(() => luminance("rgb(0 0 0)")).toThrow();
    expect(() => luminance("#fff")).toThrow();
  });
});
