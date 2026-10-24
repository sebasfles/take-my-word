import { join } from "node:path";
import { loadTranscriptionFixtures } from "./harness/fixtures.ts";
import { readJsonl } from "./harness/store.ts";
import { check, type TranscriptionResult } from "./harness/transcription-analysis.ts";

const dir = process.argv[2];
if (dir === undefined) {
  console.error("usage: pnpm eval:capture <transcription results dir>");
  process.exit(2);
}

const fixtures = loadTranscriptionFixtures();
const byId = new Map(fixtures.cases.map((item) => [item.id, item]));
const groups = new Map<
  string,
  {
    caseId: string;
    raw: string;
    errors: number;
    missed: string[];
    seenIn: Set<string>;
    count: number;
  }
>();
for (const result of readJsonl<TranscriptionResult>(join(dir, "transcription.jsonl"))) {
  const item = byId.get(result.caseId);
  if (item?.kind !== "speech" || !result.ok) continue;
  const checked = check(result, item);
  if (!checked.pasted || (checked.errors === 0 && checked.missed.length === 0)) continue;
  const raw = result.text ?? "";
  const key = `${item.id}|${raw}`;
  const group = groups.get(key) ?? {
    caseId: item.id,
    raw,
    errors: checked.errors,
    missed: checked.missed,
    seenIn: new Set<string>(),
    count: 0,
  };
  group.count += 1;
  group.seenIn.add(`${result.candidate} ${result.mode}`);
  groups.set(key, group);
}
const sorted = [...groups.values()].sort(
  (a, b) => a.caseId.localeCompare(b.caseId) || b.count - a.count,
);
console.log(
  JSON.stringify(
    sorted.map((group) => ({ ...group, seenIn: [...group.seenIn].sort() })),
    null,
    2,
  ),
);
