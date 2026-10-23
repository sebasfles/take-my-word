import { describe, expect, it } from "vitest";
import { changesFrom } from "./wordDiff.ts";

describe("changesFrom", () => {
  it("marks only the words the style changed, keeping the text whole", () => {
    const pieces = changesFrom("um hi Marta, so thanks", "Hi Marta, thank you.");
    expect(pieces.map((piece) => piece.text).join("")).toBe("Hi Marta, thank you.");
    expect(pieces).toEqual([
      { text: "Hi ", changed: true },
      { text: "Marta, ", changed: false },
      { text: "thank you.", changed: true },
    ]);
  });

  it("treats curly and straight apostrophes and quotes as the same word", () => {
    expect(changesFrom("I can't say “hi”", 'I can’t say "hi"')).toEqual([
      { text: 'I can’t say "hi"', changed: false },
    ]);
  });
});
