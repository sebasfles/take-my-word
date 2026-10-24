import { writeFileSync } from "node:fs";
import type { Connection, ProviderRequest } from "../src/eval/contract.ts";
import { transcriberCandidates, type TranscriberCandidate } from "./harness/candidates.ts";
import { buildEvalBundle, type EvalFunction } from "./harness/eval-lambda.ts";
import {
  buildClip,
  languageModes,
  languagesFor,
  loadTranscriptionFixtures,
  promptFor,
  transcriptionFixturesPath,
  voicesFor,
  type Clip,
  type LanguageMode,
} from "./harness/fixtures.ts";
import {
  billedAudioSeconds,
  chargedUsd,
  modelFacts,
  transcriptionCallUsd,
} from "./harness/prices.ts";
import type { Attempt, PlannedItem } from "./harness/scheduler.ts";
import { openFinishedRun, openResultsDir, readJsonl, type ResultsDir } from "./harness/store.ts";
import {
  deployAndWarm,
  executePlan,
  headersOf,
  pacingKeyOf,
  recordedSpendUsd,
  requestsSha256,
  suiteArgs,
  type FailureRecord,
} from "./harness/suite.ts";
import {
  check,
  summarize,
  type CandidateSummary,
  type TranscriptionResult,
} from "./harness/transcription-analysis.ts";
import { transcriptionReport } from "./harness/transcription-report.ts";
import {
  evaluationCodePaths,
  fromRoot,
  lastCommitTouching,
  openWorkspace,
  requireCommittedFixtures,
  sha256,
} from "./harness/workspace.ts";

const usage =
  "usage: pnpm eval:transcription --results <dir> --report <report.md> [--runs 5] | --smoke";
const args = suiteArgs(usage, 5);
const workspace = openWorkspace();
const fixtures = loadTranscriptionFixtures();

function request(
  candidate: TranscriberCandidate,
  clip: Clip,
  mode: LanguageMode,
  connection: "fresh" | "reused",
): ProviderRequest {
  return {
    kind: "transcribe",
    connection,
    transcriber: candidate.spec,
    audioBase64: clip.audio.toString("base64"),
    container: "wav",
    languages: languagesFor(clip.item, mode),
    prompt: promptFor(fixtures, clip.item.dictionary),
  };
}

async function smoke(): Promise<void> {
  const evalFunction = await deployAndWarm(workspace);
  const clip = await buildClip(
    workspace.polly,
    {
      id: "smoke",
      kind: "speech",
      language: "en",
      dictionary: "developer",
      text: "This is a short smoke test of the evaluation harness.",
      variants: [],
      terms: [],
      mixed: false,
      endToEnd: false,
    },
    "Joanna",
  );
  for (const candidate of transcriberCandidates) {
    for (const mode of languageModes) {
      const response = await evalFunction.invoke(request(candidate, clip, mode, "fresh"));
      console.log(
        JSON.stringify({
          candidate: candidate.id,
          mode,
          ok: response.ok,
          text: response.text,
          language: response.language,
          error: response.error,
          calls: response.calls.map((call) => ({
            requested: call.requested,
            ms: Math.round(call.ms),
            newConnections: call.newConnections,
            headers: call.headers,
          })),
        }),
      );
    }
  }
}

