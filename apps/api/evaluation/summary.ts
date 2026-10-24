import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { refinerCandidates, transcriberCandidates } from "./harness/candidates.ts";
import {
  checkCleanup,
  cleanupHardGatePassed,
  cleanupRelativeGate,
  summarizeCleanup,
  type CleanupResult,
  type CleanupSummary,
} from "./harness/cleanup-analysis.ts";
import { loadCleanupFixtures } from "./harness/cleanup-fixtures.ts";
import {
  dictationSeconds,
  dictationsPerMonth,
  scenarios,
  stageMonth,
  transcriptionStage,
  type StageUse,
} from "./harness/combinations.ts";
import { loadTranscriptionFixtures, languageModes } from "./harness/fixtures.ts";
import { percentile, sumDistribution } from "./harness/metrics.ts";
import { modelFacts, pricesCheckedOn } from "./harness/prices.ts";
import { readJsonl } from "./harness/store.ts";
import type { FailureRecord } from "./harness/suite.ts";
import {
  check,
  hardGatePassed,
  pct,
  relativeGate,
  summarize,
  type CandidateSummary,
  type TranscriptionResult,
} from "./harness/transcription-analysis.ts";
import { usdPerAudioSecond } from "./harness/transcription-report.ts";
import { fromInvocation, fromRoot } from "./harness/workspace.ts";

const { values } = parseArgs({
  options: {
    transcription: { type: "string" },
    cleanup: { type: "string" },
    report: { type: "string" },
  },
});
if (
  values.transcription === undefined ||
  values.cleanup === undefined ||
  values.report === undefined
) {
  console.error(
    "usage: pnpm eval:summary --transcription <dir> --cleanup <dir> --report <report.md>",
  );
  process.exit(2);
}

const transcriptionDir = fromInvocation(values.transcription);
const cleanupDir = fromInvocation(values.cleanup);
const reportPath = fromInvocation(values.report);
const transcriptionFixtures = loadTranscriptionFixtures();
const cleanupFixtures = loadCleanupFixtures(transcriptionFixtures);

const transcriptionCases = new Map(transcriptionFixtures.cases.map((item) => [item.id, item]));
const transcriptionChecked = readJsonl<TranscriptionResult>(
  join(transcriptionDir, "transcription.jsonl"),
).map((result) => {
  const item = transcriptionCases.get(result.caseId);
  if (item === undefined) throw new Error(`no case ${result.caseId}`);
  return check(result, item);
});
const transcriptionFailures = readJsonl<FailureRecord>(
  join(transcriptionDir, "transcription.failures.jsonl"),
);
const longIds = new Set(
  transcriptionFixtures.cases.filter((item) => item.id.startsWith("long-")).map((item) => item.id),
);
const transcriptionSummaries = new Map<string, CandidateSummary>(
  transcriberCandidates.map((candidate) => [
    candidate.id,
    summarize(candidate.id, transcriptionChecked, transcriptionFailures, longIds),
  ]),
);

const cleanupCases = new Map(cleanupFixtures.cases.map((item) => [item.id, item]));
const cleanupChecked = readJsonl<CleanupResult>(join(cleanupDir, "cleanup.jsonl")).map((result) => {
  const item = cleanupCases.get(result.caseId);
  if (item === undefined) throw new Error(`no case ${result.caseId}`);
  return checkCleanup(result, item);
});
const cleanupFailures = readJsonl<FailureRecord>(join(cleanupDir, "cleanup.failures.jsonl"));
const cleanupSummaries = new Map<string, CleanupSummary>(
  refinerCandidates.map((candidate) => [
    candidate.id,
    summarizeCleanup(candidate.id, cleanupChecked, cleanupFailures),
  ]),
);

const transcriptionBaseline = transcriptionSummaries.get(
  transcriberCandidates.find((candidate) => candidate.baseline)?.id ?? "",
);
const cleanupBaseline = cleanupSummaries.get(
  refinerCandidates.find((candidate) => candidate.baseline)?.id ?? "",
);
if (transcriptionBaseline === undefined || cleanupBaseline === undefined) {
  throw new Error("both baselines need results");
}

const ms = (value: number | undefined) => (value === undefined ? "n/a" : String(Math.round(value)));
const usd = (value: number) => (value < 0.01 ? value.toFixed(4) : value.toFixed(2));
const combined = (first: number[], second: number[]) => {
  const all = sumDistribution(first, second);
  return `${ms(percentile(all, 50))} / ${ms(percentile(all, 95))}`;
};

