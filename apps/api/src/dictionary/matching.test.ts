import { describe, expect, it } from "vitest";
import { termsIn } from "./matching.ts";

const term = (name: string, aliases: string[] = []) => ({
  key: name.toLowerCase(),
  term: name,
  aliases,
});

describe("termsIn", () => {
  it("finds a term in any case or accent and through its aliases", () => {
    const terms = [term("Kubernetes", ["cubernetes"]), term("Raúl"), term("Groq")];
    expect(termsIn("Desplegamos en KUBERNETES con raul.", terms).map((t) => t.term)).toEqual([
      "Kubernetes",
      "Raúl",
    ]);
    expect(termsIn("lo subí a cubernetes", terms).map((t) => t.term)).toEqual(["Kubernetes"]);
  });

  it("matches whole words only, with Unicode letters as word characters", () => {
    const terms = [term("Ana"), term("Bj"), term("node.js"), term("C++")];
    expect(termsIn("Anabel dijo que Bjørn usa nodexjs", terms)).toEqual([]);
    expect(termsIn("Ana, ¿usas node.js o C++?", terms).map((t) => t.term)).toEqual([
      "Ana",
      "node.js",
      "C++",
    ]);
  });

  it("matches multi-word terms across extra spaces and line breaks", () => {
    expect(termsIn("abre Visual\n  Studio ya", [term("Visual Studio")])).toHaveLength(1);
  });

  it("counts a term once however often it appears", () => {
    expect(termsIn("Groq, groq y GROQ", [term("Groq", ["grok"])])).toHaveLength(1);
  });
});
