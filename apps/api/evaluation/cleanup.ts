import { writeFileSync } from "node:fs";
import type { Connection, ProviderRequest } from "../src/eval/contract.ts";
import { refinerCandidates, type RefinerCandidate } from "./harness/candidates.ts";
import {
  checkCleanup,
  summarizeCleanup,
  type CleanupResult,
  type CleanupSummary,
} from "./harness/cleanup-analysis.ts";
import {
  cleanupFixturesPath,
  instructionsFor,
  loadCleanupFixtures,
  type CleanupCase,
} from "./harness/cleanup-fixtures.ts";
import { cleanupReport } from "./harness/cleanup-report.ts";
import type { EvalFunction } from "./harness/eval-lambda.ts";
import { loadTranscriptionFixtures, transcriptionFixturesPath } from "./harness/fixtures.ts";
import { chargedUsd, modelFacts, tokenCostUsd } from "./harness/prices.ts";
import type { Attempt, PlannedItem } from "./harness/scheduler.ts";
import { openResultsDir, readJsonl } from "./harness/store.ts";
import {
  deployAndWarm,
  executePlan,
  headersOf,
  pacingKeyOf,
  recordedSpendUsd,
  suiteArgs,
  type FailureRecord,
} from "./harness/suite.ts";
import {
  evaluationCodePaths,
  lastCommitTouching,
  openWorkspace,
  requireCommittedFixtures,
  sha256,
} from "./harness/workspace.ts";

const usage = "usage: pnpm eval:cleanup --results <dir> --report <report.md> [--runs 3] | --smoke";
const args = suiteArgs(usage, 3);
const workspace = openWorkspace();
const transcription = loadTranscriptionFixtures();

const estimatedOutputTokens = 600;

function request(
  candidate: RefinerCandidate,
  item: CleanupCase,
  connection: Connection,
): ProviderRequest {
  return {
    kind: "refine",
    connection,
    refiner: candidate.spec,
    raw: item.raw,
    language: item.language,
    instructions: instructionsFor(transcription, item),
  };
}

async function smoke(): Promise<void> {
  const evalFunction = await deployAndWarm(workspace);
  const item: CleanupCase = {
    id: "smoke",
    language: "es",
    style: "plain",
    dictionary: "developer",
    source: "smoke",
    raw: "eh bueno esto es una prueba corta del del harness",
    expected: ["Esto es una prueba corta del harness."],
    required: [],
    forbidden: [],
    terms: [],
    fillers: [],
    styleRequired: [],
    styleForbidden: [],
    allowed: [],
  };
  for (const candidate of refinerCandidates) {
    const response = await evalFunction.invoke(request(candidate, item, "fresh"));
    console.log(
      JSON.stringify({
        candidate: candidate.id,
        ok: response.ok,
        text: response.text,
        usage: response.usage,
        error: response.error,
        ms: response.calls.map((call) => Math.round(call.ms)),
      }),
    );
  }
}

