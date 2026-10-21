import { describe, expect, it } from "vitest";
import { findDirection, galleryEnabled } from "./gallery.ts";

describe("galleryEnabled", () => {
  it("stays off unless the screenshot script turns it on", () => {
    expect(galleryEnabled({})).toBe(false);
    expect(galleryEnabled({ TMW_GALLERY: "true" })).toBe(false);
    expect(galleryEnabled({ TMW_GALLERY: "0" })).toBe(false);
    expect(galleryEnabled({ TMW_GALLERY: "1" })).toBe(true);
  });
});

describe("findDirection", () => {
  it("finds only the directions the brand package ships", () => {
    expect(findDirection("b")?.id).toBe("b");
    expect(findDirection("d")).toBeUndefined();
    expect(findDirection("constructor")).toBeUndefined();
  });
});
