import phrases from "./silence-phrases.json" with { type: "json" };

export interface SilencePhrases {
  hallucinations: readonly string[];
  ambiguous: readonly string[];
}

export interface SilenceLevels {
  floorDbfs: number;
  speechLevelDbfs: number;
}

export const defaultSilenceLevels: SilenceLevels = { floorDbfs: -55, speechLevelDbfs: -40 };

export function normalizeTranscript(text: string): string {
  return text
    .toLocaleLowerCase("es")
    .replace(/[\p{P}\p{S}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function createSilenceGuard(
  known: SilencePhrases = phrases,
): (transcript: { text: string; quiet: boolean }) => boolean {
  const hallucinations = new Set(known.hallucinations.map(normalizeTranscript));
  const ambiguous = new Set(known.ambiguous.map(normalizeTranscript));
  return ({ text, quiet }) => {
    const normalized = normalizeTranscript(text);
    if (normalized === "" || hallucinations.has(normalized)) return true;
    return quiet && ambiguous.has(normalized);
  };
}
