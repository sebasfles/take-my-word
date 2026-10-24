import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import type { ProviderCall, ProviderRequest } from "../../src/eval/contract.ts";
import {
  buildEvalBundle,
  deployEvalFunction,
  type EvalBundle,
  type EvalFunction,
} from "./eval-lambda.ts";
import {
  CostGuard,
  Pacer,
  prepaidOutlook,
  requireAboveFloor,
  type LedgerEntry,
  type PacingKey,
  type PacingOverrides,
} from "./pacing.ts";
import {
  complimentaryDailyTokens,
  freePlanAt,
  modelFacts,
  paidPlans,
  pollyNeuralUsdPerMillionCharacters,
  prepaidBalances,
  runBudgetUsd,
} from "./prices.ts";
import { runSchedule, type PlannedItem } from "./scheduler.ts";
import { appendJsonl, readJsonl, type ResultsDir } from "./store.ts";
import { fromInvocation, type Workspace } from "./workspace.ts";

export interface SuiteArgs {
  results?: string;
  report?: string;
  runs: number;
  smoke: boolean;
  overrides: PacingOverrides;
}

export function suiteArgs(usage: string, defaultRuns: number): SuiteArgs {
  const { values } = parseArgs({
    options: {
      results: { type: "string" },
      report: { type: "string" },
      runs: { type: "string", default: String(defaultRuns) },
      smoke: { type: "boolean", default: false },
      "whisper-daily-kept": { type: "string" },
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
    ...(values.results !== undefined && { results: fromInvocation(values.results) }),
    ...(values.report !== undefined && { report: fromInvocation(values.report) }),
    runs,
    smoke: values.smoke,
    overrides: overridesFrom(values["whisper-daily-kept"]),
  };
}

export function overridesFrom(whisperDailyKept: string | undefined): PacingOverrides {
  if (whisperDailyKept === undefined) return {};
  const kept = Number(whisperDailyKept);
  if (!Number.isFinite(kept)) throw new Error("--whisper-daily-kept must be a fraction");
  return { whisperDailyKept: kept };
}

export function describeOverrides(overrides: PacingOverrides): string[] {
  return overrides.whisperDailyKept === undefined
    ? []
    : [
        `Groq Whisper daily limits kept ${String(overrides.whisperDailyKept * 100)}% free for production instead of half (--whisper-daily-kept ${String(overrides.whisperDailyKept)}); per-minute and hourly pacing unchanged`,
      ];
}

export const pacingKeyOf = (model: string): string => `${modelFacts(model).provider}:${model}`;

export function pacingKeys(models: readonly string[]): Map<string, PacingKey> {
  return new Map(
    models.map((model) => {
      const facts = modelFacts(model);
      const group = facts.complimentaryGroup;
      const prepaid = prepaidBalances[facts.provider];
      const plan = freePlanAt(facts);
      const paidFloors = plan === undefined ? paidPlans[facts.provider]?.headerFloors : undefined;
      return [
        pacingKeyOf(model),
        {
          provider: facts.provider,
          ...(plan && { plan }),
          ...(prepaid && { prepaid }),
          ...(paidFloors && { paidFloors }),
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

export async function deployAndWarm(
  workspace: Workspace,
  bundle?: EvalBundle,
): Promise<EvalFunction> {
  await workspace.requireAccount();
  console.log(`building and swapping ${workspace.evalFunctionName}`);
  const evalFunction = await deployEvalFunction(
    workspace.lambda,
    workspace.evalFunctionName,
    bundle ?? (await buildEvalBundle()),
  );
  const warm = await evalFunction.invoke({ kind: "warmup" });
  console.log(`warm: ${warm.region}, cold start ${String(warm.coldStart)}`);
  return evalFunction;
}

export function requestsSha256(
  requests: readonly { id: string; request: ProviderRequest }[],
): string {
  const hash = createHash("sha256");
  for (const { id, request } of [...requests].sort((a, b) => a.id.localeCompare(b.id))) {
    const comparable =
      request.kind === "transcribe"
        ? {
            ...request,
            audioBase64: createHash("sha256").update(request.audioBase64).digest("hex"),
          }
        : request;
    hash.update(`${id}\t${JSON.stringify(comparable)}\n`);
  }
  return hash.digest("hex");
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

export function recordedSpendUsd(dir: Omit<ResultsDir, "meta">): number {
  const sum = (records: readonly Charged[]) =>
    records.reduce((total, record) => total + record.chargedUsd, 0);
  return (
    sum(readJsonl<Charged>(dir.results)) +
    sum(readJsonl<FailureRecord>(dir.failures)) +
    sum(readJsonl<Charged>(dir.synthesis))
  );
}

export const synthesisUsd = (characters: number): number =>
  (characters * pollyNeuralUsdPerMillionCharacters) / 1_000_000;

export function requireSynthesisBudget(
  dir: Omit<ResultsDir, "meta">,
  characters: number,
  budgetUsd = runBudgetUsd,
): void {
  const spent = recordedSpendUsd(dir);
  console.log(
    `synthesizing ${String(characters)} characters with Polly, ${synthesisUsd(characters).toFixed(3)} USD at list price, after ${spent.toFixed(3)} USD already spent`,
  );
  new CostGuard(budgetUsd, spent).check(synthesisUsd(characters));
}

export function recordSynthesis(dir: ResultsDir, characters: number): void {
  appendJsonl(dir.synthesis, {
    at: new Date().toISOString(),
    characters,
    chargedUsd: synthesisUsd(characters),
  });
}

export async function executePlan<R extends Charged>(
  dir: ResultsDir,
  models: readonly string[],
  items: readonly PlannedItem<R>[],
  options: {
    now?: () => number;
    wait?: (ms: number) => Promise<unknown>;
    overrides?: PacingOverrides;
  } = {},
): Promise<boolean> {
  const ledger = readJsonl<LedgerEntry>(dir.ledger);
  const overrides = options.overrides ?? {};
  const keys = pacingKeys(models);
  const pacer = new Pacer(keys, ledger, undefined, overrides);
  for (const line of describeOverrides(overrides)) {
    appendJsonl(dir.overrides, { at: new Date().toISOString(), note: line });
    console.log(`override: ${line}`);
  }
  const guard = new CostGuard(runBudgetUsd, recordedSpendUsd(dir));
  const stages = items.flatMap((item) => [
    { pacingKey: item.pacingKey, estimate: item.estimate },
    ...(item.alsoPaced ?? []),
  ]);
  const estimate = stages.reduce((sum, stage) => sum + stage.estimate.costUsd, 0);
  console.log(
    `${String(items.length)} calls pending, estimated ${estimate.toFixed(3)} USD charged after ${guard.spentUsd.toFixed(3)} USD already spent (budget ${runBudgetUsd.toFixed(2)} USD per run)`,
  );
  guard.check(estimate);
  const outlooks = prepaidOutlook(keys, pacer, stages);
  for (const { provider, leftUsd, estimateUsd, floorUsd } of outlooks) {
    console.log(
      `${provider}: estimated ${estimateUsd.toFixed(3)} USD of ${leftUsd.toFixed(3)} USD left by the ledger (floor ${floorUsd.toFixed(2)} USD)`,
    );
  }
  requireAboveFloor(outlooks);
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
    console.log(
      "paused to keep half of the free plans for production; rerun the same command after the times below:",
    );
    for (const reason of outcome.reasons) console.log(`- ${reason}`);
    return false;
  }
  console.log(`all calls done, ${guard.spentUsd.toFixed(3)} USD spent in this run`);
  return true;
}
