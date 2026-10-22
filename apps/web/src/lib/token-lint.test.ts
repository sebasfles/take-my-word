import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cssViolations,
  missingCustomProperties,
  sourceFiles as files,
  tsxViolations,
} from "@take-my-word/brand/token-lint.ts";

const src = join(import.meta.dirname, "..");

describe("apps/web", () => {
  it.each(files(src, ".css").map((path) => relative(src, path)))(
    "%s takes every color, font, size and spacing from the brand tokens",
    (path) => {
      expect(cssViolations(readFileSync(join(src, path), "utf8"))).toEqual([]);
    },
  );

  it.each(files(src, ".tsx").map((path) => relative(src, path)))(
    "%s has no hard-coded colors, fonts or lengths",
    (path) => {
      expect(tsxViolations(readFileSync(join(src, path), "utf8"))).toEqual([]);
    },
  );
});

describe("custom properties", () => {
  it("used by apps/web all exist in the brand tokens or in the web styles", () => {
    const css = files(src, ".css").map((path) => readFileSync(path, "utf8"));
    const tsx = files(src, ".tsx").map((path) => readFileSync(path, "utf8"));
    expect(missingCustomProperties({ css, tsx })).toEqual([]);
  });
});
