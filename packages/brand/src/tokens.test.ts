import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrast } from "./color.ts";
import { pairs } from "./contrast.ts";
import { tokensCss } from "./css.ts";
import { directions } from "./directions/index.ts";

describe.each(directions)("direction $id", (direction) => {
  it("ships the CSS the generator produces from its tokens", () => {
    const committed = readFileSync(
      join(import.meta.dirname, "directions", direction.id, "tokens.css"),
      "utf8",
    );
    expect(committed).toBe(tokensCss(direction.tokens, `[data-direction="${direction.id}"]`));
  });

  it.each(["light", "dark"] as const)("meets WCAG AA on every %s text pair", (theme) => {
    const colors = direction.tokens[theme].colors;
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
