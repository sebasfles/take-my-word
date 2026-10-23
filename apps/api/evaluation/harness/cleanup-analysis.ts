import type { Connection, EvalResponse, ProviderCall } from "../../src/eval/contract.ts";
import type { CleanupCase } from "./cleanup-fixtures.ts";
import {
  dominantLanguage,
  hasTerm,
  mean,
  percentile,
  recognitionTokens,
  spread,
} from "./metrics.ts";
import {
  itemKey,
  latency,
  pct,
  type AttemptFailure,
  type LatencyStats,
} from "./transcription-analysis.ts";

export interface CleanupResult {
  id: string;
  candidate: string;
  caseId: string;
  run: number;
  connection: Connection;
  ok: boolean;
  text?: string;
  error?: EvalResponse["error"];
  usage?: { inputTokens: number; outputTokens: number };
  calls: ProviderCall[];
  coldStart: boolean;
  region: string;
  memoryMb: number;
  listUsd: number;
  chargedUsd: number;
  at: string;
}

export type CleanupFlag = "invented content" | "wrong language";

export interface CleanupChecked {
  result: CleanupResult;
  item: CleanupCase;
  flags: CleanupFlag[];
  invented: string[];
  exact: boolean;
  missingRequired: string[];
  presentForbidden: string[];
  meaningChanged: boolean;
  fillersLeft: string[];
  punctuationIssues: string[];
  termsWrong: string[];
  styleIssues: string[];
}

const fold = (word: string) => word.normalize("NFD").replace(/\p{M}/gu, "");
const vocabularyOf = (texts: readonly string[]) =>
  new Set(texts.flatMap((text) => recognitionTokens(text)).map(fold));
const squash = (text: string) => text.normalize("NFC").replace(/\s+/g, " ").trim();

