import type { DictationResponse, Language } from "@take-my-word/shared";
import type { EvalResponse, ProviderCall } from "../../src/eval/contract.ts";
import type { SpeechCase } from "./fixtures.ts";
import {
  bestWordErrors,
  hallucinatedPhrases,
  inventedRunThreshold,
  languageIssue,
  missedTerms,
  sumDistribution,
} from "./metrics.ts";
import { latency, type LatencyStats } from "./transcription-analysis.ts";

export interface DictateResult {
  id: string;
  combination: string;
  transcriber: string;
  refiner: string;
  caseId: string;
  voice: string;
  run: number;
  language: Language;
  ok: boolean;
  dictation?: DictationResponse;
  error?: EvalResponse["error"];
  calls: ProviderCall[];
  coldStart: boolean;
  region: string;
  memoryMb: number;
  listUsd: number;
  chargedUsd: number;
  at: string;
}

export const combinationOf = (transcriber: string, refiner: string): string =>
  `${transcriber} + ${refiner}`;

export interface DictateChecked {
  result: DictateResult;
  item: SpeechCase;
  errors: number;
  words: number;
  termsWrong: string[];
  flags: string[];
}

export function checkDictation(result: DictateResult, item: SpeechCase): DictateChecked {
  const text = result.dictation?.text ?? "";
  const references = [item.text, ...item.variants];
  const counted = bestWordErrors(references, text);
  const flags: string[] = [];
  if (result.ok) {
    if (counted.longestInsertionRun >= inventedRunThreshold) flags.push("invented content");
    for (const phrase of hallucinatedPhrases(text, references))
      flags.push(`hallucination "${phrase}"`);
    const issue = languageIssue(text, item.language);
    if (issue !== undefined) flags.push(`wrong language: ${issue}`);
  }
  return {
    result,
    item,
    errors: result.ok ? counted.errors : 0,
    words: result.ok ? counted.words : 0,
    termsWrong: result.ok ? missedTerms(text, item.terms, { exact: true }) : [],
    flags,
  };
}

export interface DictateLatency {
  inLambda: LatencyStats;
  releaseToText: LatencyStats;
  inLambdaSamples: number[];
}

export interface DictateSummary {
  combination: string;
  results: number;
  failed: number;
  flagged: DictateChecked[];
  wer: number;
  termErrors: number;
  terms: number;
  latency: DictateLatency;
}

const rate = (numerator: number, denominator: number) =>
  denominator === 0 ? 0 : numerator / denominator;

export function dictateLatency(
  checked: readonly DictateChecked[],
  overheadMs: readonly number[],
): DictateLatency {
  const inLambdaSamples = checked
    .filter((entry) => entry.result.ok && !entry.result.coldStart)
    .map((entry) => entry.result.dictation?.latencyMs.total ?? 0);
  return {
    inLambda: latency(inLambdaSamples),
    releaseToText: latency(sumDistribution(inLambdaSamples, overheadMs)),
    inLambdaSamples,
  };
}

export function summarizeDictations(
  combination: string,
  checked: readonly DictateChecked[],
  overheadMs: readonly number[],
): DictateSummary {
  const mine = checked.filter((entry) => entry.result.combination === combination);
  const ok = mine.filter((entry) => entry.result.ok);
  return {
    combination,
    results: mine.length,
    failed: mine.length - ok.length,
    flagged: mine.filter((entry) => entry.flags.length > 0),
    wer: rate(
      ok.reduce((sum, entry) => sum + entry.errors, 0),
      ok.reduce((sum, entry) => sum + entry.words, 0),
    ),
    termErrors: ok.reduce((sum, entry) => sum + entry.termsWrong.length, 0),
    terms: ok.reduce((sum, entry) => sum + entry.item.terms.length, 0),
    latency: dictateLatency(mine, overheadMs),
  };
}
