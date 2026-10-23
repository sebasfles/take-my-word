import { describe, expect, it } from "vitest";
import { viewFromSearch } from "./view.ts";

describe("viewFromSearch", () => {
  it("reads the view the shell asked for", () => {
    expect(viewFromSearch("?view=overlay")).toBe("overlay");
    expect(viewFromSearch("?view=update")).toBe("update");
  });

  it("falls back to the main window for unknown, retired or missing views", () => {
    expect(viewFromSearch("?view=nope")).toBe("main");
    expect(viewFromSearch("?view=first-run")).toBe("main");
    expect(viewFromSearch("")).toBe("main");
  });
});