const lines: string[] = [];
const push = (...more: string[]) => lines.push(...more);
push("# Transcription and cleanup combinations", "");
push(
  `Generated ${new Date().toISOString()} from the transcription results in \`${fromRoot(transcriptionDir)}\` and the cleanup results in \`${fromRoot(cleanupDir)}\`; prices and plans as checked on ${pricesCheckedOn}.`,
  `Gates: both stages pass their hard gate and their relative gate against today's models (see each suite's report).`,
  "Latency is release to text inside us-east-1 for the provider calls only, in ms: the P50 / P95 of the sum over every pair of measured transcription and cleanup samples, so it assumes the two stages are independent and is never a sum of percentiles.",
  `Cost per ${String(dictationSeconds)} s dictation at list price; a light month is ${String(dictationsPerMonth(scenarios[0]))} dictations (2 hours of audio), a heavy month ${String(dictationsPerMonth(scenarios[1]))} (1 hour a day); "charged" counts only stages whose free allowance would not cover that volume.`,
  "",
);

for (const mode of languageModes) {
  push(`## Dictation languages: ${mode === "one" ? "one" : "both (es, en)"}`, "");
  push(
    "| Transcriber | Cleanup | Gates | WER | Term errors | Meaning changes | Fresh P50 / P95 | Reused P50 / P95 | Per dictation | Light month list / charged | Heavy month list / charged |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
  );
  const notes = new Map<string, string>();
  for (const transcriber of transcriberCandidates) {
    const t = transcriptionSummaries.get(transcriber.id);
    if (t === undefined || t.modes[mode].results === 0) continue;
    const tGate =
      hardGatePassed(t) &&
      (transcriber.baseline === true || relativeGate(t, transcriptionBaseline).passed);
    const tStage: StageUse = transcriptionStage(
      transcriber.spec.model,
      t.modes[mode].callsPerDictation,
      usdPerAudioSecond(transcriber, transcriptionChecked),
    );
    for (const refiner of refinerCandidates) {
      const c = cleanupSummaries.get(refiner.id);
      if (c === undefined || c.results === 0) continue;
      const cGate =
        cleanupHardGatePassed(c) &&
        (refiner.baseline === true || cleanupRelativeGate(c, cleanupBaseline).passed);
      const cStage: StageUse = {
        model: refiner.spec.model,
        callsPerDictation: 1,
        usdPerDictation: c.listUsdPerCall,
        tokensPerCall: (c.inputTokensP50 ?? 0) + (c.outputTokensP50 ?? 0),
      };
      const months = scenarios.map((scenario) => {
        const stages = [stageMonth(tStage, scenario), stageMonth(cStage, scenario)];
        for (const [stage, month] of [
          [transcriber.id, stages[0]],
          [refiner.id, stages[1]],
        ] as const) {
          if (month !== undefined) notes.set(`${stage}, ${scenario.name}`, month.why);
        }
        const list = stages.reduce((sum, stage) => sum + stage.listUsd, 0);
        const charged = stages.reduce((sum, stage) => sum + (stage.covered ? 0 : stage.listUsd), 0);
        return `${usd(list)} / ${usd(charged)} USD`;
      });
      const gates =
        tGate && cGate
          ? "pass"
          : `fail (${[!tGate && "transcription", !cGate && "cleanup"].filter(Boolean).join(", ")})`;
      push(
        `| ${transcriber.id} | ${refiner.id} | ${gates} | ${pct(t.modes[mode].wer)} | ${pct(t.modes[mode].termErrorRate)} | ${pct(c.meaningChangeRate)} | ${combined(t.modes[mode].samplesByConnection.fresh, c.samplesByConnection.fresh)} | ${combined(t.modes[mode].samplesByConnection.reused, c.samplesByConnection.reused)} | ${usd(tStage.usdPerDictation + cStage.usdPerDictation)} USD | ${months.join(" | ")} |`,
      );
    }
  }
  push("", "Free allowances at these volumes:", "");
  for (const [key, why] of [...notes].sort(([a], [b]) => a.localeCompare(b)))
    push(`- ${key}: ${why}`);
  push("");
}

push("## Models", "");
for (const model of new Set([
  ...transcriberCandidates.map((candidate) => candidate.spec.model),
  ...refinerCandidates.map((candidate) => candidate.spec.model),
])) {
  const facts = modelFacts(model);
  push(
    `- \`${model}\` (${facts.provider}): price from ${facts.price.source}${facts.retires ? `; retires ${facts.retires.on} (${facts.retires.source})` : ""}.`,
  );
}
push("");
writeFileSync(reportPath, `${lines.join("\n")}\n`);
console.log(`summary written to ${fromRoot(reportPath)}`);
