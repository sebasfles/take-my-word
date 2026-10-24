import { chainedTranscribers, type RefinerCandidate } from "./candidates.ts";
import {
  cleanupGate,
  type CleanupBuckets,
  type CleanupChecked,
  type CleanupSummary,
} from "./cleanup-analysis.ts";
import type { CleanupFixtures } from "./cleanup-fixtures.ts";
import { extendedBucket } from "./fixtures.ts";
import { modelFacts, notServed, pricesCheckedFor } from "./prices.ts";
import type { FailureRecord } from "./suite.ts";
import { isProviderFailure, itemKey, pct, type LatencyStats } from "./transcription-analysis.ts";

export interface CleanupRunContext {
  command: string;
  planNotes: string[];
  generatedAt: string;
  codeCommit: string;
  fixturesSha256: string;
  functionName: string;
  memoryMb: string;
  region: string;
  runs: number;
  listUsd: number;
  chargedUsd: number;
  failedAttempts: FailureRecord[];
}

const ms = (value: number | undefined) =>
  value === undefined ? "n/a" : `${String(Math.round(value))} ms`;
const stat = (stats: LatencyStats) =>
  stats.count === 0 ? "n/a" : `${ms(stats.p50)} / ${ms(stats.p95)} (${String(stats.count)})`;

function qualityRows(
  candidates: readonly RefinerCandidate[],
  summaries: ReadonlyMap<string, CleanupSummary>,
): string[] {
  const rows = [
    "| Candidate | Outputs | Exact | New words | Meaning changes | Fillers removed | Punctuation | Dictionary terms wrong | Style followed | Failed calls | Rate limited |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const candidate of candidates) {
    const s = summaries.get(candidate.id);
    if (s === undefined || s.results === 0) continue;
    rows.push(
      `| ${candidate.id} | ${String(s.okResults)} | ${pct(s.exactRate)} | ${pct(s.newWordRate)} | ${pct(s.meaningChangeRate)} (${s.meaningChangesPerRun.map(pct).join(", ")}) | ${pct(s.fillerRemovalRate)} | ${pct(s.punctuationRate)} | ${pct(s.termErrorRate)} | ${pct(s.styleRate)} | ${String(s.failedAttempts)}/${String(s.attempts)} (${pct(s.failureRate)}) | ${String(s.rateLimited)} |`,
    );
  }
  return rows;
}

