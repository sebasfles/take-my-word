import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { tokens } from "@take-my-word/brand";
import { tokensCss } from "@take-my-word/brand/css.ts";
import { cssViolations, tsxViolations } from "./token-lint.ts";

const src = join(import.meta.dirname, "..");

function files(dir: string, extension: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path, extension);
    return entry.name.endsWith(extension) ? [path] : [];
  });
}

describe("cssViolations", () => {
  it.each([
    ["color: #c84b15;", "color"],
    ["background: rgb(0 0 0 / 0.4);", "color"],
    ["border: 1px solid white;", "color"],
    ["font-family: Georgia, serif;", "font family"],
    ["font: 16px/1.5 system-ui;", "font shorthand"],
    ["font-size: 18px;", "font size"],
    ["padding: 12px var(--space-4);", "length"],
    ["margin-top: 2rem;", "length"],
    ["gap: 0.5em;", "length"],
    ["inset: 10% auto;", "length"],
    ["border-top-left-radius: 6px;", "length"],
    ["box-shadow: 0 1px 2px var(--color-text);", "shadow"],
    ["transition: color 150ms ease;", "duration"],
    ["animation: spin 1s linear infinite;", "duration"],
    ["--gap: 12px;", "length"],
    ["--tint: #fff;", "color"],
    ["--shade: rgb(0 0 0);", "color"],
    ["--speed: 150ms;", "duration"],
    ["color: var(--x, #fff);", "color"],
    ["padding: var(--space-4, 12px);", "length"],
    ["margin: var(--a, var(--b, 1rem));", "length"],
    ["font-family: var(--font-text, Georgia);", "font family"],
  ])("rejects %s", (declaration, problem) => {
    expect(cssViolations(`.x { ${declaration} }`)[0]).toMatch(new RegExp(`^${problem}:`));
  });

  it("accepts tokens, keywords and breakpoints", () => {
    const css = `
      @media (min-width: 48rem) {
        .x {
          color: var(--color-text);
          margin: 0 auto;
          padding: calc(var(--space-3) * -1) var(--space-4);
          font: inherit;
          font-size: var(--text-sm);
          border-radius: var(--radius-full);
          box-shadow: none;
          transition: color var(--duration-fast) var(--ease-standard);
          border-color: currentColor;
          width: 100%;
          --skeleton-width: 40%;
          --inner: var(--space-4);
          gap: var(--inner, var(--space-2));
        }
      }`;
    expect(cssViolations(css)).toEqual([]);
  });
});

describe("tsxViolations", () => {
  it("catches literal colors, inline lengths and font overrides", () => {
    expect(tsxViolations(`<path fill="#fff" />`)).toEqual(["color: #fff"]);
    expect(tsxViolations(`<div style={{ padding: "12px" }} />`)).toHaveLength(1);
    expect(tsxViolations(`<p style={{ fontSize: 14 }} />`).length).toBeGreaterThan(0);
    expect(tsxViolations(`<a href="#how" className="x" />`)).toEqual([]);
  });
});

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
    const brandUi = readFileSync(
      join(src, "..", "..", "..", "packages", "brand", "src", "ui", "ui.css"),
      "utf8",
    );
    const defined = new Set(
      [tokensCss(tokens, ":root"), brandUi, ...css, ...tsx].flatMap((source) =>
        [...source.matchAll(/"?--([\w-]+)"?\s*:/g)].map((match) => match[1]),
      ),
    );
    const missing = css.flatMap((source) =>
      [...source.matchAll(/var\(--([\w-]+)\s*(,)?/g)]
        .filter((match) => match[2] === undefined && !defined.has(match[1]))
        .map((match) => match[1]),
    );
    expect(missing).toEqual([]);
  });
});
