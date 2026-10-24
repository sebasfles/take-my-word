import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { ProviderCall, ProviderRequest } from "../src/eval/contract.ts";
import {
  refinerCandidates,
  transcriberCandidates,
  type RefinerCandidate,
  type TranscriberCandidate,
} from "./harness/candidates.ts";
import { clientOverhead } from "./harness/client-overhead.ts";
import {
  checkDictation,
  combinationOf,
  summarizeDictations,
  type DictateChecked,
  type DictateResult,
} from "./harness/dictate-analysis.ts";
import { dictateReport } from "./harness/dictate-report.ts";
import { buildEvalBundle, type EvalFunction } from "./harness/eval-lambda.ts";
import {
  buildClip,
  isExtended,
  loadTranscriptionFixtures,
  transcriptionFixturesPath,
  voicesFor,
  type Clip,
  type SpeechCase,
} from "./harness/fixtures.ts";
import {
  billedAudioSeconds,
  chargedUsd,
  modelFacts,
  planNotes,
  tokenCostUsd,
  transcriptionCallUsd,
} from "./harness/prices.ts";
import type { LedgerEntry } from "./harness/pacing.ts";
import type { Attempt, PlannedItem } from "./harness/scheduler.ts";
import {
  openFinishedRun,
  openResultsDir,
  paths,
  readJsonl,
  type ResultsDir,
} from "./harness/store.ts";
import {
  deployAndWarm,
  executePlan,
  headersOf,
  pacingKeyOf,
  recordedSpendUsd,
  recordSynthesis,
  requestsSha256,
  requireSynthesisBudget,
  type FailureRecord,
} from "./harness/suite.ts";
import {
  evaluationCodePaths,
  fromInvocation,
  fromRoot,
  lastCommitTouching,
  openWorkspace,
  requireCommittedFixtures,
  sha256,
} from "./harness/workspace.ts";

const { values } = parseArgs({
  options: {
    results: { type: "string" },
    report: { type: "string" },
    runs: { type: "string", default: "5" },
    combinations: { type: "string" },
    smoke: { type: "boolean", default: false },
  },
});
if (
  values.combinations === undefined ||
  (!values.smoke && (values.results === undefined || values.report === undefined))
) {
  console.error(
    "usage: pnpm eval:dictate --results <dir> --report <report.md> --combinations <transcriber>+<refiner>,... [--runs 5] | --smoke --combinations ...",
  );
  process.exit(2);
}
const resultsDir = fromInvocation(values.results ?? ".");
const reportPath = fromInvocation(values.report ?? ".");
const runs = Number(values.runs);
if (!Number.isInteger(runs) || runs < 3) throw new Error("--runs must be an integer of at least 3");

interface Combination {
  transcriber: TranscriberCandidate;
  refiner: RefinerCandidate;
}

function combinationsFrom(list: string, withBaseline = true): Combination[] {
  const transcriberBaseline = transcriberCandidates.find((candidate) => candidate.baseline);
  const refinerBaseline = refinerCandidates.find((candidate) => candidate.baseline);
  if (transcriberBaseline === undefined || refinerBaseline === undefined) {
    throw new Error("both suites need a baseline");
  }
  const asked = list.split(",").map((pair) => {
    const [transcriberId, refinerId] = pair.split("+").map((part) => part.trim());
    const transcriber = transcriberCandidates.find((candidate) => candidate.id === transcriberId);
    const refiner = refinerCandidates.find((candidate) => candidate.id === refinerId);
    if (transcriber === undefined || refiner === undefined) {
      throw new Error(`unknown combination ${pair}; use candidate ids joined by +`);
    }
    return { transcriber, refiner };
  });
  const all = withBaseline
    ? [{ transcriber: transcriberBaseline, refiner: refinerBaseline }, ...asked]
    : asked;
  return all.filter(
    (combination, index) =>
      all.findIndex(
        (other) =>
          other.transcriber.id === combination.transcriber.id &&
          other.refiner.id === combination.refiner.id,
      ) === index,
  );
}

const combinations = combinationsFrom(values.combinations, !values.smoke);
const workspace = openWorkspace();
const fixtures = loadTranscriptionFixtures();
const cases = fixtures.cases.filter(
  (item): item is SpeechCase => item.kind === "speech" && (item.endToEnd || isExtended(item.id)),
);
const estimatedRefineTokens = { input: 1_500, output: 600 };

function request(combination: Combination, clip: Clip): ProviderRequest {
  const item = clip.item;
  return {
    kind: "dictate",
    connection: "fresh",
    transcriber: combination.transcriber.spec,
    refiner: combination.refiner.spec,
    audioBase64: clip.audio.toString("base64"),
    container: "wav",
    languages: [item.language],
    terms: fixtures.dictionaries[item.dictionary] ?? [],
    termsUsedAt: fixtures.dictionaryUsedAt,
  };
}

