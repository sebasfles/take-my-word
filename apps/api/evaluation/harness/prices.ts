export const pricesCheckedOn = "2026-10-23";

export const sources = {
  openaiPricing: "https://developers.openai.com/api/docs/pricing",
  openaiDeprecations: "https://developers.openai.com/api/docs/deprecations",
  openaiComplimentary:
    "https://help.openai.com/en/articles/10306912-sharing-feedback-evaluation-and-fine-tuning-data-and-api-inputs-and-outputs-with-openai",
  groqModels: "https://console.groq.com/docs/models",
  groqRateLimits: "https://console.groq.com/docs/rate-limits",
  groqDeprecations: "https://console.groq.com/docs/deprecations",
  pollyPricing: "https://aws.amazon.com/polly/pricing/",
  openaiModel: (model: string) => `https://developers.openai.com/api/docs/models/${model}`,
  togetherPricing: "https://www.together.ai/pricing",
  togetherSpeechToText: "https://docs.together.ai/docs/speech-to-text",
  cerebrasModel: (page: string) => `https://inference-docs.cerebras.ai/models/${page}`,
  cerebrasRateLimits: "https://inference-docs.cerebras.ai/support/rate-limits",
} as const;

export type Provider = "groq" | "openai" | "together" | "cerebras";

export interface PrepaidBalance {
  startUsd: number;
  since: string;
  floorUsd: number;
}

export const prepaidBalances: Readonly<Partial<Record<Provider, PrepaidBalance>>> = {
  together: { startUsd: 15, since: "2026-10-24", floorUsd: 5 },
  cerebras: { startUsd: 15, since: "2026-10-24", floorUsd: 5 },
};

export interface AudioPrice {
  kind: "duration";
  usdPerMinute: number;
  minimumBilledSeconds: number;
  source: string;
}

export interface AudioTokenPrice {
  kind: "audio-tokens";
  usdPerMillionInput: number;
  usdPerMillionOutput: number;
  estimatedUsdPerMinute: number;
  source: string;
}

export interface TokenPrice {
  kind: "tokens";
  usdPerMillionInput: number;
  usdPerMillionOutput: number;
  source: string;
}

export interface FreePlanLimits {
  requestsPerMinute: number;
  requestsPerDay: number;
  audioSecondsPerHour?: number;
  audioSecondsPerDay?: number;
  tokensPerMinute?: number;
  tokensPerDay?: number;
  tokensPerDayKept?: number;
  minuteShare?: number;
  source: string;
}

export interface ModelFacts {
  provider: Provider;
  model: string;
  price: AudioPrice | AudioTokenPrice | TokenPrice;
  freePlan?: FreePlanLimits;
  complimentaryGroup?: keyof typeof complimentaryDailyTokens;
  retires?: { on: string; source: string };
  checkedOn?: string;
}

const groqWhisperPlan: FreePlanLimits = {
  requestsPerMinute: 20,
  requestsPerDay: 2_000,
  audioSecondsPerHour: 7_200,
  audioSecondsPerDay: 28_800,
  minuteShare: 0.25,
  source: sources.groqRateLimits,
};

const groqChatPlan: FreePlanLimits = {
  requestsPerMinute: 30,
  requestsPerDay: 1_000,
  tokensPerMinute: 8_000,
  tokensPerDay: 200_000,
  tokensPerDayKept: 10_000,
  source: sources.groqRateLimits,
};

const openaiTranscriptionRetirement = { on: "2027-02-26", source: sources.openaiDeprecations };

export const complimentaryDailyTokens = {
  "openai-small": {
    tokens: 2_500_000,
    note: "data-sharing complimentary tokens, smaller-model group, lowest usage tier; resets 00:00 UTC; billed at list price beyond it",
    source: sources.openaiComplimentary,
  },
} as const;

