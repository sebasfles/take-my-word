import type { Clip, TranscriptionFixtures } from "./fixtures.ts";
import { pct } from "./transcription-analysis.ts";
import {
  chooseDefault,
  comparePolicy,
  gapCounts,
  gapThresholdsMs,
  policyId,
  spansOf,
  type ClipCuts,
  type SegmentedResult,
} from "./segmentation-analysis.ts";
import { spread } from "./metrics.ts";

export interface SegmentationReportInput {
  command: string;
  generatedAt: string;
  codeCommit: string;
  runs: number;
  transcriber: string;
  prompted: boolean;
  noiseDbfs?: number;
  promptTokenBudget: number;
  chargedUsd: number;
  planNotes: string[];
  fixtures: TranscriptionFixtures;
  clips: readonly Clip[];
  cuts: readonly ClipCuts[];
  policies: readonly string[];
  results: readonly SegmentedResult[];
}

const seconds = (ms: number) => (ms / 1000).toFixed(1);

export function segmentationReport(input: SegmentationReportInput): string {
  const items = new Map(input.fixtures.cases.map((item) => [item.id, item]));
  const comparisons = input.policies.map((policy) =>
    comparePolicy(policy, input.results, items, input.cuts),
  );
  const chosen = chooseDefault(comparisons);
  const lines = [
    "# Segmentation quality gate",
    "",
    `Generated ${input.generatedAt} by \`${input.command}\` on code \`${input.codeCommit}\`.`,
    `${String(input.runs)} runs of ${String(input.clips.length)} clips (the extended samples, every voice), each language setting, transcribed whole and segment by segment with ${input.transcriber}.`,
    `Cuts come from the desktop's detector as a session makes them with no request in flight; later segments use the first segment's language, and segments go through the level floor and the silence guard.`,
    input.prompted
      ? `Each segment is prompted with today's terms plus the previous raw text's tail within ${String(input.promptTokenBudget)} bytes.`
      : `${input.transcriber} takes no prompt, so its segments carry neither the terms nor the previous text.`,
    input.noiseDbfs === undefined
      ? "The clips are the fixtures as Polly speaks them, with digital silence between words."
      : `White noise at ${String(input.noiseDbfs)} dBFS is added to every clip, like a microphone's floor, before cutting and transcribing both arms.`,
    `Spend charged: ${input.chargedUsd.toFixed(3)} USD.`,
    ...input.planNotes,
    "",
    "## Verdict",
    "",
    chosen === undefined
      ? "Neither policy passes on this set."
      : `Better passing policy on this set: ${chosen}.`,
    "",
    ...comparisons.map(
      (comparison) =>
        `- ${comparison.policy}: ${comparison.passed ? "pass" : comparison.reasons.join("; ")}`,
    ),
    "",
    "Gate: WER away from the cuts and term errors within the whole take's value plus its run-to-run spread, per language setting; no more hard-gate flags or failed takes than the whole take.",
    "Words within two words of a cut are counted apart, for both arms, in the same places.",
    "",
    "## Quality",
    "",
    "| Policy | Languages | WER whole | WER segmented | Away from cuts, whole (spread) | Away from cuts, segmented | Boundary errors whole | Boundary errors segmented | Term errors whole | Term errors segmented | Flags whole / segmented |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...comparisons.flatMap((comparison) =>
      (["one", "both"] as const).map((mode) => {
        const { segmented, whole } = comparison.modes[mode];
        return `| ${comparison.policy} | ${mode} | ${pct(whole.wer)} | ${pct(segmented.wer)} | ${pct(whole.outsideWer)} (${pct(spread(whole.outsideWerPerRun))}) | ${pct(segmented.outsideWer)} | ${String(whole.windowErrors)} of ${String(whole.windowWords)} | ${String(segmented.windowErrors)} of ${String(segmented.windowWords)} | ${pct(whole.termErrorRate)} | ${pct(segmented.termErrorRate)} | ${String(whole.flags)} / ${String(segmented.flags)} |`;
      }),
    ),
    "",
    "## Prompt split",
    "",
    "| Policy | Languages | Segments sent | Terms bytes per segment | Previous text bytes, mean | Previous text bytes, max |",
    "|---|---|---|---|---|---|",
    ...comparisons.flatMap((comparison) =>
      (["one", "both"] as const).map((mode) => {
        const { segmented } = comparison.modes[mode];
        return `| ${comparison.policy} | ${mode} | ${String(segmented.segments)} | ${segmented.termsTokens.toFixed(0)} | ${segmented.tailTokensMean.toFixed(0)} | ${String(segmented.tailTokensMax)} |`;
      }),
    ),
    "",
    "## Pauses in the samples",
    "",
    "Quiet runs as the detector classifies its levels, counted over every clip.",
    "",
    `| Clips | Minutes | ${gapThresholdsMs.map((ms) => `${String(ms)} ms or more`).join(" | ")} |`,
    `|---|---|${gapThresholdsMs.map(() => "---").join("|")}|`,
    (() => {
      const counted = gapCounts(input.cuts);
      return `| ${String(counted.clips)} | ${counted.minutes.toFixed(1)} | ${gapThresholdsMs
        .map(
          (ms) =>
            `${String(counted.atLeast[ms])} (${(counted.atLeast[ms] / counted.minutes).toFixed(1)} per minute)`,
        )
        .join(" | ")} |`;
    })(),
    "",
    "## Cuts",
    "",
    "| Clip | Seconds | Policy | Cuts at (s) | Pause cuts | Forced cuts | Spans without speech |",
    "|---|---|---|---|---|---|---|",
    ...input.cuts.map((entry) => {
      const spans = spansOf(entry.cuts, entry.audioMs);
      return `| ${entry.id} | ${seconds(entry.audioMs)} | ${policyId(entry.policy)} | ${entry.cuts.map((cut) => seconds(cut.atMs)).join(", ")} | ${String(entry.cuts.filter((cut) => cut.pause).length)} | ${String(entry.cuts.filter((cut) => !cut.pause).length)} | ${String(spans.filter((span) => !span.spoken).length)} |`;
    }),
    "",
  ];
  return lines.join("\n");
}
