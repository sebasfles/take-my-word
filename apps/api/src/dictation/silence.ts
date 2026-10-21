import phrases from "./silence-phrases.json" with { type: "json" };

export function normalizeTranscript(text: string): string {
  return text
    .toLocaleLowerCase("es")
    .replace(/[\p{P}\p{S}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function createSilenceGuard(known: readonly string[] = phrases): (raw: string) => boolean {
  const set = new Set(known.map(normalizeTranscript));
  return (raw) => {
    const normalized = normalizeTranscript(raw);
    return normalized === "" || set.has(normalized);
  };
}
