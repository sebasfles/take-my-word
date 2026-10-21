import { rankTerms, type RankableTerm } from "@take-my-word/shared";

export interface ProjectedTerm extends RankableTerm {
  aliases: readonly string[];
}

export function estimateTokens(text: string): number {
  return Buffer.byteLength(text, "utf8");
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
