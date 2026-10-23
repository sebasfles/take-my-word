import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openResultsDir, type RunMeta } from "./store.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const meta: RunMeta = {
  suite: "transcription",
  fixturesSha256: "f",
  codeCommit: "c",
  runs: 5,
  clips: { "dev-es-1/Lupe": "aaa", "dev-es-1/Andres": "bbb" },
};

describe("openResultsDir", () => {
  it("resumes a run only with the same fixtures, code, run count and audio bytes", () => {
    const root = mkdtempSync(join(tmpdir(), "tmw-results-"));
    roots.push(root);
    const dir = join(root, "run-1");
    const started = openResultsDir(dir, meta, new Date("2026-10-23T12:00:00.000Z"));
    expect(openResultsDir(dir, { ...meta }, new Date()).meta.startedAt).toBe(
      started.meta.startedAt,
    );
    expect(() =>
      openResultsDir(
        dir,
        { ...meta, clips: { ...meta.clips, "dev-es-1/Lupe": "changed" } },
        new Date(),
      ),
    ).toThrow(/other fixtures, audio, code or settings/);
    expect(() => openResultsDir(dir, { ...meta, codeCommit: "d" }, new Date())).toThrow();
    expect(started.ledger).toBe(join(root, "ledger.jsonl"));
  });
});
