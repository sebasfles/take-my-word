import type { Language } from "@take-my-word/shared";
import { createSilenceGuard, defaultSilenceLevels } from "../../src/dictation/silence.ts";
import type { Connection, EvalResponse, ProviderCall } from "../../src/eval/contract.ts";
import type { TranscriptionCase } from "./fixtures.ts";
import type { LanguageMode } from "./fixtures.ts";
import {
  bestWordErrors,
  hallucinatedPhrases,
  inventedRunThreshold,
  languageIssue,
  mean,
  missedTerms,
  percentile,
  spread,
} from "./metrics.ts";

export interface TranscriptionResult {
  id: string;
  candidate: string;
  caseId: string;
  voice: string;
  mode: LanguageMode;
  run: number;
  connection: Connection;
  audioSeconds: number;
  levelDbfs: number;
  ok: boolean;
  text?: string;
  language?: Language;
  error?: EvalResponse["error"];
  calls: ProviderCall[];
  coldStart: boolean;
  region: string;
  memoryMb: number;
  listUsd: number;
  chargedUsd: number;
  at: string;
}

export interface AttemptFailure {
  id: string;
  status?: number;
}

export const caseIdOf = (itemId: string): string =>
  (itemId.split("|")[1] ?? "").split("/")[0] ?? "";

export function itemKey(id: string): { candidate: string; mode: LanguageMode; run: number } {
  const [candidate = "", , mode = "one", run = "0"] = id.split("|");
  return { candidate, mode: mode as LanguageMode, run: Number(run) };
}

export type GateFlag = "invented content" | "hallucination" | "wrong language";

export interface Checked {
  result: TranscriptionResult;
  item: TranscriptionCase;
  pasted: boolean;
  errors: number;
  words: number;
  missed: string[];
  terms: number;
  flags: GateFlag[];
  flipped: boolean;
  detail: string[];
}

const isSilence = createSilenceGuard();

export function check(result: TranscriptionResult, item: TranscriptionCase): Checked {
  const text = result.text ?? "";
  const quiet = result.levelDbfs < defaultSilenceLevels.speechLevelDbfs;
  const pasted =
    result.ok && result.levelDbfs >= defaultSilenceLevels.floorDbfs && !isSilence({ text, quiet });
  const flipped = result.ok && result.language !== item.language;
  if (item.kind === "noise") {
    return {
      result,
      item,
      pasted,
      errors: 0,
      words: 0,
      missed: [],
      terms: 0,
      flags: pasted ? ["hallucination"] : [],
      flipped: false,
      detail: pasted ? ["text survives the level and phrase guards"] : [],
    };
  }
  const references = [item.text, ...item.variants];
  const counted = bestWordErrors(references, pasted ? text : "");
  const missed = missedTerms(pasted ? text : "", item.terms);
  const flags: GateFlag[] = [];
  const detail: string[] = [];
  if (pasted) {
    if (counted.longestInsertionRun >= inventedRunThreshold) {
      flags.push("invented content");
      detail.push(`${String(counted.longestInsertionRun)} inserted words in a row`);
    }
    const phrases = hallucinatedPhrases(text, references);
    if (phrases.length > 0) {
      flags.push("hallucination");
      detail.push(`known hallucination: ${phrases.join(", ")}`);
    }
    const issue = languageIssue(text, item.language);
    if (issue !== undefined) {
      flags.push("wrong language");
      detail.push(issue);
    }
  }
  if (result.ok && !pasted) detail.push("dropped by the silence guard");
  return {
    result,
    item,
    pasted,
    errors: result.ok ? counted.errors : 0,
    words: result.ok ? counted.words : 0,
    missed: result.ok ? missed : [],
    terms: result.ok ? item.terms.length : 0,
    flags,
    flipped,
    detail,
  };
}

export interface LatencyStats {
  count: number;
  p50: number | undefined;
  p95: number | undefined;
}

export function latency(values: readonly number[]): LatencyStats {
  return { count: values.length, p50: percentile(values, 50), p95: percentile(values, 95) };
}

export const dictationMs = (result: TranscriptionResult): number =>
  result.calls.reduce((sum, call) => sum + call.ms, 0);

export const actualConnection = (result: TranscriptionResult): Connection =>
  (result.calls[0]?.newConnections ?? 0) > 0 ? "fresh" : "reused";

