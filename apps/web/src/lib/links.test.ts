import { describe, expect, it } from "vitest";
import { releaseLinks } from "./links.ts";

describe("releaseLinks", () => {
  it("points every desktop link at the configured repository's releases", () => {
    expect(releaseLinks("someone/take-my-word")).toEqual({
      releases: "https://github.com/someone/take-my-word/releases",
      windowsInstaller:
        "https://github.com/someone/take-my-word/releases/latest/download/take-my-word-windows-x64-setup.exe",
      latestManifest:
        "https://github.com/someone/take-my-word/releases/latest/download/latest.json",
    });
  });

  it.each([undefined, "", "take-my-word", "a/b/c", "evil.example/x?y", "owner/name#x"])(
    "fails the build for %j",
    (repository) => {
      expect(() => releaseLinks(repository)).toThrow(/RELEASES_REPOSITORY/);
    },
  );
});
