import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { transcriberCandidates } from "./harness/candidates.ts";
import { languageModes, loadTranscriptionFixtures, voicesFor } from "./harness/fixtures.ts";
import { readJsonl } from "./harness/store.ts";
import {
  check,
  pct,
  summarize,
  type Checked,
  type TranscriptionResult,
} from "./harness/transcription-analysis.ts";
import { fromInvocation, fromRoot } from "./harness/workspace.ts";

const { values } = parseArgs({
  options: {
    first: { type: "string" },
    second: { type: "string" },
    report: { type: "string" },
  },
});
if (values.first === undefined || values.second === undefined || values.report === undefined) {
  console.error("usage: pnpm eval:reproduce --first <dir> --second <dir> --report <report.md>");
  process.exit(2);
}
const firstDir = fromInvocation(values.first);
const secondDir = fromInvocation(values.second);
const reportPath = fromInvocation(values.report);

const fixtures = loadTranscriptionFixtures();
const cases = new Map(fixtures.cases.map((item) => [item.id, item]));
const longIds = new Set<string>();
const load = (dir: string): Checked[] =>
  readJsonl<TranscriptionResult>(join(dir, "transcription.jsonl")).map((result) => {
    const item = cases.get(result.caseId);
    if (item === undefined) throw new Error(`no case ${result.caseId}`);
    return check(result, item);
  });

const first = load(firstDir);
const second = load(secondDir);
const runsOf = (checked: readonly Checked[]) =>
  Math.max(0, ...checked.map((entry) => entry.result.run));
const commonRuns = Math.min(runsOf(first), runsOf(second));
const clipsPerRun = (checked: readonly Checked[], candidate: string) =>
  new Set(
    checked
      .filter((entry) => entry.result.candidate === candidate)
      .map(
        (entry) =>
          `${entry.result.caseId}/${entry.result.voice}|${entry.result.mode}|${String(entry.result.run)}`,
      ),
  ).size;
const expected =
  fixtures.cases.reduce((sum, item) => sum + voicesFor(fixtures, item).length, 0) *
  languageModes.length *
  commonRuns;

const lines: string[] = [];
const push = (...more: string[]) => lines.push(...more);
push("# Transcription run-to-run reproduction", "");
push(
  `Compares the results in \`${fromRoot(firstDir)}\` and \`${fromRoot(secondDir)}\` on the runs both have (1 to ${String(commonRuns)}), with the same fixtures and checks; a candidate missing calls in either run is marked incomplete.`,
  `Reproduce from the repository root: \`pnpm --filter @take-my-word/api eval:reproduce --first ${fromRoot(firstDir)} --second ${fromRoot(secondDir)} --report ${fromRoot(reportPath)}\`.`,
  "",
  "| Candidate | Languages | Complete | WER first / second | Domain-term errors first / second | Hard-gate flags first / second | Language flips first / second |",
  "|---|---|---|---|---|---|---|",
);
for (const candidate of transcriberCandidates) {
  const within = (checked: readonly Checked[]) =>
    checked.filter((entry) => entry.result.run <= commonRuns);
  const a = summarize(candidate.id, within(first), [], longIds);
  const b = summarize(candidate.id, within(second), [], longIds);
  const complete =
    clipsPerRun(within(first), candidate.id) === expected &&
    clipsPerRun(within(second), candidate.id) === expected;
  const flags = (summary: typeof a, mode: (typeof languageModes)[number]) =>
    String(
      summary.flagged
        .filter((entry) => entry.result.mode === mode)
        .reduce((sum, entry) => sum + entry.flags.length, 0),
    );
  for (const mode of languageModes) {
    push(
      `| ${candidate.id} | ${mode} | ${complete ? "yes" : "incomplete"} | ${pct(a.modes[mode].wer)} / ${pct(b.modes[mode].wer)} | ${pct(a.modes[mode].termErrorRate)} / ${pct(b.modes[mode].termErrorRate)} | ${flags(a, mode)} / ${flags(b, mode)} | ${String(a.modes[mode].flips)} / ${String(b.modes[mode].flips)} |`,
    );
  }
}
push("");
writeFileSync(reportPath, `${lines.join("\n")}\n`);
console.log(`comparison written to ${fromRoot(reportPath)}`);