export interface ModeSummary {
  mode: LanguageMode;
  results: number;
  failed: number;
  attempts: number;
  failedAttempts: number;
  rateLimited: number;
  failureRate: number;
  failureRatePerRun: number[];
  wer: number;
  werPerRun: number[];
  termErrorRate: number;
  termErrorsPerRun: number[];
  missedTerms: number;
  terms: number;
  flips: number;
  speechResults: number;
  dropped: number;
  callsPerDictation: number;
  latencyByConnection: Record<Connection, LatencyStats>;
  latencyLongReused: LatencyStats;
  samplesByConnection: Record<Connection, number[]>;
}

export interface CandidateSummary {
  candidate: string;
  flags: Record<GateFlag, number>;
  flagged: Checked[];
  modes: Record<LanguageMode, ModeSummary>;
  regions: string[];
}

const rate = (numerator: number, denominator: number) =>
  denominator === 0 ? 0 : numerator / denominator;

export function summarize(
  candidate: string,
  checked: readonly Checked[],
  failures: readonly AttemptFailure[],
  longCaseIds: ReadonlySet<string>,
): CandidateSummary {
  const mine = checked.filter((entry) => entry.result.candidate === candidate);
  const myFailures = failures
    .map((failure) => ({ ...failure, ...itemKey(failure.id) }))
    .filter((failure) => failure.candidate === candidate);
  const flags: Record<GateFlag, number> = {
    "invented content": 0,
    hallucination: 0,
    "wrong language": 0,
  };
  for (const entry of mine) for (const flag of entry.flags) flags[flag] += 1;
  const modeSummary = (mode: LanguageMode): ModeSummary => {
    const inMode = mine.filter((entry) => entry.result.mode === mode);
    const speech = inMode.filter((entry) => entry.item.kind === "speech");
    const runs = [...new Set(inMode.map((entry) => entry.result.run))].sort((a, b) => a - b);
    const perRun = (measure: (entries: Checked[]) => number) =>
      runs.map((run) => measure(speech.filter((entry) => entry.result.run === run)));
    const werOf = (entries: Checked[]) =>
      rate(
        entries.reduce((sum, entry) => sum + entry.errors, 0),
        entries.reduce((sum, entry) => sum + entry.words, 0),
      );
    const termRateOf = (entries: Checked[]) =>
      rate(
        entries.reduce((sum, entry) => sum + entry.missed.length, 0),
        entries.reduce((sum, entry) => sum + entry.terms, 0),
      );
    const ok = inMode.filter((entry) => entry.result.ok);
    const failedInMode = myFailures.filter(
      (failure) => failure.mode === mode && failure.status !== 429,
    );
    const failureRateOf = (run?: number) => {
      const failed = failedInMode.filter((failure) => run === undefined || failure.run === run);
      const succeeded = ok.filter((entry) => run === undefined || entry.result.run === run);
      return rate(failed.length, failed.length + succeeded.length);
    };
    const samplesOf = (connection: Connection) =>
      ok
        .filter(
          (entry) =>
            entry.item.kind === "speech" &&
            !entry.result.coldStart &&
            actualConnection(entry.result) === connection,
        )
        .map((entry) => dictationMs(entry.result));
    const byConnection = (connection: Connection) =>
      latency(
        ok
          .filter((entry) => actualConnection(entry.result) === connection)
          .map((entry) => dictationMs(entry.result)),
      );
    return {
      mode,
      results: inMode.length,
      failed: inMode.length - ok.length,
      attempts: ok.length + failedInMode.length,
      failedAttempts: failedInMode.length,
      rateLimited: myFailures.filter((failure) => failure.mode === mode && failure.status === 429)
        .length,
      failureRate: failureRateOf(),
      failureRatePerRun: runs.map((run) => failureRateOf(run)),
      wer: werOf(speech),
      werPerRun: perRun(werOf),
      termErrorRate: termRateOf(speech),
      termErrorsPerRun: perRun(termRateOf),
      missedTerms: speech.reduce((sum, entry) => sum + entry.missed.length, 0),
      terms: speech.reduce((sum, entry) => sum + entry.terms, 0),
      flips: speech.filter((entry) => entry.flipped).length,
      speechResults: speech.length,
      dropped: speech.filter((entry) => entry.result.ok && !entry.pasted).length,
      callsPerDictation: mean(ok.map((entry) => entry.result.calls.length)),
      latencyByConnection: { fresh: byConnection("fresh"), reused: byConnection("reused") },
      latencyLongReused: latency(
        ok
          .filter(
            (entry) =>
              longCaseIds.has(entry.item.id) && actualConnection(entry.result) === "reused",
          )
          .map((entry) => dictationMs(entry.result)),
      ),
      samplesByConnection: { fresh: samplesOf("fresh"), reused: samplesOf("reused") },
    };
  };
  const regions = [
    ...new Set(
      mine.flatMap((entry) =>
        entry.result.calls
          .map((call) => call.headers["x-groq-region"])
          .filter((r) => r !== undefined),
      ),
    ),
  ];
  return {
    candidate,
    flags,
    flagged: mine.filter((entry) => entry.flags.length > 0),
    modes: { one: modeSummary("one"), both: modeSummary("both") },
    regions,
  };
}

