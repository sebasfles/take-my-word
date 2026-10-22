import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cssViolations,
  missingCustomProperties,
  sourceFiles,
  tsxViolations,
} from "@take-my-word/brand/token-lint.ts";

const src = import.meta.dirname;
const pendingRestyle = new Set(["styles/legacy.css"]);
const files = (extension: string) =>
  sourceFiles(src, extension).filter((path) => !pendingRestyle.has(relative(src, path)));

describe("apps/desktop", () => {
  it.each(files(".css").map((path) => relative(src, path)))(
    "%s takes every color, font, size and spacing from the brand tokens",
    (path) => {
      expect(cssViolations(readFileSync(join(src, path), "utf8"))).toEqual([]);
    },
  );

  it.each(files(".tsx").map((path) => relative(src, path)))(
    "%s has no hard-coded colors, fonts or lengths",
    (path) => {
      expect(tsxViolations(readFileSync(join(src, path), "utf8"))).toEqual([]);
    },
  );

  it("uses only custom properties the brand or its own styles define", () => {
    const css = sourceFiles(src, ".css").map((path) => readFileSync(path, "utf8"));
    const tsx = sourceFiles(src, ".tsx").map((path) => readFileSync(path, "utf8"));
    expect(missingCustomProperties({ css, tsx })).toEqual([]);
  });
});
