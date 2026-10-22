import { describe, expect, it } from "vitest";
import { demoScripts, dictionary, format } from "./i18n.ts";

function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shape(inner)]));
  }
  return typeof value;
}

describe("dictionaries", () => {
  it("keep English and Spanish complete with the same keys", () => {
    expect(shape(dictionary("es"))).toEqual(shape(dictionary("en")));
  });

  it("speak the language they are for", () => {
    expect(dictionary("en").landing.tagline).toBe("Your Word, Our Command.");
    expect(dictionary("es").landing.tagline).toBe("Tu palabra, nuestra orden.");
  });
});

describe("demoScripts", () => {
  it("leads with the page language and shows the other one as the bilingual example", () => {
    expect(demoScripts("en").primary.written).toMatch(/^Tomorrow at ten/);
    expect(demoScripts("en").other.written).toMatch(/^Mañana a las diez/);
    expect(demoScripts("es").primary.written).toMatch(/^Mañana a las diez/);
  });

  it("strikes only what the cleanup removes or fixes", () => {
    for (const script of Object.values(demoScripts("en"))) {
      const kept = script.spoken
        .flat()
        .filter((segment) => segment.kind === undefined)
        .map((segment) => segment.text.trim().replace(/,$/, ""))
        .filter(Boolean);
      for (const words of kept) expect(script.written.toLowerCase()).toContain(words.toLowerCase());
    }
  });
});

describe("format", () => {
  it("fills named placeholders and leaves unknown ones visible", () => {
    expect(format("Hola, {username} {missing}", { username: "ana" })).toBe("Hola, ana {missing}");
  });
});
