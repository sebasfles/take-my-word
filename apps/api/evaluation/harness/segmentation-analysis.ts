import type { TranscriptionCase } from "./fixtures.ts";
import type { LanguageMode } from "./fixtures.ts";
import { align, mean, missedTerms, recognitionTokens, spread } from "./metrics.ts";
import { check, pct, type TranscriptionResult } from "./transcription-analysis.ts";

export interface SegmentPolicy {
  enabled: boolean;
  minSeconds: number;
  maxSeconds: number;
  pauseMs: number;
}

export interface CutPoint {
  atMs: number;
  spoken: boolean;
  pause: boolean;
}

export interface ClipCuts {
  id: string;
  policy: SegmentPolicy;
  audioMs: number;
  cuts: CutPoint[];
  gapsMs: number[];
}

export const policyId = (policy: Pick<SegmentPolicy, "minSeconds" | "maxSeconds">): string =>
  `${String(policy.minSeconds)}/${String(policy.maxSeconds)}`;

export const wholeArm = "whole";

export interface Span {
  startMs: number;
  endMs: number;
  spoken: boolean;
  last: boolean;
}

export function spansOf(cuts: readonly CutPoint[], audioMs: number): Span[] {
  const spans: Span[] = [];
  let startMs = 0;
  for (const cut of cuts) {
    spans.push({ startMs, endMs: cut.atMs, spoken: cut.spoken, last: false });
    startMs = cut.atMs;
  }
  spans.push({ startMs, endMs: audioMs, spoken: true, last: true });
  return spans;
}

const wavHeaderBytes = 44;
const bytesPerMs = 32;

export function sliceWav(wav: Buffer, startMs: number, endMs: number): Buffer {
  const pcm = wav.subarray(wavHeaderBytes);
  const slice = pcm.subarray(
    Math.min(pcm.length, startMs * bytesPerMs),
    Math.min(pcm.length, endMs * bytesPerMs),
  );
  const header = Buffer.from(wav.subarray(0, wavHeaderBytes));
  header.writeUInt32LE(36 + slice.length, 4);
  header.writeUInt32LE(slice.length, 40);
  return Buffer.concat([header, slice]);
}

export interface SegmentRecord {
  startMs: number;
  endMs: number;
  text: string;
  language?: string;
  termsTokens: number;
  tailTokens: number;
  calls: number;
  skipped?: "unspoken" | "silence" | "short";
}

export interface SegmentedResult extends TranscriptionResult {
  arm: string;
  segments: SegmentRecord[];
}

export interface Attribution {
  words: number;
  errors: number;
  windowWords: number;
  windowErrors: number;
}

function errorPositions(reference: readonly string[], hypothesis: readonly string[]) {
  const ops = align(reference, hypothesis);
  const anchors: number[] = [];
  const substitutedOrDeleted: number[] = [];
  const insertedAt: number[] = [];
  let ref = 0;
  for (const op of ops) {
    if (op === "=" || op === "S") {
      anchors.push(ref);
      if (op === "S") substitutedOrDeleted.push(ref);
      ref += 1;
    } else if (op === "D") {
      substitutedOrDeleted.push(ref);
      ref += 1;
    } else {
      anchors.push(ref);
      insertedAt.push(ref);
    }
  }
  return { anchors, substitutedOrDeleted, insertedAt };
}

export function boundaryWindows(
  reference: string,
  segmentTexts: readonly string[],
  radius = 2,
): Set<number> {
  const refTokens = recognitionTokens(reference);
  const perSegment = segmentTexts.map((text) => recognitionTokens(text));
  const { anchors } = errorPositions(refTokens, perSegment.flat());
  const windows = new Set<number>();
  let offset = 0;
  for (const [index, tokens] of perSegment.entries()) {
    if (index > 0 && tokens.length > 0 && offset > 0) {
      const boundary = anchors[offset] ?? refTokens.length;
      for (let ref = boundary - radius; ref < boundary + radius; ref += 1) {
        if (ref >= 0 && ref < refTokens.length) windows.add(ref);
      }
    }
    offset += tokens.length;
  }
  return windows;
}

export function attribute(
  reference: string,
  hypothesis: string,
  windows: ReadonlySet<number>,
): Attribution {
  const refTokens = recognitionTokens(reference);
  const { substitutedOrDeleted, insertedAt } = errorPositions(
    refTokens,
    recognitionTokens(hypothesis),
  );
  const inWindow = (ref: number) => windows.has(ref) || windows.has(ref - 1);
  const windowErrors =
    substitutedOrDeleted.filter((ref) => windows.has(ref)).length +
    insertedAt.filter(inWindow).length;
  return {
    words: refTokens.length,
    errors: substitutedOrDeleted.length + insertedAt.length,
    windowWords: windows.size,
    windowErrors,
  };
}

