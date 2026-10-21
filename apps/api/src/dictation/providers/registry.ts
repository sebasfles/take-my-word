import type { RefinerId, TranscriberId } from "@take-my-word/shared";
import type { Refiner } from "../ports/refiner.ts";
import type { Transcriber } from "../ports/transcriber.ts";

export interface ProviderRegistry {
  transcribers: Readonly<Record<TranscriberId, Transcriber>>;
  refiners: Readonly<Record<RefinerId, Refiner>>;
}
