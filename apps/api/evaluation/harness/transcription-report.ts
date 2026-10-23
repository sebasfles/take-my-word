import type { TranscriberCandidate } from "./candidates.ts";
import type { TranscriptionFixtures } from "./fixtures.ts";
import { mean } from "./metrics.ts";
import { modelFacts, notServed, pricesCheckedOn, transcriptionCallUsd } from "./prices.ts";
import type { FailureRecord } from "./suite.ts";
import {
  actualConnection,
  hardGatePassed,
  itemKey,
  pct,
  relativeGate,
  type CandidateSummary,
  type Checked,
  type LatencyStats,
} from "./transcription-analysis.ts";

export interface RunContext {
  command: string;
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

export const normalDictationSeconds = 15;

const ms = (value: number | undefined) =>
  value === undefined ? "n/a" : `${String(Math.round(value))} ms`;
const stat = (stats: LatencyStats) =>
  stats.count === 0 ? "n/a" : `${ms(stats.p50)} / ${ms(stats.p95)} (${String(stats.count)})`;
const usd = (value: number) => `${value.toFixed(5)} USD`;

export function usdPerAudioSecond(
  candidate: TranscriberCandidate,
  checked: readonly Checked[],
): number | undefined {
  const facts = modelFacts(candidate.spec.model);
  if (facts.price.kind === "duration") return facts.price.usdPerMinute / 60;
  const measured = checked
    .map((entry) => entry.result)
    .filter((result) => result.candidate === candidate.id && result.ok && result.calls.length > 0)
    .map((result) => result.listUsd / (result.audioSeconds * result.calls.length));
  return measured.length === 0 ? undefined : mean(measured);
}

export function dictationCostUsd(
  candidate: TranscriberCandidate,
  checked: readonly Checked[],
  calls: number,
): number | undefined {
  const facts = modelFacts(candidate.spec.model);
  if (facts.price.kind === "duration") {
    return transcriptionCallUsd(facts, normalDictationSeconds) * calls;
  }
  const perSecond = usdPerAudioSecond(candidate, checked);
  return perSecond === undefined ? undefined : perSecond * normalDictationSeconds * calls;
}

export function transcriptionReport(
  context: RunContext,
  fixtures: TranscriptionFixtures,
  candidates: readonly TranscriberCandidate[],
  summaries: ReadonlyMap<string, CandidateSummary>,
  checked: readonly Checked[],
): string {
  const lines: string[] = [];
  const push = (...more: string[]) => lines.push(...more);
  const baseline = candidates.find((candidate) => candidate.baseline);
  const baselineSummary = baseline && summaries.get(baseline.id);

  push("# Transcription evaluation", "");
  push(
    `Generated ${context.generatedAt} from code commit \`${context.codeCommit}\` and fixtures sha256 \`${context.fixturesSha256.slice(0, 16)}\`.`,
    `Every provider call ran inside the dev eval Lambda \`${context.functionName}\` (${context.region}, ${context.memoryMb} MB, arm64), through the production adapters and production's \`transcribeIn\`, ${String(context.runs)} runs per clip and language setting; run 1 opens a fresh connection, later runs reuse the Lambda's kept-alive one.`,
    `Clips are Polly neural speech generated at run time (voices ${[...new Set([...fixtures.voices.es, ...fixtures.voices.en, ...fixtures.voices.mixed])].join(", ")}) and seeded noise; every candidate got the same bytes and the transcriber prompt of the case's fixture dictionary.`,
    `"one" sends the case's language; "both" lets the transcriber detect among es and en and transcribes again in es when it reports neither, as production does.`,
    `Prices and plans as checked on ${pricesCheckedOn}; this run's calls cost ${context.listUsd.toFixed(3)} USD at list price, ${context.chargedUsd.toFixed(3)} USD charged (Groq on its free plan).`,
    `Reproduce: \`${context.command}\`.`,
    "",
  );

  push("## Candidates", "");
  push(
    "| Candidate | Provider | List price | Retires | Hard gate | Relative gate |",
    "|---|---|---|---|---|---|",
  );
  for (const candidate of candidates) {
    const summary = summaries.get(candidate.id);
    const facts = modelFacts(candidate.spec.model);
    const price =
      facts.price.kind === "duration"
        ? `${(facts.price.usdPerMinute * 60).toFixed(3)} USD/h${facts.price.minimumBilledSeconds > 0 ? `, ${String(facts.price.minimumBilledSeconds)} s minimum` : ""}`
        : facts.price.kind === "audio-tokens"
          ? `${String(facts.price.usdPerMillionInput)} / ${String(facts.price.usdPerMillionOutput)} USD per 1M audio tokens in / out`
          : "";
    const hard = summary === undefined ? "not measured" : hardGatePassed(summary) ? "pass" : "FAIL";
    const relative =
      summary === undefined || baselineSummary === undefined
        ? "n/a"
        : candidate.baseline
          ? "baseline"
          : relativeGate(summary, baselineSummary).passed
            ? "pass"
            : "FAIL";
    push(
      `| ${candidate.id}${candidate.baseline ? " (today)" : ""} | ${facts.provider} | ${price} | ${facts.retires?.on ?? ""} | ${hard} | ${relative} |`,
    );
  }
  push("", "Not measured:", "");
  for (const model of notServed)
    push(`- ${model.provider} \`${model.model}\`: ${model.reason} ([source](${model.source})).`);
  push("");

  push("## Quality gate", "");
  push(
    "Hard gate, any occurrence fails: invented content (3 or more inserted words in a row), a known hallucination phrase or any text on noise that survives production's level and phrase guards, and text that reads as the other language.",
    "Relative gate: WER and domain-term errors no worse than today's model plus its run-to-run spread, per language setting.",
    "",
  );
  push(
    "| Candidate | Invented content | Hallucination | Wrong language | Relative gate |",
    "|---|---|---|---|---|",
  );
  for (const candidate of candidates) {
    const summary = summaries.get(candidate.id);
    if (summary === undefined) continue;
    const relative =
      baselineSummary === undefined || candidate.baseline
        ? "baseline"
        : relativeGate(summary, baselineSummary).reasons.join("; ") || "pass";
    push(
      `| ${candidate.id} | ${String(summary.flags["invented content"])} | ${String(summary.flags.hallucination)} | ${String(summary.flags["wrong language"])} | ${relative} |`,
    );
  }
  push("");

  push("## Accuracy", "");
  push(
    "| Candidate | Languages | WER | WER per run | Domain-term errors | Language flips | Dropped by guard | Failed calls | Rate limited |",
    "|---|---|---|---|---|---|---|---|---|",
  );
  for (const candidate of candidates) {
    const summary = summaries.get(candidate.id);
    if (summary === undefined) continue;
    for (const mode of ["one", "both"] as const) {
      const m = summary.modes[mode];
      push(
        `| ${candidate.id} | ${mode} | ${pct(m.wer)} | ${m.werPerRun.map(pct).join(", ")} | ${String(m.missedTerms)}/${String(m.terms)} (${pct(m.termErrorRate)}) | ${String(m.flips)}/${String(m.speechResults)} | ${String(m.dropped)} | ${String(m.failedAttempts)}/${String(m.attempts)} (${pct(m.failureRate)}) | ${String(m.rateLimited)} |`,
      );
    }
  }
  push("");

  push("## Latency inside us-east-1", "");
  push(
    "Per dictation: the sum of the transcriber calls `transcribeIn` made, measured in the eval Lambda around the adapter, as P50 / P95 (samples).",
    "Fresh means the call opened a new TLS connection; reused means it rode a kept-alive one.",
    "",
  );
  push(
    "| Candidate | Languages | Fresh connection | Reused connection | ~15 s clips, reused | Calls per dictation | Groq region |",
    "|---|---|---|---|---|---|---|",
  );
  for (const candidate of candidates) {
    const summary = summaries.get(candidate.id);
    if (summary === undefined) continue;
    for (const mode of ["one", "both"] as const) {
      const m = summary.modes[mode];
      push(
        `| ${candidate.id} | ${mode} | ${stat(m.latencyByConnection.fresh)} | ${stat(m.latencyByConnection.reused)} | ${stat(m.latencyLongReused)} | ${m.callsPerDictation.toFixed(2)} | ${summary.regions.join(", ")} |`,
      );
    }
  }
  push("");

  push("## Cost", "");
  push(
    `Per ${String(normalDictationSeconds)} s dictation at list price, with each provider's billing minimum and the measured calls per dictation; a transcriber that reports no detected language always transcribes twice under both languages.`,
    "",
  );
  push(
    "| Candidate | Billed by | Per minute | One language | Both languages |",
    "|---|---|---|---|---|",
  );
  for (const candidate of candidates) {
    const summary = summaries.get(candidate.id);
    if (summary === undefined) continue;
    const facts = modelFacts(candidate.spec.model);
    const perSecond = usdPerAudioSecond(candidate, checked);
    const cell = (value: number | undefined) => (value === undefined ? "n/a" : usd(value));
    push(
      `| ${candidate.id} | ${facts.price.kind === "duration" ? "duration" : "measured audio and text tokens"} | ${cell(perSecond === undefined ? undefined : perSecond * 60)} | ${cell(dictationCostUsd(candidate, checked, summary.modes.one.callsPerDictation))} | ${cell(dictationCostUsd(candidate, checked, summary.modes.both.callsPerDictation))} |`,
    );
  }
  push("");

  push("## Failed calls", "");
  if (context.failedAttempts.length === 0) push("None.", "");
  else {
    const counts = new Map<string, number>();
    for (const failure of context.failedAttempts) {
      const key = `${itemKey(failure.id).candidate}: ${failure.status === undefined ? failure.message : String(failure.status)}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const [key, count] of counts) push(`- ${key}, ${String(count)} attempts`);
    push("");
  }

  push("## Every output that differs from the expected text", "");
  push(
    "Grouped per case, candidate and language setting; identical outputs are counted once, with their gate flags.",
    "",
  );
  const byCase = new Map<string, Checked[]>();
  for (const entry of checked) {
    const list = byCase.get(entry.item.id) ?? [];
    list.push(entry);
    byCase.set(entry.item.id, list);
  }
  for (const item of fixtures.cases) {
    const entries = (byCase.get(item.id) ?? []).filter(
      (entry) =>
        entry.errors > 0 ||
        entry.flags.length > 0 ||
        entry.missed.length > 0 ||
        entry.flipped ||
        !entry.result.ok ||
        (item.kind === "noise" && entry.result.text),
    );
    if (entries.length === 0) continue;
    push(
      `### ${item.id}`,
      "",
      item.kind === "speech"
        ? `Expected: ${item.text}`
        : `Noise: ${item.color}, ${String(item.levelDbfs)} dBFS, ${String(item.seconds)} s`,
      "",
    );
    const groups = new Map<string, { count: number; entry: Checked; connections: Set<string> }>();
    for (const entry of entries) {
      const key = [
        entry.result.candidate,
        entry.result.mode,
        entry.result.ok ? (entry.result.text ?? "") : `error ${entry.result.error?.message ?? ""}`,
        entry.flags.join(","),
        entry.result.language ?? "",
      ].join("|");
      const group = groups.get(key) ?? { count: 0, entry, connections: new Set<string>() };
      group.count += 1;
      group.connections.add(actualConnection(entry.result));
      groups.set(key, group);
    }
    for (const { count, entry } of groups.values()) {
      const r = entry.result;
      const notes = [
        ...entry.flags.map((flag) => `**${flag}**`),
        ...entry.detail,
        ...(entry.missed.length > 0 ? [`missed ${entry.missed.join(", ")}`] : []),
        ...(entry.flipped ? [`chose ${r.language ?? "no language"}`] : []),
      ];
      const said = r.ok ? `"${r.text ?? ""}"` : `failed: ${r.error?.message ?? ""}`;
      push(
        `- ${r.candidate}, ${r.mode}, ${String(count)}x: ${said}${notes.length > 0 ? ` (${notes.join("; ")})` : ""}`,
      );
    }
    push("");
  }
  return `${lines.join("\n")}\n`;
}