export function punctuationIssues(text: string, item: CleanupCase): string[] {
  const issues: string[] = [];
  const first = /\p{L}/u.exec(text)?.[0];
  if (first !== undefined && first !== first.toLocaleUpperCase(item.language)) {
    issues.push("starts in lowercase");
  }
  if (!/[.?!…]["”»)]*$/u.test(text.trim())) issues.push("no closing punctuation");
  if (item.language === "es" && text.includes("?") && !text.includes("¿")) {
    issues.push("question without ¿");
  }
  if (item.expected.every((expected) => expected.includes("?")) && !text.includes("?")) {
    issues.push("question lost its question mark");
  }
  return issues;
}

export function checkCleanup(result: CleanupResult, item: CleanupCase): CleanupChecked {
  const text = result.text ?? "";
  if (!result.ok) {
    return {
      result,
      item,
      flags: [],
      invented: [],
      exact: false,
      missingRequired: [],
      presentForbidden: [],
      meaningChanged: false,
      fillersLeft: [],
      punctuationIssues: [],
      termsWrong: [],
      styleIssues: [],
    };
  }
  const vocabulary = vocabularyOf([item.raw, ...item.expected, ...item.allowed, ...item.terms]);
  const invented = [
    ...new Set(recognitionTokens(text).filter((word) => !vocabulary.has(fold(word)))),
  ];
  const flags: CleanupFlag[] = [];
  if (invented.length > 0) flags.push("invented content");
  const dominant = dominantLanguage(text);
  if (dominant !== undefined && dominant !== item.language) flags.push("wrong language");
  const missingRequired = item.required.filter((word) => !hasTerm(text, word));
  const presentForbidden = item.forbidden.filter((word) => hasTerm(text, word));
  return {
    result,
    item,
    flags,
    invented,
    exact: item.expected.some((expected) => squash(expected) === squash(text)),
    missingRequired,
    presentForbidden,
    meaningChanged: missingRequired.length > 0 || presentForbidden.length > 0,
    fillersLeft: item.fillers.filter((filler) => hasTerm(text, filler)),
    punctuationIssues: punctuationIssues(text, item),
    termsWrong: item.terms.filter((term) => !hasTerm(text, term, { exact: true })),
    styleIssues: [
      ...item.styleRequired
        .filter((word) => !hasTerm(text, word))
        .map((word) => `missing "${word}"`),
      ...item.styleForbidden.filter((word) => hasTerm(text, word)).map((word) => `has "${word}"`),
    ],
  };
}

export interface CleanupSummary {
  candidate: string;
  results: number;
  okResults: number;
  flags: Record<CleanupFlag, number>;
  flagged: CleanupChecked[];
  exactRate: number;
  meaningChangeRate: number;
  meaningChangesPerRun: number[];
  fillerRemovalRate: number;
  punctuationRate: number;
  termErrorRate: number;
  termErrorsPerRun: number[];
  styleRate: number;
  attempts: number;
  failedAttempts: number;
  rateLimited: number;
  failureRate: number;
  failureRatePerRun: number[];
  latencyByConnection: Record<Connection, LatencyStats>;
  samplesByConnection: Record<Connection, number[]>;
  inputTokensP50: number | undefined;
  outputTokensP50: number | undefined;
  listUsdPerCall: number;
}

const rate = (numerator: number, denominator: number) =>
  denominator === 0 ? 0 : numerator / denominator;

export const callMs = (result: CleanupResult): number =>
  result.calls.reduce((sum, call) => sum + call.ms, 0);

const actual = (result: CleanupResult): Connection =>
  (result.calls[0]?.newConnections ?? 0) > 0 ? "fresh" : "reused";

export function summarizeCleanup(
  candidate: string,
  checked: readonly CleanupChecked[],
  failures: readonly AttemptFailure[],
): CleanupSummary {
  const mine = checked.filter((entry) => entry.result.candidate === candidate);
  const ok = mine.filter((entry) => entry.result.ok);
  const myFailures = failures
    .map((failure) => ({ ...failure, ...itemKey(failure.id) }))
    .filter((failure) => failure.candidate === candidate);
  const failed = myFailures.filter((failure) => failure.status !== 429);
  const runs = [...new Set(mine.map((entry) => entry.result.run))].sort((a, b) => a - b);
  const inRun = (run: number) => ok.filter((entry) => entry.result.run === run);
  const termRateOf = (entries: readonly CleanupChecked[]) =>
    rate(
      entries.reduce((sum, entry) => sum + entry.termsWrong.length, 0),
      entries.reduce((sum, entry) => sum + entry.item.terms.length, 0),
    );
  const changeRateOf = (entries: readonly CleanupChecked[]) =>
    rate(entries.filter((entry) => entry.meaningChanged).length, entries.length);
  const failureRateOf = (run?: number) => {
    const failedHere = failed.filter((failure) => run === undefined || failure.run === run);
    const succeeded = ok.filter((entry) => run === undefined || entry.result.run === run);
    return rate(failedHere.length, failedHere.length + succeeded.length);
  };
  const styled = ok.filter(
    (entry) => entry.item.styleRequired.length + entry.item.styleForbidden.length > 0,
  );
  const fillers = ok.reduce((sum, entry) => sum + entry.item.fillers.length, 0);
  const flags: Record<CleanupFlag, number> = { "invented content": 0, "wrong language": 0 };
  for (const entry of mine) for (const flag of entry.flags) flags[flag] += 1;
  const byConnection = (connection: Connection) =>
    latency(
      ok
        .filter((entry) => actual(entry.result) === connection)
        .map((entry) => callMs(entry.result)),
    );
  return {
    candidate,
    results: mine.length,
    okResults: ok.length,
    flags,
    flagged: mine.filter((entry) => entry.flags.length > 0),
    exactRate: rate(ok.filter((entry) => entry.exact).length, ok.length),
    meaningChangeRate: changeRateOf(ok),
    meaningChangesPerRun: runs.map((run) => changeRateOf(inRun(run))),
    fillerRemovalRate: rate(
      fillers - ok.reduce((sum, entry) => sum + entry.fillersLeft.length, 0),
      fillers,
    ),
    punctuationRate: rate(
      ok.filter((entry) => entry.punctuationIssues.length === 0).length,
      ok.length,
    ),
    termErrorRate: termRateOf(ok),
    termErrorsPerRun: runs.map((run) => termRateOf(inRun(run))),
    styleRate: rate(styled.filter((entry) => entry.styleIssues.length === 0).length, styled.length),
    attempts: ok.length + failed.length,
    failedAttempts: failed.length,
    rateLimited: myFailures.length - failed.length,
    failureRate: failureRateOf(),
    failureRatePerRun: runs.map((run) => failureRateOf(run)),
    latencyByConnection: { fresh: byConnection("fresh"), reused: byConnection("reused") },
    samplesByConnection: {
      fresh: ok
        .filter((entry) => !entry.result.coldStart && actual(entry.result) === "fresh")
        .map((entry) => callMs(entry.result)),
      reused: ok
        .filter((entry) => !entry.result.coldStart && actual(entry.result) === "reused")
        .map((entry) => callMs(entry.result)),
    },
    inputTokensP50: percentile(
      ok.map((entry) => entry.result.usage?.inputTokens ?? 0),
      50,
    ),
    outputTokensP50: percentile(
      ok.map((entry) => entry.result.usage?.outputTokens ?? 0),
      50,
    ),
    listUsdPerCall: mean(ok.map((entry) => entry.result.listUsd)),
  };
}

export function cleanupRelativeGate(
  candidate: CleanupSummary,
  baseline: CleanupSummary,
): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const compare = (name: string, mine: number, base: number, perRun: readonly number[]) => {
    if (mine > base + spread(perRun)) {
      reasons.push(
        `${name} ${pct(mine)} above the baseline's ${pct(base)} plus its spread ${pct(spread(perRun))}`,
      );
    }
  };
  compare(
    "meaning changes",
    candidate.meaningChangeRate,
    baseline.meaningChangeRate,
    baseline.meaningChangesPerRun,
  );
  compare(
    "dictionary term errors",
    candidate.termErrorRate,
    baseline.termErrorRate,
    baseline.termErrorsPerRun,
  );
  compare("failed calls", candidate.failureRate, baseline.failureRate, baseline.failureRatePerRun);
  return { passed: reasons.length === 0, reasons };
}

export const cleanupHardGatePassed = (summary: CleanupSummary): boolean =>
  Object.values(summary.flags).every((count) => count === 0);
