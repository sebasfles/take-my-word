import { describe, expect, it } from "vitest";
import { desktopReleaseManifestSchema } from "./releases.ts";

describe("desktopReleaseManifestSchema", () => {
  it("reads the version of the updater manifest and ignores the rest", () => {
    const manifest = desktopReleaseManifestSchema.parse({
      version: "0.1.1",
      notes: "Asks before updating.",
      platforms: { "windows-x86_64": { signature: "s", url: "u" } },
    });
    expect(manifest).toEqual({ version: "0.1.1" });
  });

  it.each([{}, { version: "v0.1.1" }, { version: "0.1" }, { version: "<script>" }])(
    "rejects %j",
    (value) => {
      expect(desktopReleaseManifestSchema.safeParse(value).success).toBe(false);
    },
  );
});