export interface RelativeGate {
  passed: boolean;
  reasons: string[];
}

export function relativeGate(
  candidate: CandidateSummary,
  baseline: CandidateSummary,
): RelativeGate {
  const reasons: string[] = [];
  for (const mode of ["one", "both"] as const) {
    const mine = candidate.modes[mode];
    const base = baseline.modes[mode];
    const werAllowance = base.wer + spread(base.werPerRun);
    if (mine.wer > werAllowance) {
      reasons.push(
        `${mode}: WER ${pct(mine.wer)} above the baseline's ${pct(base.wer)} plus its run-to-run spread ${pct(spread(base.werPerRun))}`,
      );
    }
    const failureAllowance = base.failureRate + spread(base.failureRatePerRun);
    if (mine.failureRate > failureAllowance) {
      reasons.push(
        `${mode}: failed calls ${pct(mine.failureRate)} above the baseline's ${pct(base.failureRate)} plus its spread ${pct(spread(base.failureRatePerRun))}`,
      );
    }
  }
  return { passed: reasons.length === 0, reasons };
}

export const hardGatePassed = (summary: CandidateSummary): boolean =>
  Object.values(summary.flags).every((count) => count === 0);

export const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;

export interface TranscriptionBuckets {
  all: ReadonlyMap<string, CandidateSummary>;
  short: ReadonlyMap<string, CandidateSummary>;
  extended: ReadonlyMap<string, CandidateSummary>;
}

export function summarizeBuckets(
  candidates: readonly string[],
  checked: readonly Checked[],
  failures: readonly (AttemptFailure & { id: string })[],
  longCaseIds: ReadonlySet<string>,
  isExtended: (caseId: string) => boolean,
): TranscriptionBuckets {
  const bucket = (keep: (caseId: string) => boolean) =>
    new Map(
      candidates.map((candidate) => [
        candidate,
        summarize(
          candidate,
          checked.filter((entry) => keep(entry.item.id)),
          failures.filter((failure) => keep(caseIdOf(failure.id))),
          longCaseIds,
        ),
      ]),
    );
  return {
    all: bucket(() => true),
    short: bucket((caseId) => !isExtended(caseId)),
    extended: bucket(isExtended),
  };
}

export interface TranscriptionGate {
  hard: boolean;
  relative: RelativeGate;
}

export function transcriptionGate(
  candidate: string,
  baseline: string,
  buckets: TranscriptionBuckets,
  extendedName: string,
): TranscriptionGate | undefined {
  const all = buckets.all.get(candidate);
  const base = buckets.all.get(baseline);
  if (
    all === undefined ||
    base === undefined ||
    all.modes.one.results + all.modes.both.results === 0
  )
    return undefined;
  const hard = hardGatePassed(all);
  if (candidate === baseline) return { hard, relative: { passed: true, reasons: [] } };
  const reasons = [...relativeGate(all, base).reasons];
  const extended = buckets.extended.get(candidate);
  const extendedBase = buckets.extended.get(baseline);
  if (
    extended !== undefined &&
    extendedBase !== undefined &&
    extended.modes.one.results + extended.modes.both.results > 0
  ) {
    reasons.push(
      ...relativeGate(extended, extendedBase).reasons.map((reason) => `${extendedName}, ${reason}`),
    );
  }
  return { hard, relative: { passed: reasons.length === 0, reasons } };
}
