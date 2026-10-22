import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tokensCss } from "./css.ts";
import { tokens } from "./tokens.ts";

const colorLiteral =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|\b(?:white|black|gr[ae]y|red|green|blue|orange|yellow|purple|pink|brown|navy|teal)\b/i;
const lengthLiteral =
  /(?<![\w-])-?\d*\.?\d+(?:(?:px|rem|em|vh|vw|svh|dvh|lvh|ch|ex|pt)(?![a-z])|%)/;
const durationLiteral = /(?<![\w-])\d*\.?\d+m?s\b/;

const spacing =
  /^(?:margin|padding|gap|row-gap|column-gap|inset|top|right|bottom|left|scroll-padding|scroll-margin)(?:-[a-z-]+)?$/;
const radius = /^border(?:-[a-z]+)*-radius$/;
const motion = /^(?:transition|animation)(?:-[a-z-]+)?$/;

const customLength = /(?<![\w-])-?\d*\.?\d+(?:px|rem|em|vh|vw|svh|dvh|lvh|ch|ex|pt)(?![a-z])/;
const varCall = /var\(\s*--[\w-]+\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g;

function withoutVars(value: string): string {
  let current = value;
  for (;;) {
    const next = current.replace(varCall, (_, fallback?: string) => fallback ?? "");
    if (next === current) return next;
    current = next;
  }
}

function customPropertyProblem(value: string): string | null {
  const bare = withoutVars(value);
  if (colorLiteral.test(bare)) return "color";
  if (customLength.test(bare)) return "length";
  if (durationLiteral.test(bare)) return "duration";
  return null;
}

export function cssViolations(css: string): string[] {
  const found: string[] = [];
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of source.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)) {
    const property = match[1] ?? "";
    const value = (match[2] ?? "").trim();
    if (property.startsWith("--")) {
      const problem = customPropertyProblem(value);
      if (problem !== null) found.push(`${problem}: ${property}: ${value}`);
      continue;
    }
    const bare = withoutVars(value);
    const problem = colorLiteral.test(bare)
      ? "color"
      : property === "font-family" && !/^(var\(--font-[\w-]+\)|inherit)$/.test(value)
        ? "font family"
        : property === "font" && value !== "inherit"
          ? "font shorthand"
          : property === "font-size" && !/^(var\(--text-[\w-]+\)|inherit)$/.test(value)
            ? "font size"
            : (spacing.test(property) || radius.test(property)) && lengthLiteral.test(bare)
              ? "length"
              : property === "box-shadow" && !/^(var\(--shadow-[\w-]+\)|none)$/.test(value)
                ? "shadow"
                : motion.test(property) && durationLiteral.test(bare)
                  ? "duration"
                  : null;
    if (problem !== null) found.push(`${problem}: ${property}: ${value}`);
  }
  return found;
}

export function tsxViolations(tsx: string): string[] {
  const found: string[] = [];
  for (const match of tsx.matchAll(/(["'`])((?:(?!\1)[^\\]|\\.)*)\1/g)) {
    const text = match[2] ?? "";
    if (/^#[0-9a-f]{3,8}$/i.test(text) || /\b(?:rgba?|hsla?|oklch)\(/.test(text)) {
      found.push(`color: ${text}`);
    }
  }
  for (const match of tsx.matchAll(/style=\{\{([^}]*)\}\}/g)) {
    const style = match[1] ?? "";
    if (lengthLiteral.test(style) || /\b\d+\s*[,}]/.test(style))
      found.push(`inline style: ${style}`);
  }
  for (const match of tsx.matchAll(/\b(fontFamily|fontSize)\s*[:=]/g)) {
    found.push(`font: ${match[1] ?? ""}`);
  }
  return found;
}

export function sourceFiles(dir: string, extension: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path, extension);
    return entry.name.endsWith(extension) ? [path] : [];
  });
}

const brandCss = ["ui/ui.css", "waveform.css"].map((path) =>
  readFileSync(join(import.meta.dirname, path), "utf8"),
);

export function missingCustomProperties({ css, tsx }: { css: string[]; tsx: string[] }): string[] {
  const defined = new Set(
    [tokensCss(tokens, ":root"), ...brandCss, ...css, ...tsx].flatMap((source) =>
      [...source.matchAll(/"?--([\w-]+)"?\s*:/g)].map((match) => match[1]),
    ),
  );
  return css.flatMap((source) =>
    [...source.matchAll(/var\(--([\w-]+)\s*(,)?/g)]
      .filter((match) => match[2] === undefined && !defined.has(match[1]))
      .map((match) => match[1] ?? ""),
  );
}
