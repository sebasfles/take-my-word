import type { Connection, EvalResponse, ProviderCall } from "../../src/eval/contract.ts";
import type { CleanupCase } from "./cleanup-fixtures.ts";
import {
  hasTerm,
  inventedRunThreshold,
  languageIssue,
  mean,
  percentile,
  recognitionTokens,
  spread,
} from "./metrics.ts";
import {
  caseIdOf,
  isProviderFailure,
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
  newWords: string[];
  longestNewRun: number;
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
      newWords: [],
      longestNewRun: 0,
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
  const tokens = recognitionTokens(text);
  const isNew = tokens.map((word) => !vocabulary.has(fold(word)));
  let longestNewRun = 0;
  let run = 0;
  for (const fresh of isNew) {
    run = fresh ? run + 1 : 0;
    longestNewRun = Math.max(longestNewRun, run);
  }
  const newWords = [...new Set(tokens.filter((_, index) => isNew[index]))];
  const flags: CleanupFlag[] = [];
  if (longestNewRun >= inventedRunThreshold) flags.push("invented content");
  const issue = languageIssue(text, item.language);
  if (issue !== undefined) flags.push("wrong language");
  const missingRequired = item.required.filter((word) => !hasTerm(text, word));
  const presentForbidden = item.forbidden.filter((word) => hasTerm(text, word));
  return {
    result,
    item,
    flags,
    newWords,
    longestNewRun,
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
  newWordRate: number;
  newWordsPerRun: number[];
  meaningChangeRate: number;
  meaningChangesPerRun: number[];
  fillerRemovalRate: number | undefined;
  punctuationRate: number;
  termErrorRate: number;
  termErrorsPerRun: number[];
  styleRate: number | undefined;
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
    .filter(isProviderFailure)
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
  const newWordRateOf = (entries: readonly CleanupChecked[]) =>
    rate(entries.filter((entry) => entry.newWords.length > 0).length, entries.length);
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
    newWordRate: newWordRateOf(ok),
    newWordsPerRun: runs.map((run) => newWordRateOf(inRun(run))),
    meaningChangeRate: changeRateOf(ok),
    meaningChangesPerRun: runs.map((run) => changeRateOf(inRun(run))),
    fillerRemovalRate:
      fillers === 0
        ? undefined
        : rate(fillers - ok.reduce((sum, entry) => sum + entry.fillersLeft.length, 0), fillers),
    punctuationRate: rate(
      ok.filter((entry) => entry.punctuationIssues.length === 0).length,
      ok.length,
    ),
    termErrorRate: termRateOf(ok),
    termErrorsPerRun: runs.map((run) => termRateOf(inRun(run))),
    styleRate:
      styled.length === 0
        ? undefined
        : rate(styled.filter((entry) => entry.styleIssues.length === 0).length, styled.length),
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
  compare(
    "outputs with new words",
    candidate.newWordRate,
    baseline.newWordRate,
    baseline.newWordsPerRun,
  );
  compare("failed calls", candidate.failureRate, baseline.failureRate, baseline.failureRatePerRun);
  return { passed: reasons.length === 0, reasons };
}

export const cleanupHardGatePassed = (summary: CleanupSummary): boolean =>
  Object.values(summary.flags).every((count) => count === 0);

export interface CleanupBuckets {
  all: ReadonlyMap<string, CleanupSummary>;
  round1: ReadonlyMap<string, CleanupSummary>;
  extended: ReadonlyMap<string, CleanupSummary>;
  chainedBy: (transcriber: string) => ReadonlyMap<string, CleanupSummary>;
}

export function summarizeCleanupBuckets(
  candidates: readonly string[],
  checked: readonly CleanupChecked[],
  failures: readonly (AttemptFailure & { id: string })[],
  isExtended: (caseId: string) => boolean,
): CleanupBuckets {
  const caseById = new Map(checked.map((entry) => [entry.item.id, entry.item]));
  const bucket = (keep: (item: CleanupCase) => boolean) =>
    new Map(
      candidates.map((candidate) => [
        candidate,
        summarizeCleanup(
          candidate,
          checked.filter((entry) => keep(entry.item)),
          failures.filter((failure) => {
            const item = caseById.get(caseIdOf(failure.id));
            return item !== undefined && keep(item);
          }),
        ),
      ]),
    );
  const chained = new Map<string, ReadonlyMap<string, CleanupSummary>>();
  return {
    all: bucket(() => true),
    round1: bucket((item) => item.chain === undefined),
    extended: bucket((item) => item.chain !== undefined && isExtended(item.chain.caseId)),
    chainedBy: (transcriber) => {
      const found =
        chained.get(transcriber) ??
        bucket((item) => item.chain?.transcribers.includes(transcriber) ?? false);
      chained.set(transcriber, found);
      return found;
    },
  };
}

export interface CleanupGate {
  hard: boolean;
  relative: { passed: boolean; reasons: string[] };
}

const hasResults = (summary: CleanupSummary | undefined): summary is CleanupSummary =>
  summary !== undefined && summary.results > 0;

export function cleanupGate(
  candidate: string,
  baseline: string,
  buckets: CleanupBuckets,
  extendedName: string,
): CleanupGate | undefined {
  const all = buckets.all.get(candidate);
  if (!hasResults(all)) return undefined;
  const hard = cleanupHardGatePassed(all);
  if (candidate === baseline) return { hard, relative: { passed: true, reasons: [] } };
  const reasons: string[] = [];
  const round1 = buckets.round1.get(candidate);
  const round1Base = buckets.round1.get(baseline);
  if (hasResults(round1) && hasResults(round1Base)) {
    reasons.push(...cleanupRelativeGate(round1, round1Base).reasons);
  }
  const extended = buckets.extended.get(candidate);
  const extendedBase = buckets.extended.get(baseline);
  if (hasResults(extended) && hasResults(extendedBase)) {
    reasons.push(
      ...cleanupRelativeGate(extended, extendedBase).reasons.map(
        (reason) => `${extendedName}, ${reason}`,
      ),
    );
  }
  return { hard, relative: { passed: reasons.length === 0, reasons } };
}

export function combinationCleanupGate(
  refiner: CleanupSummary,
  baseline: CleanupSummary,
): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const compare = (name: string, mine: number, base: number, perRun: readonly number[]) => {
    if (mine > base + spread(perRun)) {
      reasons.push(
        `${name} ${pct(mine)} on its transcriber's raws, above today's ${pct(base)} plus its spread ${pct(spread(perRun))}`,
      );
    }
  };
  compare(
    "meaning changes",
    refiner.meaningChangeRate,
    baseline.meaningChangeRate,
    baseline.meaningChangesPerRun,
  );
  compare(
    "dictionary term errors",
    refiner.termErrorRate,
    baseline.termErrorRate,
    baseline.termErrorsPerRun,
  );
  return { passed: reasons.length === 0, reasons };
}
