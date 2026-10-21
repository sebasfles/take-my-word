export interface ProjectedTerm {
  term: string;
  aliases: readonly string[];
  useCount: number;
  lastUsedAt: string;
}

const dayMs = 86_400_000;

export function decayedScore(term: ProjectedTerm, now: Date, halfLifeDays: number): number {
  const days = Math.max(0, (now.getTime() - Date.parse(term.lastUsedAt)) / dayMs);
  const score = term.useCount * 0.5 ** (days / halfLifeDays);
  return Number.isFinite(score) ? score : 0;
}

export function estimateTokens(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

export function rankTerms<T extends ProjectedTerm>(
  terms: readonly T[],
  now: Date,
  halfLifeDays: number,
): T[] {
  return terms
    .map((term) => ({ term, score: decayedScore(term, now, halfLifeDays) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.term.lastUsedAt.localeCompare(a.term.lastUsedAt) ||
        a.term.term.localeCompare(b.term.term),
    )
    .map(({ term }) => term);
}

export function transcriberPrompt(
  terms: readonly ProjectedTerm[],
  { now, halfLifeDays, tokenBudget }: { now: Date; halfLifeDays: number; tokenBudget: number },
): { prompt: string; terms: number } {
  let prompt = "";
  let included = 0;
  for (const { term } of rankTerms(terms, now, halfLifeDays)) {
    const candidate = prompt === "" ? term : `${prompt}, ${term}`;
    if (estimateTokens(candidate) > tokenBudget) continue;
    prompt = candidate;
    included += 1;
  }
  return { prompt, terms: included };
}

export function correctionTable(terms: readonly ProjectedTerm[]): string {
  return terms
    .map(({ term, aliases }) =>
      aliases.length > 0 ? `- ${term} (${aliases.join(", ")})` : `- ${term}`,
    )
    .join("\n");
}