export function cleanupReport(
  context: CleanupRunContext,
  fixtures: CleanupFixtures,
  candidates: readonly RefinerCandidate[],
  buckets: CleanupBuckets,
  checked: readonly CleanupChecked[],
): string {
  const lines: string[] = [];
  const push = (...more: string[]) => lines.push(...more);
  const summaries = buckets.all;
  const baseline = candidates.find((candidate) => candidate.baseline);
  const gateOf = (id: string) =>
    baseline === undefined ? undefined : cleanupGate(id, baseline.id, buckets, extendedBucket);
  const relativeOf = (candidate: RefinerCandidate) =>
    candidate.baseline ? "baseline" : gateOf(candidate.id)?.relative.reasons.join("; ") || "pass";
  const round1Cases = fixtures.cases.filter((item) => item.chain === undefined).length;
  const chainedCount = fixtures.cases.length - round1Cases;

  push("# Cleanup evaluation", "");
  push(
    `Generated ${context.generatedAt} from code commit \`${context.codeCommit}\` and fixtures sha256 \`${context.fixturesSha256.slice(0, 16)}\`.`,
    `Every call ran inside the dev eval Lambda \`${context.functionName}\` (${context.region}, ${context.memoryMb} MB, arm64) through the production adapters, with production's \`refinerInstructions\` for the case's language, style and fixture dictionary, unchanged for every model; ${String(context.runs)} runs per case, run 1 on a fresh connection.`,
    "Latency is the whole non-streamed call, as production makes it.",
    `Cases: round 1's ${String(round1Cases)} plus ${String(chainedCount)} chained raws, which suite 1's run 1 of ${chainedTranscribers.join(", ")} produced for each speech case (first voice, the case's own language, identical raws counted once), checked against that case's expected text and terms.`,
    `Prices as checked on ${pricesCheckedFor(candidates.map((candidate) => candidate.spec.model))}; this run's calls cost ${context.listUsd.toFixed(3)} USD at list price, ${context.chargedUsd.toFixed(3)} USD charged (Groq on its free plan unless noted below, prepaid balances at list price).`,
    ...context.planNotes.map((note) => `${note}.`),
    `Reproduce from the repository root: \`${context.command}\`.`,
    "",
  );

  push("## Candidates", "");
  push(
    "| Candidate | Setting | Provider | List price in / out per 1M | Retires | Hard gate | Relative gate |",
    "|---|---|---|---|---|---|---|",
  );
  for (const candidate of candidates) {
    const summary = summaries.get(candidate.id);
    const facts = modelFacts(candidate.spec.model);
    const price =
      facts.price.kind === "tokens"
        ? `${String(facts.price.usdPerMillionInput)} / ${String(facts.price.usdPerMillionOutput)} USD`
        : "";
    const tuning = [
      candidate.spec.reasoningEffort && `effort ${candidate.spec.reasoningEffort}`,
      candidate.spec.temperature !== undefined &&
        `temperature ${String(candidate.spec.temperature)}`,
    ]
      .filter(Boolean)
      .join(", ");
    const gate = gateOf(candidate.id);
    const hard =
      summary === undefined || gate === undefined ? "not measured" : gate.hard ? "pass" : "FAIL";
    const relative =
      gate === undefined
        ? "n/a"
        : candidate.baseline
          ? "baseline"
          : gate.relative.passed
            ? "pass"
            : "FAIL";
    push(
      `| ${candidate.id}${candidate.baseline ? " (today)" : ""} | ${candidate.setting}${tuning ? ` (${tuning})` : ""} | ${facts.provider} | ${price} | ${facts.retires?.on ?? ""} | ${hard} | ${relative} |`,
    );
  }
  push("", "Not measured:", "");
  for (const model of notServed) {
    push(`- ${model.provider} \`${model.model}\`: ${model.reason} ([source](${model.source})).`);
  }
  push("");

  push("## Quality gate", "");
  push(
    "Hard gate, any occurrence in any case fails: invented content (3 or more words in a row that are in neither the raw transcript, the expected texts nor the case's allowed words, accents folded) and wrong language (reads as the other language, letters outside the Latin script, or Latin text that reads as neither es nor en).",
    `Relative gate against \`gpt-5.4-nano\` as production calls it: meaning changes (a required word missing or a forbidden word present), outputs with any single new word, dictionary term errors and failed calls, no worse than the baseline plus its run-to-run spread, on round 1's cases and again on the chained raws of the ${extendedBucket} samples alone.`,
    "",
  );
  push("| Candidate | Invented content | Wrong language | Relative gate |", "|---|---|---|---|");
  for (const candidate of candidates) {
    const summary = summaries.get(candidate.id);
    if (summary === undefined) continue;
    push(
      `| ${candidate.id} | ${String(summary.flags["invented content"])} | ${String(summary.flags["wrong language"])} | ${relativeOf(candidate)} |`,
    );
  }
  push("");

  push("## Quality on round 1's cases", "");
  push(...qualityRows(candidates, buckets.round1), "");

  push("## Quality on each transcriber's raws", "");
  push(
    "The chained raws of one transcriber; a combination's meaning changes and term errors in the summary come from these rows.",
    "",
  );
  for (const transcriber of chainedTranscribers) {
    push(`### ${transcriber}`, "", ...qualityRows(candidates, buckets.chainedBy(transcriber)), "");
  }

  push(`## Quality on the ${extendedBucket} samples`, "");
  push(...qualityRows(candidates, buckets.extended), "");

  push("## Latency inside us-east-1 and cost", "");
  push(
    "Whole call, P50 / P95 (samples); fresh means the call opened a new TLS connection. Tokens are the median per call; cost is the mean list price per call, about one dictation.",
    "",
  );
  push(
    "| Candidate | Fresh connection | Reused connection | Input tokens | Output tokens | Per dictation |",
    "|---|---|---|---|---|---|",
  );
  for (const candidate of candidates) {
    const s = summaries.get(candidate.id);
    if (s === undefined) continue;
    push(
      `| ${candidate.id} | ${stat(s.latencyByConnection.fresh)} | ${stat(s.latencyByConnection.reused)} | ${String(s.inputTokensP50 ?? "n/a")} | ${String(s.outputTokensP50 ?? "n/a")} | ${s.listUsdPerCall.toFixed(6)} USD |`,
    );
  }
  push("");

  push("## Failed calls", "");
  if (context.failedAttempts.length === 0) push("None.", "");
  else {
    const counts = new Map<string, number>();
    for (const failure of context.failedAttempts) {
      const key = `${itemKey(failure.id).candidate}: ${failure.status === undefined ? failure.message : String(failure.status)}${isProviderFailure(failure) ? "" : " (the harness's own call to the eval Lambda, not a provider answer; not counted as a failed call)"}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const [key, count] of counts) push(`- ${key}, ${String(count)} attempts`);
    push("");
  }

  push("## Every output that is not an expected text", "");
  push("Grouped per case and candidate; identical outputs are counted once.", "");
  for (const item of fixtures.cases) {
    const entries = checked.filter((entry) => entry.item.id === item.id && !entry.exact);
    if (entries.length === 0) continue;
    push(
      `### ${item.id} (${item.language}, ${item.style})`,
      "",
      `Raw: ${item.raw}`,
      "",
      `Expected: ${item.expected.join(" | ")}`,
      "",
    );
    const groups = new Map<string, { count: number; entry: CleanupChecked }>();
    for (const entry of entries) {
      const key = `${entry.result.candidate}|${entry.result.ok ? (entry.result.text ?? "") : `error ${entry.result.error?.message ?? ""}`}`;
      const group = groups.get(key) ?? { count: 0, entry };
      group.count += 1;
      groups.set(key, group);
    }
    for (const { count, entry } of groups.values()) {
      const r = entry.result;
      const notes = [
        ...entry.flags.map((flag) => `**${flag}**`),
        ...(entry.newWords.length > 0 ? [`new words: ${entry.newWords.join(", ")}`] : []),
        ...entry.missingRequired.map((word) => `lost "${word}"`),
        ...entry.presentForbidden.map((word) => `has "${word}"`),
        ...entry.fillersLeft.map((word) => `filler "${word}" left`),
        ...entry.termsWrong.map((term) => `term "${term}" not as written`),
        ...entry.punctuationIssues,
        ...entry.styleIssues.map((issue) => `style: ${issue}`),
      ];
      const said = r.ok ? `"${r.text ?? ""}"` : `failed: ${r.error?.message ?? ""}`;
      push(
        `- ${r.candidate}, ${String(count)}x: ${said}${notes.length > 0 ? ` (${notes.join("; ")})` : ""}`,
      );
    }
    push("");
  }
  return `${lines.join("\n")}\n`;
}
