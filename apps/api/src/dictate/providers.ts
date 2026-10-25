import {
  keysOfPair,
  refinerIds,
  transcriberIds,
  type RefinerId,
  type TranscriberId,
} from "@take-my-word/shared";
import type { SelectedProviders } from "../dictation/dictate.ts";
import { refinerOf, transcriberOf } from "../dictation/providers/registry.ts";
import type { Logger } from "../lib/log.ts";
import { requiredKeys, type ProviderKeys } from "../lib/secrets.ts";

export class UnknownProviderError extends Error {
  constructor(variable: string, value: string, ids: readonly string[]) {
    super(`${variable} is ${JSON.stringify(value)}, which is none of ${ids.join(", ")}.`);
    this.name = "UnknownProviderError";
  }
}

function known<T extends string>(variable: string, value: string, ids: readonly T[]): T {
  if (!(ids as readonly string[]).includes(value)) {
    throw new UnknownProviderError(variable, value, ids);
  }
  return value as T;
}

async function select(
  choice: { TRANSCRIBER: string; REFINER: string },
  keys: () => Promise<ProviderKeys>,
): Promise<SelectedProviders> {
  const pair = {
    transcriber: known<TranscriberId>("TRANSCRIBER", choice.TRANSCRIBER, transcriberIds),
    refiner: known<RefinerId>("REFINER", choice.REFINER, refinerIds),
  };
  const loaded = requiredKeys(await keys(), keysOfPair(pair));
  const fixed = () => Promise.resolve(loaded);
  return {
    transcriber: transcriberOf(pair.transcriber, fixed),
    refiner: refinerOf(pair.refiner, fixed),
  };
}

export async function selectProviders(
  choice: { TRANSCRIBER: string; REFINER: string },
  keys: () => Promise<ProviderKeys>,
  log: Logger,
): Promise<SelectedProviders> {
  try {
    return await select(choice, keys);
  } catch (error) {
    log.error("providers not selected", {
      transcriber: choice.TRANSCRIBER,
      refiner: choice.REFINER,
      reason: error instanceof Error ? error.message : "unknown",
    });
    throw error;
  }
}
