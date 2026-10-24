import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as T);
}

export function appendJsonl(path: string, record: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(record)}\n`);
}

export interface RunMeta {
  suite: string;
  fixturesSha256: string;
  codeCommit: string;
  runs: number;
  clips?: Record<string, string>;
  requestsSha256: string;
  evalBundleSha256: string;
}

export interface ResultsDir {
  dir: string;
  results: string;
  failures: string;
  overrides: string;
  synthesis: string;
  ledger: string;
  meta: StoredMeta;
}

export type StoredMeta = RunMeta & { startedAt: string; resumedWith?: string[] };

export function paths(dir: string, suite: string): Omit<ResultsDir, "meta"> {
  return {
    dir,
    results: join(dir, `${suite}.jsonl`),
    failures: join(dir, `${suite}.failures.jsonl`),
    overrides: join(dir, "overrides.jsonl"),
    synthesis: join(dir, "synthesis.jsonl"),
    ledger: join(dirname(dir), "ledger.jsonl"),
  };
}

export function readRunMeta(dir: string): StoredMeta | undefined {
  const metaPath = join(dir, "meta.json");
  return existsSync(metaPath)
    ? (JSON.parse(readFileSync(metaPath, "utf8")) as StoredMeta)
    : undefined;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function openFinishedRun(
  dir: string,
  identity: Pick<RunMeta, "suite" | "fixturesSha256" | "runs">,
): ResultsDir | undefined {
  const stored = readRunMeta(dir);
  if (stored === undefined) return undefined;
  if (
    stored.suite !== identity.suite ||
    stored.fixturesSha256 !== identity.fixturesSha256 ||
    stored.runs !== identity.runs
  ) {
    throw new Error(
      `${dir} holds a run of other fixtures or settings (${JSON.stringify(stored)}); use a new --results directory`,
    );
  }
  return { ...paths(dir, identity.suite), meta: stored };
}

export function openResultsDir(dir: string, meta: RunMeta, now: Date): ResultsDir {
  mkdirSync(dir, { recursive: true });
  let stored = readRunMeta(dir);
  if (stored !== undefined) {
    const current = stored;
    const differs = (Object.keys(meta) as (keyof RunMeta)[]).some(
      (key) => key !== "codeCommit" && !same(current[key], meta[key]),
    );
    if (differs) {
      throw new Error(
        `${dir} holds a run of other fixtures, audio, requests, eval code or settings (${JSON.stringify(current)}); use a new --results directory`,
      );
    }
    const resumes = current.resumedWith ?? [];
    if (current.codeCommit !== meta.codeCommit && !resumes.includes(meta.codeCommit)) {
      stored = { ...current, resumedWith: [...resumes, meta.codeCommit] };
      writeFileSync(join(dir, "meta.json"), `${JSON.stringify(stored, null, 2)}\n`);
    }
  } else {
    stored = { ...meta, startedAt: now.toISOString() };
    writeFileSync(join(dir, "meta.json"), `${JSON.stringify(stored, null, 2)}\n`);
  }
  return { ...paths(dir, meta.suite), meta: stored };
}
