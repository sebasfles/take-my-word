import { describe, expect, it } from "vitest";
import { releaseLinks } from "./links.ts";

describe("releaseLinks", () => {
  it("points the source, the self-host guide and every desktop link at the configured repository", () => {
    expect(releaseLinks("someone/take-my-word")).toEqual({
      repository: "https://github.com/someone/take-my-word",
      selfHostGuide: "https://github.com/someone/take-my-word/tree/HEAD/self-host",
      license: "https://github.com/someone/take-my-word/blob/HEAD/LICENSE",
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