export const models: Readonly<Record<string, ModelFacts>> = {
  "whisper-large-v3-turbo": {
    provider: "groq",
    model: "whisper-large-v3-turbo",
    price: {
      kind: "duration",
      usdPerMinute: 0.04 / 60,
      minimumBilledSeconds: 10,
      source: sources.groqModels,
    },
    freePlan: groqWhisperPlan,
  },
  "whisper-large-v3": {
    provider: "groq",
    model: "whisper-large-v3",
    price: {
      kind: "duration",
      usdPerMinute: 0.111 / 60,
      minimumBilledSeconds: 10,
      source: sources.groqModels,
    },
    freePlan: groqWhisperPlan,
  },
  "gpt-transcribe": {
    provider: "openai",
    model: "gpt-transcribe",
    price: {
      kind: "duration",
      usdPerMinute: 0.0045,
      minimumBilledSeconds: 0,
      source: sources.openaiPricing,
    },
  },
  "gpt-4o-transcribe": {
    provider: "openai",
    model: "gpt-4o-transcribe",
    price: {
      kind: "audio-tokens",
      usdPerMillionInput: 2.5,
      usdPerMillionOutput: 10,
      estimatedUsdPerMinute: 0.006,
      source: sources.openaiModel("gpt-4o-transcribe"),
    },
    retires: openaiTranscriptionRetirement,
  },
  "gpt-4o-mini-transcribe": {
    provider: "openai",
    model: "gpt-4o-mini-transcribe",
    price: {
      kind: "audio-tokens",
      usdPerMillionInput: 1.25,
      usdPerMillionOutput: 5,
      estimatedUsdPerMinute: 0.003,
      source: sources.openaiModel("gpt-4o-mini-transcribe"),
    },
    retires: openaiTranscriptionRetirement,
  },
  "gpt-5.4-nano": {
    provider: "openai",
    model: "gpt-5.4-nano",
    price: {
      kind: "tokens",
      usdPerMillionInput: 0.2,
      usdPerMillionOutput: 1.25,
      source: sources.openaiPricing,
    },
    complimentaryGroup: "openai-small",
    retires: { on: "2027-04-01", source: sources.openaiDeprecations },
  },
  "gpt-5.6-luna": {
    provider: "openai",
    model: "gpt-5.6-luna",
    price: {
      kind: "tokens",
      usdPerMillionInput: 0.2,
      usdPerMillionOutput: 1.2,
      source: sources.openaiPricing,
    },
    complimentaryGroup: "openai-small",
  },
  "gpt-6-luna": {
    provider: "openai",
    model: "gpt-6-luna",
    price: {
      kind: "tokens",
      usdPerMillionInput: 0.1,
      usdPerMillionOutput: 0.5,
      source: sources.openaiPricing,
    },
  },
  "openai/gpt-oss-120b": {
    provider: "groq",
    model: "openai/gpt-oss-120b",
    price: {
      kind: "tokens",
      usdPerMillionInput: 0.15,
      usdPerMillionOutput: 0.6,
      source: sources.groqModels,
    },
    freePlan: groqChatPlan,
  },
  "openai/gpt-oss-20b": {
    provider: "groq",
    model: "openai/gpt-oss-20b",
    price: {
      kind: "tokens",
      usdPerMillionInput: 0.075,
      usdPerMillionOutput: 0.3,
      source: sources.groqModels,
    },
    freePlan: groqChatPlan,
  },
  "nvidia/parakeet-tdt-0.6b-v3": {
    provider: "together",
    model: "nvidia/parakeet-tdt-0.6b-v3",
    price: {
      kind: "duration",
      usdPerMinute: 0.0015,
      minimumBilledSeconds: 0,
      source: sources.togetherPricing,
    },
    checkedOn: "2026-10-24",
  },
  "openai/whisper-large-v3": {
    provider: "together",
    model: "openai/whisper-large-v3",
    price: {
      kind: "duration",
      usdPerMinute: 0.0015,
      minimumBilledSeconds: 0,
      source: sources.togetherPricing,
    },
    checkedOn: "2026-10-24",
  },
  "qwen-3.8-27b": {
    provider: "cerebras",
    model: "qwen-3.8-27b",
    price: {
      kind: "tokens",
      usdPerMillionInput: 0.99,
      usdPerMillionOutput: 1.49,
      source: sources.cerebrasModel("qwen-3.8-27b"),
    },
    checkedOn: "2026-10-24",
  },
  "gpt-oss-120b": {
    provider: "cerebras",
    model: "gpt-oss-120b",
    price: {
      kind: "tokens",
      usdPerMillionInput: 0.35,
      usdPerMillionOutput: 0.75,
      source: sources.cerebrasModel("openai-oss"),
    },
    checkedOn: "2026-10-24",
  },
};

