import type { Transcript } from "./ports/transcriber.ts";
import phrases from "./silence-phrases.json" with { type: "json" };

export interface SilencePhrases {
  hallucinations: readonly string[];
  ambiguous: readonly string[];
}

export const defaultNoSpeechThreshold = 0.6;

export function normalizeTranscript(text: string): string {
  return text
    .toLocaleLowerCase("es")
    .replace(/[\p{P}\p{S}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function createSilenceGuard({
  noSpeechThreshold = defaultNoSpeechThreshold,
  known = phrases,
}: { noSpeechThreshold?: number; known?: SilencePhrases } = {}): (
  transcript: Transcript,
) => boolean {
  const hallucinations = new Set(known.hallucinations.map(normalizeTranscript));
  const ambiguous = new Set(known.ambiguous.map(normalizeTranscript));
  return ({ text, noSpeechProbability }) => {
    const normalized = normalizeTranscript(text);
    if (normalized === "" || hallucinations.has(normalized)) return true;
    return (
      ambiguous.has(normalized) &&
      noSpeechProbability !== undefined &&
      noSpeechProbability >= noSpeechThreshold
    );
  };
}
