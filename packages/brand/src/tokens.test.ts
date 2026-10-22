import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrast } from "./color.ts";
import { pairs } from "./contrast.ts";
import { tokensCss } from "./css.ts";
import { tokens } from "./tokens.ts";

describe("tokens", () => {
  it("ship as the CSS the generator produces", () => {
    const committed = readFileSync(join(import.meta.dirname, "tokens.css"), "utf8");
    expect(committed).toBe(tokensCss(tokens, ":root"));
  });

  it.each(["light", "dark"] as const)("meet WCAG AA on every %s pair", (theme) => {
    const colors = tokens[theme].colors;
    const failing = pairs
      .map((pair) => ({
        ...pair,
        ratio: contrast(colors[pair.foreground], colors[pair.background]),
      }))
      .filter((pair) => pair.ratio < pair.minimum)
      .map((pair) => `${pair.foreground} on ${pair.background}: ${pair.ratio.toFixed(2)}`);
    expect(failing).toEqual([]);
  });
});
