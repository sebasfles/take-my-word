import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compareVersions, readVersions, versionProblem, writeVersion } from "./version.ts";

const desktop = join(import.meta.dirname, "..");
const files = ["package.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock"];

let dir: string;

function changedLines(file: string): string[] {
  const before = readFileSync(join(desktop, file), "utf8").split("\n");
  const after = readFileSync(join(dir, file), "utf8").split("\n");
  expect(after).toHaveLength(before.length);
  return after.filter((line, index) => line !== before[index]);
}

describe("desktop version", () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "desktop-version-"));
    mkdirSync(join(dir, "src-tauri"));
    for (const file of files) copyFileSync(join(desktop, file), join(dir, file));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("is the same in package.json, Cargo.toml and Cargo.lock", () => {
    expect(versionProblem(readVersions(desktop))).toBeUndefined();
  });

  it("reports a Cargo.toml bumped without package.json", () => {
    const cargo = join(dir, "src-tauri/Cargo.toml");
    writeFileSync(
      cargo,
      readFileSync(cargo, "utf8").replace(/^version = ".*"$/m, 'version = "9.9.9"'),
    );
    expect(versionProblem(readVersions(dir))).toMatch(
      /^desktop versions differ: .*Cargo\.toml 9\.9\.9/,
    );
  });

  it("reports a tag that names another version", () => {
    const { cargoToml } = readVersions(dir);
    expect(versionProblem(readVersions(dir), `desktop-v${cargoToml}`)).toBeUndefined();
    expect(versionProblem(readVersions(dir), "desktop-v9.9.9")).toBe(
      `tag desktop-v9.9.9 does not match the desktop version ${cargoToml}`,
    );
  });

  it("bumps the three files and touches only the app's own version lines", () => {
    writeVersion(dir, "3.4.5-rc.1");
    expect(readVersions(dir)).toEqual({
      packageJson: "3.4.5-rc.1",
      cargoToml: "3.4.5-rc.1",
      cargoLock: "3.4.5-rc.1",
    });
    for (const file of files) expect(changedLines(file)).toHaveLength(1);
  });

  it("refuses a version that is not semantic", () => {
    expect(() => writeVersion(dir, "1.2")).toThrow("1.2 is not a semantic version");
  });

  it("orders versions by semver precedence, prereleases included", () => {
    const ascending = [
      "0.0.9",
      "0.1.0-alpha",
      "0.1.0-alpha.1",
      "0.1.0-alpha.beta",
      "0.1.0-beta",
      "0.1.0-beta.2",
      "0.1.0-beta.11",
      "0.1.0-rc.1",
      "0.1.0",
      "0.1.1",
      "0.2.0",
      "0.10.0",
      "1.0.0",
    ];
    for (const [index, lower] of ascending.entries()) {
      for (const higher of ascending.slice(index + 1)) {
        expect(compareVersions(lower, higher)).toBe(-1);
        expect(compareVersions(higher, lower)).toBe(1);
      }
      expect(compareVersions(lower, lower)).toBe(0);
    }
  });
});
