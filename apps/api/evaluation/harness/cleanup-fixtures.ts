import { readFileSync } from "node:fs";
import { join } from "node:path";
import { builtinStyleIds, languages } from "@take-my-word/shared";
import { z } from "zod";
import { refinerInstructions } from "../../src/dictation/instructions.ts";
import { builtinStyles } from "../../src/styles/builtin/index.ts";
import { projectedTerms, type TranscriptionFixtures } from "./fixtures.ts";

export const cleanupFixturesPath = join(import.meta.dirname, "..", "cleanup.fixtures.json");

const caseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  language: z.enum(languages),
  style: z.enum(builtinStyleIds),
  dictionary: z.string(),
  source: z.string().min(1),
  raw: z.string().min(1),
  expected: z.array(z.string().min(1)).min(1),
  required: z.array(z.string()).default([]),
  forbidden: z.array(z.string()).default([]),
  terms: z.array(z.string()).default([]),
  fillers: z.array(z.string()).default([]),
  styleRequired: z.array(z.string()).default([]),
  styleForbidden: z.array(z.string()).default([]),
  allowed: z.array(z.string()).default([]),
});
export type CleanupCase = z.infer<typeof caseSchema>;

export const cleanupFixturesSchema = z
  .object({ cases: z.array(caseSchema).min(1) })
  .superRefine((fixtures, context) => {
    const ids = new Set<string>();
    for (const item of fixtures.cases) {
      if (ids.has(item.id))
        context.addIssue({ code: "custom", message: `duplicate id ${item.id}` });
      ids.add(item.id);
    }
  });
export type CleanupFixtures = z.infer<typeof cleanupFixturesSchema>;

export function loadCleanupFixtures(
  transcription: TranscriptionFixtures,
  path = cleanupFixturesPath,
): CleanupFixtures {
  const fixtures = cleanupFixturesSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  for (const item of fixtures.cases) {
    if (!(item.dictionary in transcription.dictionaries)) {
      throw new Error(`${item.id}: no dictionary ${item.dictionary} in the transcription fixtures`);
    }
  }
  return fixtures;
}

export function instructionsFor(transcription: TranscriptionFixtures, item: CleanupCase): string {
  return refinerInstructions(
    item.language,
    builtinStyles[item.style].prompt,
    projectedTerms(transcription, item.dictionary),
  );
}