export interface ArmModeSummary {
  results: number;
  failed: number;
  wer: number;
  werPerRun: number[];
  outsideWer: number;
  outsideWerPerRun: number[];
  windowErrors: number;
  windowWords: number;
  termErrorRate: number;
  termErrorsPerRun: number[];
  flags: number;
  segments: number;
  pauseCuts: number;
  forcedCuts: number;
  skippedSpans: number;
  termsTokens: number;
  tailTokensMean: number;
  tailTokensMax: number;
}

export interface PolicyComparison {
  policy: string;
  modes: Record<LanguageMode, { segmented: ArmModeSummary; whole: ArmModeSummary }>;
  passed: boolean;
  reasons: string[];
}

const rate = (numerator: number, denominator: number) =>
  denominator === 0 ? 0 : numerator / denominator;

const keyOf = (result: TranscriptionResult) =>
  `${result.caseId}/${result.voice}|${result.mode}|${String(result.run)}`;

function summarizeArm(
  results: readonly SegmentedResult[],
  items: ReadonlyMap<string, TranscriptionCase>,
  windowsOf: (result: SegmentedResult) => ReadonlySet<number>,
  cutsOf: (result: SegmentedResult) => ClipCuts | undefined,
): ArmModeSummary {
  const runs = [...new Set(results.map((result) => result.run))].sort((a, b) => a - b);
  const entries = results.flatMap((result) => {
    const item = items.get(result.caseId);
    if (item === undefined || item.kind !== "speech") return [];
    const checked = check(result, item);
    const counted = result.ok
      ? attribute(item.text, checked.pasted ? (result.text ?? "") : "", windowsOf(result))
      : undefined;
    return [{ result, item, checked, counted }];
  });
  const ok = entries.filter((entry) => entry.counted !== undefined);
  const werOf = (subset: typeof ok) =>
    rate(
      subset.reduce((sum, entry) => sum + (entry.counted?.errors ?? 0), 0),
      subset.reduce((sum, entry) => sum + (entry.counted?.words ?? 0), 0),
    );
  const outsideOf = (subset: typeof ok) =>
    rate(
      subset.reduce(
        (sum, entry) =>
          sum + (entry.counted ? entry.counted.errors - entry.counted.windowErrors : 0),
        0,
      ),
      subset.reduce(
        (sum, entry) => sum + (entry.counted ? entry.counted.words - entry.counted.windowWords : 0),
        0,
      ),
    );
  const termsOf = (subset: typeof ok) =>
    rate(
      subset.reduce(
        (sum, entry) => sum + missedTerms(entry.result.text ?? "", entry.item.terms).length,
        0,
      ),
      subset.reduce((sum, entry) => sum + entry.item.terms.length, 0),
    );
  const inRun = (run: number) => ok.filter((entry) => entry.result.run === run);
  const segmentRecords = ok.flatMap((entry) => entry.result.segments);
  const sent = segmentRecords.filter((segment) => segment.calls > 0);
  const cutLists = ok.map((entry) => cutsOf(entry.result)?.cuts ?? []);
  return {
    results: entries.length,
    failed: entries.length - ok.length,
    wer: werOf(ok),
    werPerRun: runs.map((run) => werOf(inRun(run))),
    outsideWer: outsideOf(ok),
    outsideWerPerRun: runs.map((run) => outsideOf(inRun(run))),
    windowErrors: ok.reduce((sum, entry) => sum + (entry.counted?.windowErrors ?? 0), 0),
    windowWords: ok.reduce((sum, entry) => sum + (entry.counted?.windowWords ?? 0), 0),
    termErrorRate: termsOf(ok),
    termErrorsPerRun: runs.map((run) => termsOf(inRun(run))),
    flags: ok.reduce((sum, entry) => sum + entry.checked.flags.length, 0),
    segments: sent.length,
    pauseCuts: cutLists.reduce((sum, cuts) => sum + cuts.filter((cut) => cut.pause).length, 0),
    forcedCuts: cutLists.reduce((sum, cuts) => sum + cuts.filter((cut) => !cut.pause).length, 0),
    skippedSpans: segmentRecords.filter((segment) => segment.skipped !== undefined).length,
    termsTokens: mean(sent.map((segment) => segment.termsTokens)),
    tailTokensMean: mean(sent.map((segment) => segment.tailTokens)),
    tailTokensMax: Math.max(0, ...sent.map((segment) => segment.tailTokens)),
  };
}

