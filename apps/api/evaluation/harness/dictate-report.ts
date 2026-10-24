import { clientOverhead } from "./client-overhead.ts";
import type { DictateChecked, DictateSummary } from "./dictate-analysis.ts";
import { extendedBucket, type SpeechCase } from "./fixtures.ts";
import { isProviderFailure, itemKey, pct, type LatencyStats } from "./transcription-analysis.ts";
import type { FailureRecord } from "./suite.ts";

export interface DictateReportInput {
  command: string;
  planNotes: string[];
  generatedAt: string;
  codeCommit: string;
  fixturesSha256: string;
  functionName: string;
  runs: number;
  chargedUsd: number;
  failedAttempts: FailureRecord[];
  cases: readonly SpeechCase[];
  combinations: readonly string[];
  all: ReadonlyMap<string, DictateSummary>;
  short: ReadonlyMap<string, DictateSummary>;
  extended: ReadonlyMap<string, DictateSummary>;
  checked: readonly DictateChecked[];
}

const ms = (value: number | undefined) =>
  value === undefined ? "n/a" : `${String(Math.round(value))} ms`;
const stat = (stats: LatencyStats) =>
  stats.count === 0 ? "n/a" : `${ms(stats.p50)} / ${ms(stats.p95)} (${String(stats.count)})`;

function rows(
  combinations: readonly string[],
  summaries: ReadonlyMap<string, DictateSummary>,
): string[] {
  const lines = [
    "| Combination | Dictations | Failed | Flagged | WER of the pasted text | Terms not as written | In the Lambda | Release to text |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const name of combinations) {
    const s = summaries.get(name);
    if (s === undefined || s.results === 0) continue;
    lines.push(
      `| ${name} | ${String(s.results)} | ${String(s.failed)} | ${String(s.flagged.length)} | ${pct(s.wer)} | ${String(s.termErrors)}/${String(s.terms)} | ${stat(s.latency.inLambda)} | ${stat(s.latency.releaseToText)} |`,
    );
  }
  return lines;
}

export function dictateReport(input: DictateReportInput): string {
  const lines: string[] = [];
  const push = (...more: string[]) => lines.push(...more);
  push("# End to end inside the eval Lambda", "");
  push(
    `Generated ${input.generatedAt} from code commit \`${input.codeCommit}\` and fixtures sha256 \`${input.fixturesSha256.slice(0, 16)}\`.`,
    `Production's \`dictate()\` ran inside the dev eval Lambda \`${input.functionName}\` with each combination's adapters and a fake quota, store and profile (the case's fixture dictionary, the plain style, the case's own language); ${String(input.runs)} runs per case, every call on a fresh connection, as a normal dictation gets one; Lambda cold starts are left out of latency.`,
    `Cases: the end-to-end cases and the ${extendedBucket} samples, first voice of each (${input.cases.map((item) => item.id).join(", ")}).`,
    `"In the Lambda" is \`dictate()\`'s own total: probe, level, profile, transcription, silence guard, cleanup and save. "Release to text" adds the client-to-API overhead measured by round 1's dev end-to-end run (${clientOverhead.run}, ${clientOverhead.measuredAt}, ${clientOverhead.source}: ${String(clientOverhead.samplesMs.length)} warm dictations, ${clientOverhead.meaning}); P50 / P95 come from the distribution of every sum, never from adding percentiles, and the overhead is that client's network, labelled as such.`,
    `This run's calls cost ${input.chargedUsd.toFixed(3)} USD charged.`,
    ...input.planNotes.map((note) => `${note}.`),
    `Reproduce from the repository root: \`${input.command}\`.`,
    "",
  );
  push("## Every case", "", ...rows(input.combinations, input.all), "");
  push("## Cases under 30 s", "", ...rows(input.combinations, input.short), "");
  push(`## Samples of ${extendedBucket}`, "", ...rows(input.combinations, input.extended), "");

  push("## Failed calls", "");
  if (input.failedAttempts.length === 0) push("None.", "");
  else {
    const counts = new Map<string, number>();
    for (const failure of input.failedAttempts) {
      const key = `${itemKey(failure.id).candidate}: ${failure.status === undefined ? failure.message : String(failure.status)}${isProviderFailure(failure) ? "" : " (the harness's own call to the eval Lambda, not a provider answer; not counted as a failed call)"}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const [key, count] of counts) push(`- ${key}, ${String(count)} attempts`);
    push("");
  }

  push("## Flagged or wrong outputs", "");
  push("Identical outputs per case and combination are counted once.", "");
  for (const item of input.cases) {
    const entries = input.checked.filter(
      (entry) =>
        entry.item.id === item.id &&
        (entry.flags.length > 0 || entry.termsWrong.length > 0 || !entry.result.ok),
    );
    if (entries.length === 0) continue;
    push(`### ${item.id}`, "", `Expected: ${item.text}`, "");
    const groups = new Map<string, { count: number; entry: DictateChecked }>();
    for (const entry of entries) {
      const key = `${entry.result.combination}|${entry.result.dictation?.text ?? entry.result.error?.message ?? ""}`;
      const group = groups.get(key) ?? { count: 0, entry };
      group.count += 1;
      groups.set(key, group);
    }
    for (const { count, entry } of groups.values()) {
      const r = entry.result;
      const notes = [
        ...entry.flags.map((flag) => `**${flag}**`),
        ...entry.termsWrong.map((term) => `term "${term}" not as written`),
      ];
      const said = r.ok
        ? `raw "${r.dictation?.raw ?? ""}", text "${r.dictation?.text ?? ""}"`
        : `failed: ${r.error?.message ?? ""}`;
      push(
        `- ${r.combination}, ${String(count)}x: ${said}${notes.length > 0 ? ` (${notes.join("; ")})` : ""}`,
      );
    }
    push("");
  }
  return `${lines.join("\n")}\n`;
}
