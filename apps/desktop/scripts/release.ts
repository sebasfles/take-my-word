import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  compareVersions,
  isVersion,
  readVersions,
  tagPrefix,
  versionProblem,
  writeVersion,
} from "./version.ts";

const protectedBranches = ["develop", "main"];

function git(args: string[], options: { inherit?: boolean } = {}): string {
  const output = execFileSync("git", args, {
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  return typeof output === "string" ? output.trim() : "";
}

export function release(version: string, notesFile: string | undefined): string {
  if (!isVersion(version)) throw new Error(`${version} is not a semantic version (X.Y.Z)`);
  const root = git(["rev-parse", "--show-toplevel"]);
  const desktopDir = join(root, "apps", "desktop");
  const branch = git(["branch", "--show-current"]);
  if (branch === "") throw new Error("HEAD is detached; check out the task branch first");
  if (protectedBranches.includes(branch)) {
    throw new Error(`refusing to release from ${branch}; release from the task branch`);
  }
  if (git(["status", "--porcelain"]) !== "") {
    throw new Error("the working tree has changes; commit or remove them first");
  }
  const tag = `${tagPrefix}${version}`;
  if (git(["tag", "--list", tag]) !== "" || git(["ls-remote", "--tags", "origin", tag]) !== "") {
    throw new Error(`${tag} already exists`);
  }
  const current = readVersions(desktopDir);
  const problem = versionProblem(current);
  if (problem) throw new Error(problem);
  if (compareVersions(version, current.cargoToml) <= 0) {
    throw new Error(`${version} is not newer than the desktop's ${current.cargoToml}`);
  }
  const notes = notesFile === undefined ? undefined : resolve(notesFile);
  if (notes !== undefined && readFileSync(notes, "utf8").trim() === "") {
    throw new Error(`${notesFile ?? ""} is empty; the tag message is the release notes`);
  }

  const changed = writeVersion(desktopDir, version).map((file) => join(desktopDir, file));
  git(["add", "--", ...changed]);
  git(["commit", "--quiet", "-m", `chore(desktop): release ${version}`]);
  try {
    if (notes === undefined) git(["tag", "--annotate", tag], { inherit: true });
    else git(["tag", "--annotate", tag, "--file", notes]);
  } catch (error) {
    git(["reset", "--quiet", "--keep", "HEAD~1"]);
    throw new Error("tagging failed, the version commit was undone", { cause: error });
  }
  git(["push", "--quiet", "--atomic", "origin", `HEAD:refs/heads/${branch}`, `refs/tags/${tag}`]);
  return tag;
}

if (import.meta.main) {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { notes: { type: "string" } },
  });
  const [version] = positionals;
  if (version === undefined || positionals.length !== 1) {
    console.error("usage: pnpm release:desktop X.Y.Z [--notes <file>]");
    process.exit(2);
  }
  try {
    const tag = release(version, values.notes);
    console.log(`pushed ${tag}; desktop-release builds and publishes it`);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    const cause = error.cause instanceof Error ? `: ${error.cause.message}` : "";
    console.error(`${error.message}${cause}`);
    process.exit(1);
  }
}