function plan(
  evalFunction: () => Promise<EvalFunction>,
  clips: readonly Clip[],
  runs: number,
  requests: { id: string; request: ProviderRequest }[] = [],
): PlannedItem<TranscriptionResult>[] {
  const items: PlannedItem<TranscriptionResult>[] = [];
  for (let run = 1; run <= runs; run += 1) {
    for (const clip of clips) {
      for (const mode of languageModes) {
        for (const candidate of transcriberCandidates) {
          const facts = modelFacts(candidate.spec.model);
          const calls = mode === "both" ? 2 : 1;
          const estimatedUsd = transcriptionCallUsd(facts, clip.seconds) * calls;
          const connection: Connection = run === 1 ? "fresh" : "reused";
          const id = `${candidate.id}|${clip.id}|${mode}|${String(run)}`;
          const built = request(candidate, clip, mode, connection);
          requests.push({ id, request: built });
          const base = {
            id,
            candidate: candidate.id,
            caseId: clip.item.id,
            voice: clip.voice,
            mode,
            run,
            connection,
            audioSeconds: clip.seconds,
            levelDbfs: clip.levelDbfs,
          };
          items.push({
            id,
            pacingKey: pacingKeyOf(candidate.spec.model),
            estimate: {
              requests: calls,
              audioSeconds: billedAudioSeconds(facts, clip.seconds) * calls,
              tokens: 0,
              costUsd: chargedUsd(facts, estimatedUsd),
            },
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
            run: async (): Promise<Attempt<TranscriptionResult>> => {
              try {
                const response = await (await evalFunction()).invoke(built);
                const listUsd = response.calls.reduce(
                  (sum, call) => sum + transcriptionCallUsd(facts, clip.seconds, call.usage),
                  0,
                );
                const charged = chargedUsd(facts, listUsd);
                const result: TranscriptionResult = {
                  ...base,
                  ok: response.ok,
                  ...(response.text !== undefined && { text: response.text }),
                  ...(response.language !== undefined && { language: response.language }),
                  ...(response.error !== undefined && { error: response.error }),
                  calls: response.calls,
                  coldStart: response.coldStart,
                  region: response.region,
                  memoryMb: response.memoryMb,
                  listUsd,
                  chargedUsd: charged,
                  at: new Date().toISOString(),
                };
                return {
                  result,
                  usage: {
                    requests: response.calls.length,
                    audioSeconds: response.calls.reduce(
                      (sum, call) => sum + billedAudioSeconds(facts, clip.seconds, call.usage),
                      0,
                    ),
                    tokens: 0,
                  },
                  costUsd: charged,
                  headers: headersOf(response.calls),
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
  }
  return items;
}

function itemIds(runs: number): string[] {
  return fixtures.cases.flatMap((item) =>
    voicesFor(fixtures, item).flatMap((voice) =>
      languageModes.flatMap((mode) =>
        transcriberCandidates.flatMap((candidate) =>
          Array.from(
            { length: runs },
            (_, index) => `${candidate.id}|${item.id}/${voice}|${mode}|${String(index + 1)}`,
          ),
        ),
      ),
    ),
  );
}

function render(dir: ResultsDir, results: string, reportPath: string): void {
  const stored = readJsonl<TranscriptionResult>(dir.results);
  const byId = new Map(fixtures.cases.map((item) => [item.id, item]));
  const checked = stored.map((result) => {
    const item = byId.get(result.caseId);
    if (item === undefined) throw new Error(`no fixture case ${result.caseId}`);
    return check(result, item);
  });
  const longIds = new Set(
    fixtures.cases.filter((item) => item.id.startsWith("long-")).map((item) => item.id),
  );
  const failures = readJsonl<FailureRecord>(dir.failures);
  const summaries = new Map<string, CandidateSummary>(
    transcriberCandidates.map((candidate) => [
      candidate.id,
      summarize(candidate.id, checked, failures, longIds),
    ]),
  );
  writeFileSync(
    reportPath,
    transcriptionReport(
      {
        command: `pnpm --filter @take-my-word/api eval:transcription --results ${fromRoot(results)} --report ${fromRoot(reportPath)} --runs ${String(dir.meta.runs)}`,
        generatedAt: new Date().toISOString(),
        codeCommit: [dir.meta.codeCommit, ...(dir.meta.resumedWith ?? [])].join(
          "`, resumed with `",
        ),
        fixturesSha256: dir.meta.fixturesSha256,
        functionName: workspace.evalFunctionName,
        memoryMb: [...new Set(stored.filter((r) => r.memoryMb > 0).map((r) => r.memoryMb))].join(
          ", ",
        ),
        region: [...new Set(stored.filter((r) => r.region !== "").map((r) => r.region))].join(", "),
        runs: dir.meta.runs,
        listUsd: stored.reduce((sum, result) => sum + result.listUsd, 0),
        chargedUsd: recordedSpendUsd(dir),
        failedAttempts: failures,
        overrides: [
          ...new Set(readJsonl<{ note: string }>(dir.overrides).map((entry) => entry.note)),
        ],
      },
      fixtures,
      transcriberCandidates,
      summaries,
      checked,
    ),
  );
  console.log(`report written to ${fromRoot(reportPath)}`);
}

async function measure(results: string, reportPath: string): Promise<void> {
  const state = requireCommittedFixtures(transcriptionFixturesPath, evaluationCodePaths);
  const codeCommit = lastCommitTouching(evaluationCodePaths);
  const fixturesSha256 = sha256(transcriptionFixturesPath);
  const finished = openFinishedRun(results, {
    suite: "transcription",
    fixturesSha256,
    runs: args.runs,
  });
  if (finished !== undefined) {
    const done = new Set(readJsonl<TranscriptionResult>(finished.results).map((r) => r.id));
    if (itemIds(args.runs).every((id) => done.has(id))) {
      render(finished, results, reportPath);
      return;
    }
  }

  const clips: Clip[] = [];
  for (const item of fixtures.cases) {
    for (const voice of voicesFor(fixtures, item)) {
      clips.push(await buildClip(workspace.polly, item, voice));
    }
  }
  console.log(
    `${String(clips.length)} clips, ${clips.reduce((sum, clip) => sum + clip.seconds, 0).toFixed(0)} s of audio`,
  );
  const bundle = await buildEvalBundle();
  const requests: { id: string; request: ProviderRequest }[] = [];
  let deployed: Promise<EvalFunction> | undefined;
  const evalFunction = () => (deployed ??= deployAndWarm(workspace, bundle));
  const items = plan(evalFunction, clips, args.runs, requests);
  const dir = openResultsDir(
    results,
    {
      suite: "transcription",
      fixturesSha256,
      codeCommit,
      runs: args.runs,
      requestsSha256: requestsSha256(requests),
      evalBundleSha256: bundle.sha256,
      clips: Object.fromEntries(clips.map((clip) => [clip.id, clip.sha256])),
    },
    new Date(),
  );
  console.log(`code ${codeCommit} (HEAD ${state.commit}), fixtures ${fixturesSha256.slice(0, 16)}`);

  const done = new Set(readJsonl<TranscriptionResult>(dir.results).map((result) => result.id));
  const pending = items.filter((item) => !done.has(item.id));
  const complete =
    pending.length === 0 ||
    (await executePlan(
      dir,
      transcriberCandidates.map((candidate) => candidate.spec.model),
      pending,
      { overrides: args.overrides },
    ));
  if (complete) render(dir, results, reportPath);
}

if (args.smoke) await smoke();
else if (args.results !== undefined && args.report !== undefined)
  await measure(args.results, args.report);
