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
