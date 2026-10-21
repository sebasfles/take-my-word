import { z } from "zod";

export const dictionaryLimits = { terms: 500, aliasesPerTerm: 10, termLength: 64 } as const;

export function normalizeTerm(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const termText = z
  .string()
  .transform((text) => text.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1).max(dictionaryLimits.termLength));

const aliases = z.array(termText).max(dictionaryLimits.aliasesPerTerm);

export const dictionaryTermInputSchema = z.object({
  term: termText,
  aliases: aliases.default([]),
});
export type DictionaryTermInput = z.infer<typeof dictionaryTermInputSchema>;

export const dictionaryTermUpdateSchema = z.object({ aliases });
export type DictionaryTermUpdate = z.infer<typeof dictionaryTermUpdateSchema>;

export const dictionaryTermSchema = z.object({
  id: z.string(),
  term: z.string(),
  aliases: z.array(z.string()),
  useCount: z.number().int().nonnegative(),
  lastUsedAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type DictionaryTerm = z.infer<typeof dictionaryTermSchema>;

export const dictionaryListSchema = z.object({ terms: z.array(dictionaryTermSchema) });
export type DictionaryList = z.infer<typeof dictionaryListSchema>;

export const dictionaryHalfLifeDays = 30;

export interface RankableTerm {
  term: string;
  useCount: number;
  lastUsedAt: string;
}

const dayMs = 86_400_000;

export function decayedScore(
  term: RankableTerm,
  now: Date,
  halfLifeDays: number = dictionaryHalfLifeDays,
): number {
  const days = Math.max(0, (now.getTime() - Date.parse(term.lastUsedAt)) / dayMs);
  const score = term.useCount * 0.5 ** (days / halfLifeDays);
  return Number.isFinite(score) ? score : 0;
}

export function rankTerms<T extends RankableTerm>(
  terms: readonly T[],
  now: Date,
  halfLifeDays: number = dictionaryHalfLifeDays,
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
