import {
  complimentaryDailyTokens,
  modelFacts,
  prepaidBalances,
  transcriptionCallUsd,
  type ModelFacts,
} from "./prices.ts";

export const dictationSeconds = 15;
export const scenarios = [
  { name: "light month", hours: 2 },
  { name: "heavy month", hours: 30 },
] as const;
export type Scenario = (typeof scenarios)[number];

export const dictationsPerMonth = (scenario: Scenario): number =>
  Math.round((scenario.hours * 3600) / dictationSeconds);

export const daysPerMonth = 30;

export interface StageUse {
  model: string;
  callsPerDictation: number;
  usdPerDictation: number;
  tokensPerCall?: number;
}

export interface StageMonth {
  listUsd: number;
  covered: boolean;
  why: string;
}

export function transcriptionStage(
  model: string,
  callsPerDictation: number,
  usdPerAudioSecond?: number,
): StageUse {
  const facts = modelFacts(model);
  const perCall =
    facts.price.kind === "duration" || usdPerAudioSecond === undefined
      ? transcriptionCallUsd(facts, dictationSeconds)
      : usdPerAudioSecond * dictationSeconds;
  return { model, callsPerDictation, usdPerDictation: perCall * callsPerDictation };
}

function freeCoverage(
  facts: ModelFacts,
  stage: StageUse,
  perDay: number,
): { covered: boolean; why: string } {
  const requests = perDay * stage.callsPerDictation;
  const plan = facts.freePlan;
  if (plan !== undefined) {
    const checks: [string, number, number | undefined][] = [
      ["requests per day", requests, plan.requestsPerDay],
      [
        "audio seconds per day",
        requests *
          Math.max(
            dictationSeconds,
            facts.price.kind === "duration" ? facts.price.minimumBilledSeconds : 0,
          ),
        plan.audioSecondsPerDay,
      ],
      ["tokens per day", requests * (stage.tokensPerCall ?? 0), plan.tokensPerDay],
    ];
    const over = checks.filter(([, used, limit]) => limit !== undefined && used > limit);
    return over.length === 0
      ? {
          covered: true,
          why: `free plan: ${checks
            .filter(([, , limit]) => limit !== undefined)
            .map(([name, used, limit]) => `${String(Math.round(used))} of ${String(limit)} ${name}`)
            .join(", ")}`,
        }
      : {
          covered: false,
          why: `free plan exceeded: ${over.map(([name, used, limit]) => `${String(Math.round(used))} of ${String(limit)} ${name}`).join(", ")}`,
        };
  }
  if (facts.complimentaryGroup !== undefined) {
    const group = complimentaryDailyTokens[facts.complimentaryGroup];
    const tokens = requests * (stage.tokensPerCall ?? 0);
    return tokens <= group.tokens
      ? {
          covered: true,
          why: `complimentary tokens: ${String(Math.round(tokens))} of ${String(group.tokens)} per day`,
        }
      : {
          covered: false,
          why: `complimentary tokens exceeded: ${String(Math.round(tokens))} of ${String(group.tokens)} per day`,
        };
  }
  if (prepaidBalances[facts.provider] !== undefined) {
    return { covered: false, why: "prepaid balance, billed at list price" };
  }
  return { covered: false, why: "no free allowance" };
}

export function stageMonth(stage: StageUse, scenario: Scenario): StageMonth {
  const facts = modelFacts(stage.model);
  const dictations = dictationsPerMonth(scenario);
  const coverage = freeCoverage(facts, stage, dictations / daysPerMonth);
  return { listUsd: stage.usdPerDictation * dictations, ...coverage };
}

export interface RankedRow {
  transcriber: string;
  refiner: string;
  passed: boolean;
  releaseP50: number | undefined;
}

export function rankPassing<T extends RankedRow>(rows: readonly T[]): T[] {
  return rows
    .filter((row) => row.passed && row.releaseP50 !== undefined)
    .sort((a, b) => (a.releaseP50 ?? 0) - (b.releaseP50 ?? 0));
}
