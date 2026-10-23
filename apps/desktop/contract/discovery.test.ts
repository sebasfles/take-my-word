import { readFileSync } from "node:fs";
import { join } from "node:path";
import { discoverySchema } from "@take-my-word/shared";
import { describe, expect, it } from "vitest";

interface Vector {
  why: string;
  set?: Record<string, unknown>;
  remove?: string[];
}

const vectors = JSON.parse(
  readFileSync(join(import.meta.dirname, "../src-tauri/src/discovery_vectors.json"), "utf8"),
) as { base: Record<string, unknown>; accepted: Vector[]; refused: Vector[] };

function documentOf(vector: Vector): Record<string, unknown> {
  const removed = new Set(vector.remove);
  return Object.fromEntries(
    Object.entries({ ...vectors.base, ...vector.set }).filter(([key]) => !removed.has(key)),
  );
}

describe("the discovery vectors the Rust validator is tested against", () => {
  it.each(vectors.accepted)("discoverySchema accepts $why", (vector) => {
    expect(discoverySchema.safeParse(documentOf(vector)).success).toBe(true);
  });

  it.each(vectors.refused)("discoverySchema refuses $why", (vector) => {
    expect(discoverySchema.safeParse(documentOf(vector)).success).toBe(false);
  });
});