function plan(
  evalFunction: () => Promise<EvalFunction>,
  clips: readonly Clip[],
  requests: { id: string; request: ProviderRequest }[] = [],
): PlannedItem<DictateResult>[] {
  const items: PlannedItem<DictateResult>[] = [];
  for (let run = 1; run <= runs; run += 1) {
    for (const clip of clips) {
      for (const combination of combinations) {
        const transcription = modelFacts(combination.transcriber.spec.model);
        const cleanup = modelFacts(combination.refiner.spec.model);
        const name = combinationOf(combination.transcriber.id, combination.refiner.id);
        const id = `${name}|${clip.id}|one|${String(run)}`;
        const built = request(combination, clip);
        requests.push({ id, request: built });
        const transcribeUsd = transcriptionCallUsd(transcription, clip.seconds);
        const refineUsd = tokenCostUsd(
          cleanup,
          estimatedRefineTokens.input,
          estimatedRefineTokens.output,
        );
        const base = {
          id,
          combination: name,
          transcriber: combination.transcriber.id,
          refiner: combination.refiner.id,
          caseId: clip.item.id,
          voice: clip.voice,
          run,
          language: clip.item.language,
        };
        items.push({
          id,
          pacingKey: pacingKeyOf(combination.transcriber.spec.model),
          estimate: {
            requests: 1,
            audioSeconds: billedAudioSeconds(transcription, clip.seconds),
            tokens: 0,
            costUsd: chargedUsd(transcription, transcribeUsd),
          },
          alsoPaced: [
            {
              pacingKey: pacingKeyOf(combination.refiner.spec.model),
              estimate: {
                requests: 1,
                audioSeconds: 0,
                tokens: estimatedRefineTokens.input + estimatedRefineTokens.output,
                costUsd: chargedUsd(cleanup, refineUsd),
              },
            },
          ],
          exhausted: (failure) => ({
            ...base,
            ok: false,
            error: failure,
            calls: [],
            coldStart: false,
            region: "",
            memoryMb: 0,
            listUsd: 0,
            chargedUsd: 0,
            at: new Date().toISOString(),
          }),
          run: async (): Promise<Attempt<DictateResult>> => {
            try {
              const response = await (await evalFunction()).invoke(built);
              const stage = (name: ProviderCall["stage"]) =>
                response.calls.filter((call) => call.stage === name);
              const transcribeCalls = stage("transcribe");
              const refineCalls = stage("refine");
              const transcribeList = transcribeCalls.reduce(
                (sum, call) => sum + transcriptionCallUsd(transcription, clip.seconds, call.usage),
                0,
              );
              const refineList = refineCalls.reduce(
                (sum, call) =>
                  sum +
                  tokenCostUsd(
                    cleanup,
                    call.usage?.inputTokens ?? 0,
                    call.usage?.outputTokens ?? 0,
                  ),
                0,
              );
              const transcribeCharged = chargedUsd(transcription, transcribeList);
              const refineCharged = chargedUsd(cleanup, refineList);
              return {
                result: {
                  ...base,
                  ok: response.ok,
                  ...(response.dictation !== undefined && { dictation: response.dictation }),
                  ...(response.error !== undefined && { error: response.error }),
                  calls: response.calls,
                  coldStart: response.coldStart,
                  region: response.region,
                  memoryMb: response.memoryMb,
                  listUsd: transcribeList + refineList,
                  chargedUsd: transcribeCharged + refineCharged,
                  at: new Date().toISOString(),
                },
                usage: {
                  requests: transcribeCalls.length,
                  audioSeconds: transcribeCalls.reduce(
                    (sum, call) =>
                      sum + billedAudioSeconds(transcription, clip.seconds, call.usage),
                    0,
                  ),
                  tokens: 0,
                },
                costUsd: transcribeCharged,
                headers: headersOf(transcribeCalls),
                alsoUsed: [
                  {
                    pacingKey: pacingKeyOf(combination.refiner.spec.model),
                    usage: {
                      requests: refineCalls.length,
                      audioSeconds: 0,
                      tokens: refineCalls.reduce(
                        (sum, call) =>
                          sum + (call.usage?.inputTokens ?? 0) + (call.usage?.outputTokens ?? 0),
                        0,
                      ),
                    },
                    costUsd: refineCharged,
                    headers: headersOf(refineCalls),
                  },
                ],
                ...(response.error !== undefined && { failure: response.error }),
              };
            } catch (error) {
              return {
                usage: { requests: 0, audioSeconds: 0, tokens: 0 },
                costUsd: 0,
                headers: {},
                failure: { message: error instanceof Error ? error.message : "unknown" },
              };
            }
          },
        });
      }
    }
  }
  return items;
}