export function comparePolicy(
  policy: string,
  results: readonly SegmentedResult[],
  items: ReadonlyMap<string, TranscriptionCase>,
  cuts: readonly ClipCuts[],
): PolicyComparison {
  const segmented = results.filter((result) => result.arm === policy);
  const wholes = results.filter((result) => result.arm === wholeArm);
  const windows = new Map<string, Set<number>>();
  for (const result of segmented) {
    const item = items.get(result.caseId);
    if (item?.kind !== "speech" || !result.ok) continue;
    windows.set(
      keyOf(result),
      boundaryWindows(
        item.text,
        result.segments.map((segment) => segment.text),
      ),
    );
  }
  const windowsOf = (result: SegmentedResult) => windows.get(keyOf(result)) ?? new Set<number>();
  const cutsOf = (result: SegmentedResult) =>
    cuts.find(
      (entry) =>
        entry.id === `${result.caseId}/${result.voice}` && policyId(entry.policy) === policy,
    );
  const reasons: string[] = [];
  const modes = Object.fromEntries(
    (["one", "both"] as const).map((mode) => {
      const mine = summarizeArm(
        segmented.filter((result) => result.mode === mode),
        items,
        windowsOf,
        cutsOf,
      );
      const base = summarizeArm(
        wholes.filter((result) => result.mode === mode),
        items,
        windowsOf,
        () => undefined,
      );
      const werAllowance = base.outsideWer + spread(base.outsideWerPerRun);
      if (mine.outsideWer > werAllowance) {
        reasons.push(
          `${mode}: WER away from the cuts ${pct(mine.outsideWer)} above the whole take's ${pct(base.outsideWer)} plus its run-to-run spread ${pct(spread(base.outsideWerPerRun))}`,
        );
      }
      const termAllowance = base.termErrorRate + spread(base.termErrorsPerRun);
      if (mine.termErrorRate > termAllowance) {
        reasons.push(
          `${mode}: term errors ${pct(mine.termErrorRate)} above the whole take's ${pct(base.termErrorRate)} plus its spread ${pct(spread(base.termErrorsPerRun))}`,
        );
      }
      if (mine.flags > base.flags) {
        reasons.push(
          `${mode}: ${String(mine.flags)} hard-gate flags against the whole take's ${String(base.flags)}`,
        );
      }
      if (mine.failed > base.failed) {
        reasons.push(
          `${mode}: ${String(mine.failed)} failed takes against the whole take's ${String(base.failed)}`,
        );
      }
      return [mode, { segmented: mine, whole: base }];
    }),
  ) as PolicyComparison["modes"];
  return { policy, modes, passed: reasons.length === 0, reasons };
}

export function chooseDefault(comparisons: readonly PolicyComparison[]): string | undefined {
  const passing = comparisons.filter((comparison) => comparison.passed);
  const meanWer = (comparison: PolicyComparison) =>
    mean([comparison.modes.one.segmented.wer, comparison.modes.both.segmented.wer]);
  const [first, ...rest] = [...passing].sort((a, b) => meanWer(a) - meanWer(b));
  if (first === undefined) return undefined;
  const allowance = mean(
    (["one", "both"] as const).map((mode) => spread(first.modes[mode].whole.werPerRun)),
  );
  const shortest = [first, ...rest]
    .filter((comparison) => meanWer(comparison) <= meanWer(first) + allowance)
    .sort((a, b) => Number(a.policy.split("/")[0] ?? 0) - Number(b.policy.split("/")[0] ?? 0))[0];
  return (shortest ?? first).policy;
}

export const gapThresholdsMs = [400, 600, 800] as const;

export interface GapCount {
  clips: number;
  minutes: number;
  atLeast: Record<(typeof gapThresholdsMs)[number], number>;
}

export function gapCounts(cuts: readonly ClipCuts[]): GapCount {
  const clips = [...new Map(cuts.map((entry) => [entry.id, entry])).values()];
  const gaps = clips.flatMap((entry) => entry.gapsMs);
  return {
    clips: clips.length,
    minutes: clips.reduce((sum, entry) => sum + entry.audioMs, 0) / 60_000,
    atLeast: Object.fromEntries(
      gapThresholdsMs.map((threshold) => [
        threshold,
        gaps.filter((gap) => gap >= threshold).length,
      ]),
    ) as GapCount["atLeast"],
  };
}