function plan(
  evalFunction: () => Promise<EvalFunction>,
  cases: readonly CleanupCase[],
  runs: number,
): PlannedItem<CleanupResult>[] {
  const items: PlannedItem<CleanupResult>[] = [];
  for (let run = 1; run <= runs; run += 1) {
    for (const item of cases) {
      for (const candidate of refinerCandidates) {
        const facts = modelFacts(candidate.spec.model);
        const connection: Connection = run === 1 ? "fresh" : "reused";
        const id = `${candidate.id}|${item.id}|one|${String(run)}`;
        const inputTokens = Math.ceil(
          (instructionsFor(transcription, item).length + item.raw.length) / 3,
        );
        const base = { id, candidate: candidate.id, caseId: item.id, run, connection };
        items.push({
          id,
          pacingKey: pacingKeyOf(candidate.spec.model),
          estimate: {
            requests: 1,
            audioSeconds: 0,
            tokens: inputTokens + estimatedOutputTokens,
            costUsd: chargedUsd(facts, tokenCostUsd(facts, inputTokens, estimatedOutputTokens)),
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
          run: async (): Promise<Attempt<CleanupResult>> => {
            try {
              const response = await (
                await evalFunction()
              ).invoke(request(candidate, item, connection));
              const tokens = response.usage ?? { inputTokens: 0, outputTokens: 0 };
              const listUsd = tokenCostUsd(facts, tokens.inputTokens, tokens.outputTokens);
              const charged = chargedUsd(facts, listUsd);
              return {
                result: {
                  ...base,
                  ok: response.ok,
                  ...(response.text !== undefined && { text: response.text }),
                  ...(response.error !== undefined && { error: response.error }),
                  ...(response.usage !== undefined && { usage: response.usage }),
                  calls: response.calls,
                  coldStart: response.coldStart,
                  region: response.region,
                  memoryMb: response.memoryMb,
                  listUsd,
                  chargedUsd: charged,
                  at: new Date().toISOString(),
                },
                usage: {
                  requests: response.calls.length,
                  audioSeconds: 0,
                  tokens: tokens.inputTokens + tokens.outputTokens,
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
  return items;
}

async function measure(results: string, reportPath: string): Promise<void> {
  const state = requireCommittedFixtures(cleanupFixturesPath, [
    transcriptionFixturesPath,
    ...evaluationCodePaths,
  ]);
  const fixtures = loadCleanupFixtures(transcription);
  const codeCommit = lastCommitTouching(evaluationCodePaths);
  const fixturesSha256 = sha256(cleanupFixturesPath);
  const dir = openResultsDir(
    results,
    {
      suite: "cleanup",
      fixturesSha256,
      codeCommit,
      runs: args.runs,
      clips: { transcriptionFixtures: sha256(transcriptionFixturesPath) },
    },
    new Date(),
  );
  console.log(`code ${codeCommit} (HEAD ${state.commit}), fixtures ${fixturesSha256.slice(0, 16)}`);

  const done = new Set(readJsonl<CleanupResult>(dir.results).map((result) => result.id));
  let deployed: Promise<EvalFunction> | undefined;
  const evalFunction = () => (deployed ??= deployAndWarm(workspace));
  const pending = plan(evalFunction, fixtures.cases, args.runs).filter(
    (item) => !done.has(item.id),
  );
  const complete =
    pending.length === 0 ||
    (await executePlan(
      dir,
      [...new Set(refinerCandidates.map((candidate) => candidate.spec.model))],
      pending,
    ));
  if (!complete) return;

  const stored = readJsonl<CleanupResult>(dir.results);
  const byId = new Map(fixtures.cases.map((item) => [item.id, item]));
  const checked = stored.map((result) => {
    const item = byId.get(result.caseId);
    if (item === undefined) throw new Error(`no fixture case ${result.caseId}`);
    return checkCleanup(result, item);
  });
  const failures = readJsonl<FailureRecord>(dir.failures);
  const summaries = new Map<string, CleanupSummary>(
    refinerCandidates.map((candidate) => [
      candidate.id,
      summarizeCleanup(candidate.id, checked, failures),
    ]),
  );
  writeFileSync(
    reportPath,
    cleanupReport(
      {
        command: `pnpm --filter @take-my-word/api eval:cleanup --results ${results} --report ${reportPath} --runs ${String(args.runs)}`,
        generatedAt: new Date().toISOString(),
        codeCommit,
        fixturesSha256,
        functionName: workspace.evalFunctionName,
        memoryMb: [...new Set(stored.filter((r) => r.memoryMb > 0).map((r) => r.memoryMb))].join(
          ", ",
        ),
        region: [...new Set(stored.filter((r) => r.region !== "").map((r) => r.region))].join(", "),
        runs: args.runs,
        listUsd: stored.reduce((sum, result) => sum + result.listUsd, 0),
        chargedUsd: recordedSpendUsd(dir),
        failedAttempts: failures,
      },
      fixtures,
      refinerCandidates,
      summaries,
      checked,
    ),
  );
  console.log(`report written to ${reportPath}`);
}

if (args.smoke) await smoke();
else if (args.results !== undefined && args.report !== undefined) {
  await measure(args.results, args.report);
}
