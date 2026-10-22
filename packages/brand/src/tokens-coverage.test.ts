import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tokensCss } from "./css.ts";
import { tokens } from "./tokens.ts";

const consumers = [import.meta.dirname];

function files(dir: string, extension: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path, extension);
    return entry.name.endsWith(extension) ? [path] : [];
  });
}

const read = (extension: string) =>
  consumers.flatMap((dir) => files(dir, extension)).map((path) => readFileSync(path, "utf8"));

describe("custom properties", () => {
  it("are all defined by the tokens or by the component that uses them", () => {
    const defined = new Set(
      [...tokensCss(tokens, ":root").matchAll(/--([\w-]+):/g)].map((match) => match[1]),
    );
    const sources = read(".css");
    for (const source of sources) {
      for (const match of source.matchAll(/--([\w-]+)\s*:/g)) defined.add(match[1]);
    }
    for (const source of read(".tsx")) {
      for (const match of source.matchAll(/"--([\w-]+)"/g)) defined.add(match[1]);
    }
    const undefinedReferences = new Set(
      sources.flatMap((source) =>
        [...source.matchAll(/var\(--([\w-]+)\s*(,)?/g)]
          .filter((match) => match[2] === undefined && !defined.has(match[1]))
          .map((match) => match[1]),
      ),
    );
    expect([...undefinedReferences]).toEqual([]);
  });
});
