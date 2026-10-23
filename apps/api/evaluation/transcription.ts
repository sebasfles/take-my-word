import { writeFileSync } from "node:fs";
import type { ProviderRequest } from "../src/eval/contract.ts";
import { transcriberCandidates, type TranscriberCandidate } from "./harness/candidates.ts";
import type { EvalFunction } from "./harness/eval-lambda.ts";
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
import { audioCostUsd, billedAudioSeconds, modelFacts } from "./harness/prices.ts";
import type { Attempt, PlannedItem } from "./harness/scheduler.ts";
import { openResultsDir, readJsonl } from "./harness/store.ts";
import { deployAndWarm, executePlan, headersOf, pacingKeyOf, suiteArgs } from "./harness/suite.ts";
import {
  check,
  summarize,
  type CandidateSummary,
  type TranscriptionResult,
} from "./harness/transcription-analysis.ts";
import { transcriptionReport } from "./harness/transcription-report.ts";
import {
  evaluationCodePaths,
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
): PlannedItem<TranscriptionResult>[] {
  const items: PlannedItem<TranscriptionResult>[] = [];
  for (let run = 1; run <= runs; run += 1) {
    for (const clip of clips) {
      for (const mode of languageModes) {
        for (const candidate of transcriberCandidates) {
          const facts = modelFacts(candidate.spec.model);
          const calls = mode === "both" ? 2 : 1;
          const billed = billedAudioSeconds(facts, Math.ceil(clip.seconds));
          const charged =
            facts.provider === "groq" ? 0 : audioCostUsd(facts, Math.ceil(clip.seconds));
          const connection = run === 1 ? "fresh" : "reused";
          const id = `${candidate.id}|${clip.id}|${mode}|${String(run)}`;
          items.push({
            id,
            pacingKey: pacingKeyOf(candidate.spec.model),
            estimate: {
              requests: calls,
              audioSeconds: billed * calls,
              tokens: 0,
              costUsd: charged * calls,
            },
            run: async (): Promise<Attempt<TranscriptionResult>> => {
              try {
                const response = await (
                  await evalFunction()
                ).invoke(request(candidate, clip, mode, connection));
                const made = response.calls.length;
                const result: TranscriptionResult = {
                  id,
                  candidate: candidate.id,
                  caseId: clip.item.id,
                  voice: clip.voice,
                  mode,
                  run,
                  connection,
                  audioSeconds: clip.seconds,
                  levelDbfs: clip.levelDbfs,
                  ok: response.ok,
                  ...(response.text !== undefined && { text: response.text }),
                  ...(response.language !== undefined && { language: response.language }),
                  ...(response.error !== undefined && { error: response.error }),
                  calls: response.calls,
                  coldStart: response.coldStart,
                  region: response.region,
                  memoryMb: response.memoryMb,
                  costUsd: charged * made,
                  at: new Date().toISOString(),
                };
                return {
                  result,
                  usage: { requests: made, audioSeconds: billed * made, tokens: 0 },
                  costUsd: charged * made,
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

async function measure(results: string, reportPath: string): Promise<void> {
  const state = requireCommittedFixtures(transcriptionFixturesPath, evaluationCodePaths);
  const codeCommit = lastCommitTouching(evaluationCodePaths);
  const fixturesSha256 = sha256(transcriptionFixturesPath);
  const dir = openResultsDir(
    results,
    { suite: "transcription", fixturesSha256, codeCommit, runs: args.runs },
    new Date(),
  );
  console.log(`code ${codeCommit} (HEAD ${state.commit}), fixtures ${fixturesSha256.slice(0, 16)}`);

  const clips: Clip[] = [];
  for (const item of fixtures.cases) {
    for (const voice of voicesFor(fixtures, item))
      clips.push(await buildClip(workspace.polly, item, voice));
  }
  console.log(
    `${String(clips.length)} clips, ${clips.reduce((sum, clip) => sum + clip.seconds, 0).toFixed(0)} s of audio`,
  );

  const done = new Set(readJsonl<TranscriptionResult>(dir.results).map((result) => result.id));
  let deployed: Promise<EvalFunction> | undefined;
  const evalFunction = () => (deployed ??= deployAndWarm(workspace));
  const pending = plan(evalFunction, clips, args.runs).filter((item) => !done.has(item.id));
  const complete =
    pending.length === 0 ||
    (await executePlan(
      dir,
      transcriberCandidates.map((candidate) => candidate.spec.model),
      pending,
      (id) => id.split("|")[0] ?? "",
    ));
  if (!complete) return;

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
  const summaries = new Map<string, CandidateSummary>(
    transcriberCandidates.map((candidate) => [
      candidate.id,
      summarize(candidate.id, checked, longIds),
    ]),
  );
  const failures = readJsonl<{ candidate: string; status?: number; message: string }>(dir.failures);
  writeFileSync(
    reportPath,
    transcriptionReport(
      {
        command: `pnpm --filter @take-my-word/api eval:transcription --results ${results} --report ${reportPath} --runs ${String(args.runs)}`,
        generatedAt: new Date().toISOString(),
        codeCommit,
        fixturesSha256,
        functionName: workspace.evalFunctionName,
        memoryMb: [...new Set(stored.map((result) => result.memoryMb))].join(", "),
        region: [...new Set(stored.map((result) => result.region))].join(", "),
        runs: args.runs,
        spentUsd: stored.reduce((sum, result) => sum + result.costUsd, 0),
        failedAttempts: failures,
      },
      fixtures,
      transcriberCandidates,
      summaries,
      checked,
    ),
  );
  console.log(`report written to ${reportPath}`);
}

if (args.smoke) await smoke();
else if (args.results !== undefined && args.report !== undefined)
  await measure(args.results, args.report);
