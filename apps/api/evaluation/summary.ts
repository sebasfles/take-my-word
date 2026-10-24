import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import {
  notRerun,
  refinerCandidates,
  transcriberCandidates,
  type RefinerCandidate,
  type TranscriberCandidate,
} from "./harness/candidates.ts";
import { clientOverhead } from "./harness/client-overhead.ts";
import {
  checkCleanup,
  cleanupGate,
  combinationCleanupGate,
  summarizeCleanupBuckets,
  type CleanupResult,
} from "./harness/cleanup-analysis.ts";
import { loadCleanupFixtures } from "./harness/cleanup-fixtures.ts";
import {
  dictationSeconds,
  dictationsPerMonth,
  rankPassing,
  scenarios,
  stageMonth,
  transcriptionStage,
  type StageUse,
} from "./harness/combinations.ts";
import {
  checkDictation,
  combinationOf,
  dictateLatency,
  type DictateResult,
} from "./harness/dictate-analysis.ts";
import {
  extendedBucket,
  isExtended,
  languageModes,
  loadTranscriptionFixtures,
  type LanguageMode,
} from "./harness/fixtures.ts";
import { percentile, sumDistribution } from "./harness/metrics.ts";
import type { LedgerEntry } from "./harness/pacing.ts";
import { modelFacts, planNotes, pricesCheckedFor } from "./harness/prices.ts";
import { readJsonl } from "./harness/store.ts";
import type { FailureRecord } from "./harness/suite.ts";
import {
  check,
  pct,
  summarizeBuckets,
  transcriptionGate,
  type TranscriptionResult,
} from "./harness/transcription-analysis.ts";
import { usdPerAudioSecond } from "./harness/transcription-report.ts";
import { fromInvocation, fromRoot } from "./harness/workspace.ts";

const { values } = parseArgs({
  options: {
    transcription: { type: "string" },
    cleanup: { type: "string" },
    dictate: { type: "string" },
    report: { type: "string" },
  },
});
if (
  values.transcription === undefined ||
  values.cleanup === undefined ||
  values.report === undefined
) {
  console.error(
    "usage: pnpm eval:summary --transcription <dir> --cleanup <dir> [--dictate <dir>] --report <report.md>",
  );
  process.exit(2);
}

const transcriptionDir = fromInvocation(values.transcription);
const cleanupDir = fromInvocation(values.cleanup);
const dictateDir = values.dictate === undefined ? undefined : fromInvocation(values.dictate);
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
const longIds = new Set(
  transcriptionFixtures.cases.filter((item) => item.id.startsWith("long-")).map((item) => item.id),
);
const transcription = summarizeBuckets(
  transcriberCandidates.map((candidate) => candidate.id),
  transcriptionChecked,
  readJsonl<FailureRecord>(join(transcriptionDir, "transcription.failures.jsonl")),
  longIds,
  isExtended,
);

const cleanupCases = new Map(cleanupFixtures.cases.map((item) => [item.id, item]));
const cleanupChecked = readJsonl<CleanupResult>(join(cleanupDir, "cleanup.jsonl")).map((result) => {
  const item = cleanupCases.get(result.caseId);
  if (item === undefined) throw new Error(`no case ${result.caseId}`);
  return checkCleanup(result, item);
});
const cleanup = summarizeCleanupBuckets(
  refinerCandidates.map((candidate) => candidate.id),
  cleanupChecked,
  readJsonl<FailureRecord>(join(cleanupDir, "cleanup.failures.jsonl")),
  isExtended,
);

const speechCases = new Map(
  transcriptionFixtures.cases.flatMap((item) =>
    item.kind === "speech" ? [[item.id, item] as const] : [],
  ),
);
const dictations =
  dictateDir === undefined
    ? []
    : readJsonl<DictateResult>(join(dictateDir, "dictate.jsonl")).map((result) => {
        const item = speechCases.get(result.caseId);
        if (item === undefined) throw new Error(`no case ${result.caseId}`);
        return checkDictation(result, item);
      });

const transcriberBaseline = transcriberCandidates.find((candidate) => candidate.baseline);
const refinerBaseline = refinerCandidates.find((candidate) => candidate.baseline);
if (transcriberBaseline === undefined || refinerBaseline === undefined) {
  throw new Error("both suites need a baseline");
}
const todayOnTurbo = cleanup.chainedBy(transcriberBaseline.id).get(refinerBaseline.id);
if (todayOnTurbo === undefined || todayOnTurbo.results === 0) {
  throw new Error("today's cleanup needs results on today's transcriber's chained raws");
}

