import { describe, expect, it } from "vitest";
import { tokensCss } from "./css.ts";
import { tokens } from "./directions/a/tokens.ts";

const css = tokensCss(tokens, ":root");

describe("tokensCss", () => {
  it("follows the system scheme unless a theme is forced", () => {
    expect(css).toContain(
      `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {`,
    );
    expect(css).toContain(`:root[data-theme="dark"] {\n  color-scheme: dark;`);
  });

  it("names every token as a kebab-case custom property", () => {
    expect(css).toContain(`  --color-border-strong: ${tokens.light.colors.borderStrong};`);
    expect(css).toContain(`  --accent-500: ${tokens.accent["500"]};`);
    expect(css).toContain(`  --text-2xl: ${tokens.text["2xl"]};`);
  });

  it("keeps the dark values out of the light block", () => {
    const light = css.slice(0, css.indexOf("@media"));
    expect(light).toContain(tokens.light.colors.bg);
    expect(light).not.toContain(tokens.dark.colors.bg);
  });
});
