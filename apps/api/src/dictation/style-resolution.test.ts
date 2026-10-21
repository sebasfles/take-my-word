import { describe, expect, it } from "vitest";
import { builtinStyles } from "../styles/builtin/index.ts";
import { resolveStyle } from "./style-resolution.ts";

const custom = [{ id: "mine", prompt: "My tone." }];

describe("resolveStyle", () => {
  it("prefers the request, then the app rule, then the default, then plain", () => {
    const all = { requested: "casual", rule: "formal", defaultStyleId: "mine", custom };
    expect(resolveStyle(all).id).toBe("casual");
    expect(resolveStyle({ ...all, requested: undefined }).id).toBe("formal");
    expect(resolveStyle({ ...all, requested: undefined, rule: undefined })).toEqual({
      id: "mine",
      prompt: "My tone.",
    });
    expect(resolveStyle({ custom })).toEqual({ id: "plain", prompt: builtinStyles.plain.prompt });
  });

  it("falls through an unknown or deleted id instead of failing", () => {
    expect(
      resolveStyle({ requested: "deleted", rule: "gone", defaultStyleId: "formal", custom }).id,
    ).toBe("formal");
    expect(resolveStyle({ requested: "deleted", defaultStyleId: "also-deleted", custom }).id).toBe(
      "plain",
    );
  });

  it("gives the built-in prompt for a built-in id", () => {
    expect(resolveStyle({ requested: "formal", custom }).prompt).toBe(builtinStyles.formal.prompt);
  });
});
