import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProviderRequest } from "../../src/eval/contract.ts";
import { openFinishedRun, openResultsDir, readRunMeta, type RunMeta } from "./store.ts";
import { requestsSha256 } from "./suite.ts";

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
  requestsSha256: "requests",
  evalBundleSha256: "bundle",
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
    ).toThrow(/other fixtures, audio, requests, eval code or settings/);
    expect(() => openResultsDir(dir, { ...meta, evalBundleSha256: "other" }, new Date())).toThrow();
    expect(() => openResultsDir(dir, { ...meta, requestsSha256: "other" }, new Date())).toThrow();
    expect(started.ledger).toBe(join(root, "ledger.jsonl"));
  });

  it("reads a finished run for rendering under newer code, never under other fixtures or settings", () => {
    const root = mkdtempSync(join(tmpdir(), "tmw-results-"));
    roots.push(root);
    const dir = join(root, "run-1");
    expect(openFinishedRun(dir, meta)).toBeUndefined();
    openResultsDir(dir, meta, new Date("2026-10-23T12:00:00.000Z"));
    const finished = openFinishedRun(dir, { suite: "transcription", fixturesSha256: "f", runs: 5 });
    expect(finished?.meta.codeCommit).toBe("c");
    expect(() => openFinishedRun(dir, { ...meta, fixturesSha256: "g" })).toThrow(/other fixtures/);
    expect(() => openFinishedRun(dir, { ...meta, runs: 3 })).toThrow(/other fixtures/);
  });

  it("resumes under a newer commit when requests and eval bundle are the same, and records it", () => {
    const root = mkdtempSync(join(tmpdir(), "tmw-results-"));
    roots.push(root);
    const dir = join(root, "run-1");
    openResultsDir(dir, meta, new Date("2026-10-23T12:00:00.000Z"));
    const resumed = openResultsDir(dir, { ...meta, codeCommit: "d" }, new Date());
    expect(resumed.meta).toMatchObject({ codeCommit: "c", resumedWith: ["d"] });
    expect(readRunMeta(dir)?.resumedWith).toEqual(["d"]);
    openResultsDir(dir, { ...meta, codeCommit: "d" }, new Date());
    expect(readRunMeta(dir)?.resumedWith).toEqual(["d"]);
  });
});

describe("requestsSha256", () => {
  const refine = (raw: string): ProviderRequest => ({
    kind: "refine",
    connection: "fresh",
    refiner: { provider: "openai", model: "gpt-5.4-nano" },
    raw,
    language: "es",
    instructions: "i",
  });
  const transcribe = (audio: string): ProviderRequest => ({
    kind: "transcribe",
    connection: "fresh",
    transcriber: { provider: "groq-whisper", model: "whisper-large-v3" },
    audioBase64: Buffer.from(audio).toString("base64"),
    container: "wav",
    languages: ["es"],
    prompt: "",
  });

  it("ignores plan order and changes with any request field or audio byte", () => {
    const a = { id: "a", request: refine("hola") };
    const b = { id: "b", request: transcribe("RIFF1") };
    expect(requestsSha256([a, b])).toBe(requestsSha256([b, a]));
    expect(requestsSha256([a, b])).not.toBe(requestsSha256([{ ...a, request: refine("chao") }, b]));
    expect(requestsSha256([a, b])).not.toBe(
      requestsSha256([a, { ...b, request: transcribe("RIFF2") }]),
    );
  });
});