export const notServed = [
  {
    provider: "groq",
    model: "llama-3.1-8b-instant",
    reason:
      "shut down on Groq's free and developer plans on 2026-08-16 (Enterprise only); Groq names openai/gpt-oss-20b as its replacement",
    source: sources.groqDeprecations,
  },
  {
    provider: "groq",
    model: "qwen/qwen3-32b",
    reason: "shut down on Groq on 2026-07-17; Groq names openai/gpt-oss-120b as its replacement",
    source: sources.groqDeprecations,
  },
] as const;

export const pollyNeuralUsdPerMillionCharacters = 19.2;

export const runBudgetUsd = 3;

const providerNames: Readonly<Record<Provider, string>> = {
  groq: "Groq",
  openai: "OpenAI",
  together: "Together",
  cerebras: "Cerebras",
};

export function pricesCheckedFor(modelIds: readonly string[]): string {
  const byDate = new Map<string, Set<string>>();
  for (const model of modelIds) {
    const facts = modelFacts(model);
    const date = facts.checkedOn ?? pricesCheckedOn;
    byDate.set(date, (byDate.get(date) ?? new Set()).add(providerNames[facts.provider]));
  }
  return [...byDate]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, providers]) => `${date} (${[...providers].join(", ")})`)
    .join(" and ");
}

export function modelFacts(model: string): ModelFacts {
  const facts = models[model];
  if (facts === undefined) throw new Error(`no dated facts for ${model}`);
  return facts;
}

export interface CallUsage {
  seconds?: number | undefined;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
}

export function billedAudioSeconds(
  facts: ModelFacts,
  clipSeconds: number,
  usage?: CallUsage,
): number {
  if (facts.price.kind !== "duration") return clipSeconds;
  return Math.max(facts.price.minimumBilledSeconds, Math.ceil(usage?.seconds ?? clipSeconds));
}

export function transcriptionCallUsd(
  facts: ModelFacts,
  clipSeconds: number,
  usage?: CallUsage,
): number {
  const price = facts.price;
  if (price.kind === "duration") {
    return (billedAudioSeconds(facts, clipSeconds, usage) / 60) * price.usdPerMinute;
  }
  if (price.kind === "audio-tokens") {
    if (usage?.inputTokens === undefined || usage.outputTokens === undefined) {
      return (clipSeconds / 60) * price.estimatedUsdPerMinute;
    }
    return (
      (usage.inputTokens * price.usdPerMillionInput +
        usage.outputTokens * price.usdPerMillionOutput) /
      1_000_000
    );
  }
  throw new Error(`${facts.model} is not a transcription model`);
}

export function tokenCostUsd(facts: ModelFacts, inputTokens: number, outputTokens: number): number {
  if (facts.price.kind !== "tokens") throw new Error(`${facts.model} is not priced by chat tokens`);
  return (
    (inputTokens * facts.price.usdPerMillionInput +
      outputTokens * facts.price.usdPerMillionOutput) /
    1_000_000
  );
}

export function chargedUsd(facts: ModelFacts, listUsd: number): number {
  return facts.freePlan === undefined ? listUsd : 0;
}