const ms = (value: number | undefined) => (value === undefined ? "n/a" : String(Math.round(value)));
const usd = (value: number) => (value < 0.01 ? value.toFixed(4) : value.toFixed(2));
const p50p95 = (samples: readonly number[]) =>
  `${ms(percentile(samples, 50))} / ${ms(percentile(samples, 95))}`;

interface Row {
  transcriber: string;
  refiner: string;
  passed: boolean;
  failures: string[];
  wer: number;
  termErrors: number | undefined;
  meaningChanges: number | undefined;
  releaseP50: number | undefined;
  release: string;
  inLambda: string;
  source: string;
  perDictation: number;
  months: string[];
}

const notes = new Map<string, string>();

function row(
  transcriber: TranscriberCandidate,
  refiner: RefinerCandidate,
  mode: LanguageMode,
): Row | undefined {
  const t = transcription.all.get(transcriber.id);
  const c = cleanup.all.get(refiner.id);
  if (t === undefined || t.modes[mode].results === 0 || c === undefined || c.results === 0) {
    return undefined;
  }
  const failures: string[] = [];
  const tGate = transcriptionGate(
    transcriber.id,
    transcriberBaseline?.id ?? "",
    transcription,
    extendedBucket,
  );
  if (!tGate?.hard) failures.push("transcription hard gate");
  if (!tGate?.relative.passed) failures.push("transcription relative gate");
  const cGate = cleanupGate(refiner.id, refinerBaseline?.id ?? "", cleanup, extendedBucket);
  if (!cGate?.hard) failures.push("cleanup hard gate");
  if (!cGate?.relative.passed) failures.push("cleanup relative gate");
  const chained = cleanup.chainedBy(transcriber.id).get(refiner.id);
  const onOwnRaws = chained !== undefined && chained.results > 0 ? chained : undefined;
  if (onOwnRaws === undefined) failures.push("no cleanup of this transcriber's raws");
  else if (todayOnTurbo !== undefined && !combinationCleanupGate(onOwnRaws, todayOnTurbo).passed) {
    failures.push("cleanup of its own raws");
  }

  const name = combinationOf(transcriber.id, refiner.id);
  const measured = dictations.filter((entry) => entry.result.combination === name);
  let releaseSamples: number[];
  let inLambda = "n/a";
  let source: string;
  if (mode === "one" && measured.length > 0) {
    const latency = dictateLatency(
      measured.filter((entry) => !isExtended(entry.item.id)),
      clientOverhead.samplesMs,
    );
    releaseSamples = sumDistribution(latency.inLambdaSamples, clientOverhead.samplesMs);
    inLambda = p50p95(latency.inLambdaSamples);
    source = "end to end in the Lambda";
  } else {
    const shortT = transcription.short.get(transcriber.id);
    const stages = sumDistribution(
      shortT?.modes[mode].samplesByConnection.fresh ?? [],
      c.samplesByConnection.fresh,
    );
    releaseSamples = sumDistribution(stages, clientOverhead.samplesMs);
    source = "suites' provider calls";
  }

  const tStage: StageUse = transcriptionStage(
    transcriber.spec.model,
    t.modes[mode].callsPerDictation,
    usdPerAudioSecond(transcriber, transcriptionChecked),
  );
  const cStage: StageUse = {
    model: refiner.spec.model,
    callsPerDictation: 1,
    usdPerDictation: c.listUsdPerCall,
    tokensPerCall: (c.inputTokensP50 ?? 0) + (c.outputTokensP50 ?? 0),
  };
  const months = scenarios.map((scenario) => {
    const stages = [stageMonth(tStage, scenario), stageMonth(cStage, scenario)];
    stages.forEach((month, index) => {
      notes.set(`${index === 0 ? transcriber.id : refiner.id}, ${scenario.name}`, month.why);
    });
    const list = stages.reduce((sum, stage) => sum + stage.listUsd, 0);
    const charged = stages.reduce((sum, stage) => sum + (stage.covered ? 0 : stage.listUsd), 0);
    return `${usd(list)} / ${usd(charged)} USD`;
  });
  return {
    transcriber: transcriber.id,
    refiner: refiner.id,
    passed: failures.length === 0,
    failures,
    wer: t.modes[mode].wer,
    termErrors: onOwnRaws?.termErrorRate,
    meaningChanges: onOwnRaws?.meaningChangeRate,
    releaseP50: percentile(releaseSamples, 50),
    release: p50p95(releaseSamples),
    inLambda,
    source,
    perDictation: tStage.usdPerDictation + cStage.usdPerDictation,
    months,
  };
}

