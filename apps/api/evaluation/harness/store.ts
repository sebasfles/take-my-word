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
}

export interface ResultsDir {
  dir: string;
  results: string;
  failures: string;
  ledger: string;
  meta: RunMeta & { startedAt: string };
}

export function openResultsDir(dir: string, meta: RunMeta, now: Date): ResultsDir {
  mkdirSync(dir, { recursive: true });
  const metaPath = join(dir, "meta.json");
  let stored: (RunMeta & { startedAt: string }) | undefined;
  if (existsSync(metaPath)) {
    stored = JSON.parse(readFileSync(metaPath, "utf8")) as RunMeta & { startedAt: string };
    const current = stored;
    const differs = (Object.keys(meta) as (keyof RunMeta)[]).some(
      (key) => current[key] !== meta[key],
    );
    if (differs) {
      throw new Error(
        `${dir} holds a run of other fixtures, code or settings (${JSON.stringify(current)}); use a new --results directory`,
      );
    }
  } else {
    stored = { ...meta, startedAt: now.toISOString() };
    writeFileSync(metaPath, `${JSON.stringify(stored, null, 2)}\n`);
  }
  return {
    dir,
    results: join(dir, `${meta.suite}.jsonl`),
    failures: join(dir, `${meta.suite}.failures.jsonl`),
    ledger: join(dirname(dir), "ledger.jsonl"),
    meta: stored,
  };
}
