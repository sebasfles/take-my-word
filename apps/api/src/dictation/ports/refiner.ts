import type { Language } from "@take-my-word/shared";

export interface RefineInput {
  raw: string;
  language: Language;
  instructions: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface Refiner {
  readonly label: string;
  refine(input: RefineInput): Promise<{ text: string; usage: TokenUsage }>;
}
