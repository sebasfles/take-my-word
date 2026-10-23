import { parseArgs } from "node:util";
import type { ProviderCall } from "../../src/eval/contract.ts";
import { deployEvalFunction, type EvalFunction } from "./eval-lambda.ts";
import { CostGuard, Pacer, type LedgerEntry, type PacingKey } from "./pacing.ts";
import { complimentaryDailyTokens, modelFacts, runBudgetUsd } from "./prices.ts";
import { runSchedule, type PlannedItem } from "./scheduler.ts";
import { appendJsonl, readJsonl, type ResultsDir } from "./store.ts";
import type { Workspace } from "./workspace.ts";

export interface SuiteArgs {
  results?: string;
  report?: string;
  runs: number;
  smoke: boolean;
}

export function suiteArgs(usage: string, defaultRuns: number): SuiteArgs {
  const { values } = parseArgs({
    options: {
      results: { type: "string" },
      report: { type: "string" },
      runs: { type: "string", default: String(defaultRuns) },
      smoke: { type: "boolean", default: false },
    },
  });
  const runs = Number(values.runs);
  if (!values.smoke && (values.results === undefined || values.report === undefined)) {
    console.error(usage);
    process.exit(2);
  }
  if (!Number.isInteger(runs) || runs < 3)
    throw new Error("--runs must be an integer of at least 3");
  return {
    ...(values.results !== undefined && { results: values.results }),
    ...(values.report !== undefined && { report: values.report }),
    runs,
    smoke: values.smoke,
  };
}

export const pacingKeyOf = (model: string): string => `${modelFacts(model).provider}:${model}`;

export function pacingKeys(models: readonly string[]): Map<string, PacingKey> {
  return new Map(
    models.map((model) => {
      const facts = modelFacts(model);
      const group = facts.complimentaryGroup;
      return [
        pacingKeyOf(model),
        {
          provider: facts.provider,
          ...(facts.freePlan && { plan: facts.freePlan }),
          ...(group && {
            complimentary: { group, tokensPerDay: complimentaryDailyTokens[group].tokens },
          }),
        },
      ];
    }),
  );
}

export const headersOf = (calls: readonly ProviderCall[]): Record<string, string> =>
  calls.reduce<Record<string, string>>((merged, call) => ({ ...merged, ...call.headers }), {});

export async function deployAndWarm(workspace: Workspace): Promise<EvalFunction> {
  console.log(`building and swapping ${workspace.evalFunctionName}`);
  const evalFunction = await deployEvalFunction(workspace.lambda, workspace.evalFunctionName);
  const warm = await evalFunction.invoke({ kind: "warmup" });
  console.log(`warm: ${warm.region}, cold start ${String(warm.coldStart)}`);
  return evalFunction;
}

export interface Charged {
  chargedUsd: number;
}

export interface FailureRecord extends Charged {
  id: string;
  attempt: number;
  status?: number;
  message: string;
  at: string;
}

export function recordedSpendUsd(dir: ResultsDir): number {
  const sum = (records: readonly Charged[]) =>
    records.reduce((total, record) => total + record.chargedUsd, 0);
  return sum(readJsonl<Charged>(dir.results)) + sum(readJsonl<FailureRecord>(dir.failures));
}

export async function executePlan<R extends Charged>(
  dir: ResultsDir,
  models: readonly string[],
  items: readonly PlannedItem<R>[],
  options: { now?: () => number; wait?: (ms: number) => Promise<unknown> } = {},
): Promise<boolean> {
  const ledger = readJsonl<LedgerEntry>(dir.ledger);
  const pacer = new Pacer(pacingKeys(models), ledger);
  const guard = new CostGuard(runBudgetUsd, recordedSpendUsd(dir));
  const estimate = items.reduce((sum, item) => sum + item.estimate.costUsd, 0);
  console.log(
    `${String(items.length)} calls pending, estimated ${estimate.toFixed(3)} USD charged after ${guard.spentUsd.toFixed(3)} USD already spent (budget ${runBudgetUsd.toFixed(2)} USD per run)`,
  );
  guard.check(estimate);
  const outcome = await runSchedule(
    items,
    pacer,
    guard,
    {
      done: (_id, result) => {
        appendJsonl(dir.results, result);
      },
      failed: (id, failure, attempt, costUsd) => {
        const record: FailureRecord = {
          id,
          attempt,
          ...(failure.status !== undefined && { status: failure.status }),
          message: failure.message,
          chargedUsd: costUsd,
          at: new Date().toISOString(),
        };
        appendJsonl(dir.failures, record);
        console.log(`${id} failed (attempt ${String(attempt)}): ${failure.message}`);
      },
      usage: (entry) => {
        appendJsonl(dir.ledger, entry);
      },
      progress: (message) => {
        console.log(message);
      },
    },
    options.now,
    options.wait,
  );
  if (outcome.kind === "paused") {
    console.log("paused for today, rerun the same command after 00:00 UTC:");
    for (const reason of outcome.reasons) console.log(`- ${reason}`);
    return false;
  }
  console.log(`all calls done, ${guard.spentUsd.toFixed(3)} USD spent in this run`);
  return true;
}