function render(dir: ResultsDir): void {
  const byId = new Map(cases.map((item) => [item.id, item]));
  const checked: DictateChecked[] = readJsonl<DictateResult>(dir.results).map((result) => {
    const item = byId.get(result.caseId);
    if (item === undefined) throw new Error(`no fixture case ${result.caseId}`);
    return checkDictation(result, item);
  });
  const names = combinations.map((c) => combinationOf(c.transcriber.id, c.refiner.id));
  const bucket = (keep: (caseId: string) => boolean) =>
    new Map(
      names.map((name) => [
        name,
        summarizeDictations(
          name,
          checked.filter((entry) => keep(entry.item.id)),
          clientOverhead.samplesMs,
        ),
      ]),
    );
  writeFileSync(
    reportPath,
    dictateReport({
      planNotes: planNotes(readJsonl<LedgerEntry>(dir.ledger)),
      command: `pnpm --filter @take-my-word/api eval:dictate --results ${fromRoot(resultsDir)} --report ${fromRoot(reportPath)} --combinations ${values.combinations ?? ""} --runs ${String(runs)}`,
      generatedAt: new Date().toISOString(),
      codeCommit: [dir.meta.codeCommit, ...(dir.meta.resumedWith ?? [])].join("`, resumed with `"),
      fixturesSha256: dir.meta.fixturesSha256,
      functionName: workspace.evalFunctionName,
      runs,
      chargedUsd: recordedSpendUsd(dir),
      failedAttempts: readJsonl<FailureRecord>(dir.failures),
      cases,
      combinations: names,
      all: bucket(() => true),
      short: bucket((caseId) => !isExtended(caseId)),
      extended: bucket(isExtended),
      checked,
    }),
  );
  console.log(`report written to ${fromRoot(reportPath)}`);
}

if (values.smoke) {
  const evalFunction = await deployAndWarm(workspace);
  const [item] = cases;
  const [voice] = item === undefined ? [] : voicesFor(fixtures, item);
  if (item === undefined || voice === undefined) throw new Error("no end-to-end case");
  const clip = await buildClip(workspace.polly, item, voice);
  for (const combination of combinations) {
    const response = await evalFunction.invoke(request(combination, clip));
    console.log(
      JSON.stringify({
        combination: combinationOf(combination.transcriber.id, combination.refiner.id),
        clip: clip.id,
        ok: response.ok,
        raw: response.dictation?.raw,
        text: response.dictation?.text,
        latencyMs: response.dictation?.latencyMs,
        error: response.error,
        calls: response.calls.map((call) => ({ stage: call.stage, ms: Math.round(call.ms) })),
      }),
    );
  }
  process.exit(0);
}

requireCommittedFixtures(transcriptionFixturesPath, evaluationCodePaths);
const codeCommit = lastCommitTouching(evaluationCodePaths);
const fixturesSha256 = sha256(transcriptionFixturesPath);
const identity = { suite: "dictate", fixturesSha256, runs };
const finished = openFinishedRun(resultsDir, identity);
if (finished !== undefined) {
  const done = new Set(readJsonl<DictateResult>(finished.results).map((result) => result.id));
  const expected = cases.flatMap((item) =>
    combinations.flatMap((c) =>
      Array.from(
        { length: runs },
        (_, index) =>
          `${combinationOf(c.transcriber.id, c.refiner.id)}|${item.id}/${String(voicesFor(fixtures, item)[0])}|one|${String(index + 1)}`,
      ),
    ),
  );
  if (expected.every((id) => done.has(id))) {
    render(finished);
    process.exit(0);
  }
}
const characters = cases.reduce((sum, item) => sum + item.text.length, 0);
requireSynthesisBudget(paths(resultsDir, "dictate"), characters);
const clips: Clip[] = [];
for (const item of cases) {
  const [voice] = voicesFor(fixtures, item);
  if (voice === undefined) throw new Error(`${item.id} has no voice`);
  clips.push(await buildClip(workspace.polly, item, voice));
}
const bundle = await buildEvalBundle();
const requests: { id: string; request: ProviderRequest }[] = [];
let deployed: Promise<EvalFunction> | undefined;
const evalFunction = () => (deployed ??= deployAndWarm(workspace, bundle));
const items = plan(evalFunction, clips, requests);
const dir = openResultsDir(
  resultsDir,
  {
    ...identity,
    codeCommit,
    requestsSha256: requestsSha256(requests),
    evalBundleSha256: bundle.sha256,
    clips: Object.fromEntries(clips.map((clip) => [clip.id, clip.sha256])),
  },
  new Date(),
);
recordSynthesis(dir, characters);
const done = new Set(readJsonl<DictateResult>(dir.results).map((result) => result.id));
const pending = items.filter((item) => !done.has(item.id));
const models = [
  ...new Set(combinations.flatMap((c) => [c.transcriber.spec.model, c.refiner.spec.model])),
];
const complete = pending.length === 0 || (await executePlan(dir, models, pending));
if (complete) render(dir);
