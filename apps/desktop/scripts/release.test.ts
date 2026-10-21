import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = join(import.meta.dirname, "release.ts");
const env = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Release Test",
  GIT_AUTHOR_EMAIL: "release@test.invalid",
  GIT_COMMITTER_NAME: "Release Test",
  GIT_COMMITTER_EMAIL: "release@test.invalid",
};

let base: string;
let work: string;
let origin: string;

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, env, encoding: "utf8" }).trim();
}

function write(file: string, text: string) {
  mkdirSync(join(work, file, ".."), { recursive: true });
  writeFileSync(join(work, file), text);
}

function release(...args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { cwd: work, env, encoding: "utf8" });
}

function setUp(branch: string) {
  git(base, "init", "--quiet", "--bare", "origin.git");
  git(base, "init", "--quiet", "--initial-branch", branch, "work");
  write(
    "apps/desktop/package.json",
    `${JSON.stringify({ name: "@take-my-word/desktop", version: "0.1.0", private: true }, null, 2)}\n`,
  );
  write(
    "apps/desktop/src-tauri/Cargo.toml",
    '[package]\nname = "take-my-word"\nversion = "0.1.0"\nedition = "2024"\n\n[dependencies]\nserde = "1"\n',
  );
  write(
    "apps/desktop/src-tauri/Cargo.lock",
    '[[package]]\nname = "serde"\nversion = "1.0.0"\n\n[[package]]\nname = "take-my-word"\nversion = "0.1.0"\n',
  );
  git(work, "add", "-A");
  git(work, "commit", "--quiet", "-m", "app");
  git(work, "remote", "add", "origin", origin);
  git(work, "push", "--quiet", "origin", branch);
}

describe("pnpm release:desktop", () => {
  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "desktop-release-"));
    work = join(base, "work");
    origin = join(base, "origin.git");
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it("bumps, commits, tags with the notes and pushes branch and tag together", () => {
    setUp("feat/0005_desktop_release");
    write("../notes.md", "Fixes the paste in terminals.\n");
    const result = release("0.2.0", "--notes", join(base, "notes.md"));
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);

    const tagged = "refs/tags/desktop-v0.2.0";
    expect(git(origin, "cat-file", "-t", tagged)).toBe("tag");
    expect(git(origin, "tag", "--list", "--format=%(contents)", "desktop-v0.2.0")).toBe(
      "Fixes the paste in terminals.",
    );
    expect(git(origin, "rev-parse", `${tagged}^{commit}`)).toBe(
      git(origin, "rev-parse", "refs/heads/feat/0005_desktop_release"),
    );
    expect(git(origin, "log", "-1", "--format=%s", "feat/0005_desktop_release")).toBe(
      "chore(desktop): release 0.2.0",
    );
    const show = (file: string) => git(origin, "show", `desktop-v0.2.0:apps/desktop/${file}`);
    expect(JSON.parse(show("package.json"))).toMatchObject({ version: "0.2.0" });
    expect(show("src-tauri/Cargo.toml")).toContain('version = "0.2.0"');
    expect(show("src-tauri/Cargo.lock")).toContain(
      '[[package]]\nname = "serde"\nversion = "1.0.0"\n\n[[package]]\nname = "take-my-word"\nversion = "0.2.0"',
    );
    expect(git(work, "status", "--porcelain")).toBe("");
  });

  it.each(["develop", "main"])("refuses to release from %s", (branch) => {
    setUp(branch);
    const result = release("0.2.0", "--notes", join(work, "apps/desktop/package.json"));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`refusing to release from ${branch}`);
    expect(git(origin, "tag", "--list")).toBe("");
    expect(git(work, "log", "--format=%s")).toBe("app");
  });

  it("refuses a dirty working tree", () => {
    setUp("feat/0005_desktop_release");
    write("apps/desktop/notes.txt", "draft\n");
    const result = release("0.2.0", "--notes", join(work, "apps/desktop/notes.txt"));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("the working tree has changes");
    expect(readFileSync(join(work, "apps/desktop/src-tauri/Cargo.toml"), "utf8")).toContain(
      'version = "0.1.0"',
    );
    expect(git(origin, "tag", "--list")).toBe("");
  });

  it("refuses empty notes before changing anything", () => {
    setUp("feat/0005_desktop_release");
    write("../empty.md", "\n");
    const result = release("0.2.0", "--notes", join(base, "empty.md"));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("is empty; the tag message is the release notes");
    expect(git(work, "log", "--format=%s")).toBe("app");
  });
});