const rate = (value: number | undefined) => (value === undefined ? "n/a" : pct(value));
const lines: string[] = [];
const push = (...more: string[]) => lines.push(...more);
push("# Transcription and cleanup combinations", "");
push(
  `Generated ${new Date().toISOString()} from the transcription results in \`${fromRoot(transcriptionDir)}\`, the cleanup results in \`${fromRoot(cleanupDir)}\`${dictateDir === undefined ? "" : ` and the end-to-end results in \`${fromRoot(dictateDir)}\``}; prices and plans as checked on ${pricesCheckedFor([...transcriberCandidates.map((c) => c.spec.model), ...refinerCandidates.map((c) => c.spec.model)])}.`,
  `A combination passes when its transcriber passes suite 1's hard and relative gates (over every case and over the ${extendedBucket} samples alone), its cleanup passes suite 2's, and its cleanup of its own transcriber's raws has no more meaning changes or dictionary term errors than today's pair (\`${transcriberBaseline.id}\` raws cleaned by \`${refinerBaseline.id}\` as production calls it) plus that pair's run-to-run spread.`,
  ...planNotes(readJsonl<LedgerEntry>(join(dirname(transcriptionDir), "ledger.jsonl"))).map(
    (note) => `${note}.`,
  ),
  "WER is the transcriber's raw WER; term errors and meaning changes are measured after cleanup, on the transcriber's own raws.",
  `Release to text, in ms, on the fresh connection a normal dictation gets: \`dictate()\`'s total inside the eval Lambda where the end-to-end run measured the combination (cases under 30 s), otherwise the provider calls of both suites, each plus the client-to-API overhead of round 1's dev run (${clientOverhead.run}, ${clientOverhead.measuredAt}: ${clientOverhead.meaning}); P50 / P95 come from the distribution of every sum, never from adding percentiles.`,
  `Cost per ${String(dictationSeconds)} s dictation at list price; a light month is ${String(dictationsPerMonth(scenarios[0]))} dictations (2 hours of audio), a heavy month ${String(dictationsPerMonth(scenarios[1]))} (1 hour a day); "charged" counts only stages whose free allowance would not cover that volume. Together bills per started second of audio at its per-minute list price, an assumption of this harness.`,
  "",
);

for (const mode of languageModes) {
  const rows = transcriberCandidates.flatMap((transcriber) =>
    refinerCandidates.flatMap((refiner) => {
      const built = row(transcriber, refiner, mode);
      return built === undefined ? [] : [built];
    }),
  );
  const languageLabel = mode === "one" ? "one dictation language" : "both (es, en)";
  push(`## Passing combinations, fastest first, ${languageLabel}`, "");
  const ranked = rankPassing(rows);
  if (ranked.length === 0) push("None.", "");
  else {
    push(
      "| Rank | Transcriber | Cleanup | Release to text P50 / P95 | Measured from | In the Lambda P50 / P95 | WER | Term errors after cleanup | Meaning changes | Per dictation | Light month list / charged | Heavy month list / charged |",
      "|---|---|---|---|---|---|---|---|---|---|---|---|",
    );
    ranked.forEach((r, index) => {
      push(
        `| ${String(index + 1)} | ${r.transcriber} | ${r.refiner} | ${r.release} | ${r.source} | ${r.inLambda} | ${pct(r.wer)} | ${rate(r.termErrors)} | ${rate(r.meaningChanges)} | ${usd(r.perDictation)} USD | ${r.months.join(" | ")} |`,
      );
    });
    push("");
  }
  push(`## Every combination, ${languageLabel}`, "");
  push(
    "| Transcriber | Cleanup | Gates | WER | Term errors after cleanup | Meaning changes | Release to text P50 / P95 | Per dictation | Light month list / charged | Heavy month list / charged |",
    "|---|---|---|---|---|---|---|---|---|---|",
  );
  for (const r of rows) {
    push(
      `| ${r.transcriber} | ${r.refiner} | ${r.passed ? "pass" : `fail (${r.failures.join(", ")})`} | ${pct(r.wer)} | ${rate(r.termErrors)} | ${rate(r.meaningChanges)} | ${r.release} | ${usd(r.perDictation)} USD | ${r.months.join(" | ")} |`,
    );
  }
  push("");
}

push("Free allowances at these volumes:", "");
for (const [key, why] of [...notes].sort(([a], [b]) => a.localeCompare(b)))
  push(`- ${key}: ${why}`);
push("");
push("Not re-run in this round:", "");
for (const model of notRerun) push(`- \`${model.id}\`: ${model.reason}.`);
push("");

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
