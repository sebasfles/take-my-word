import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PollyClient } from "@aws-sdk/client-polly";
import { dictionaryHalfLifeDays, languages, type Language } from "@take-my-word/shared";
import { z } from "zod";
import {
  transcriberPrompt,
  type ProjectedTerm,
} from "../../src/dictation/dictionary-projection.ts";
import { defaultSttPromptTokenBudget } from "../../src/dictate/config.ts";
import { noise, seconds, speak, sustainedLevel, voices, withLevel, type Voice } from "./audio.ts";

export const transcriptionFixturesPath = join(
  import.meta.dirname,
  "..",
  "transcription.fixtures.json",
);

const voiceSchema = z.enum(Object.keys(voices) as [Voice, ...Voice[]]);
const termSchema = z.object({ term: z.string().min(1), aliases: z.array(z.string()) });

const common = {
  id: z.string().regex(/^[a-z0-9-]+$/),
  language: z.enum(languages),
  dictionary: z.string(),
};

const caseSchema = z.discriminatedUnion("kind", [
  z.object({
    ...common,
    kind: z.literal("speech"),
    text: z.string().min(1),
    variants: z.array(z.string()).default([]),
    terms: z.array(z.string()),
    mixed: z.boolean().default(false),
    levelDbfs: z.number().max(0).optional(),
    endToEnd: z.boolean().default(false),
  }),
  z.object({
    ...common,
    kind: z.literal("noise"),
    color: z.enum(["white", "brown"]),
    levelDbfs: z.number().max(0),
    seconds: z.number().positive(),
    seed: z.number().int(),
  }),
]);
export type TranscriptionCase = z.infer<typeof caseSchema>;
export type SpeechCase = Extract<TranscriptionCase, { kind: "speech" }>;

export const transcriptionFixturesSchema = z
  .object({
    voices: z.object({
      es: z.array(voiceSchema).min(2),
      en: z.array(voiceSchema).min(2),
      mixed: z.array(voiceSchema).min(2),
    }),
    dictionaryUsedAt: z.iso.datetime(),
    dictionaries: z.record(z.string(), z.array(termSchema)),
    cases: z.array(caseSchema).min(1),
  })
  .superRefine((fixtures, context) => {
    const ids = new Set<string>();
    for (const item of fixtures.cases) {
      if (ids.has(item.id))
        context.addIssue({ code: "custom", message: `duplicate id ${item.id}` });
      ids.add(item.id);
      if (!(item.dictionary in fixtures.dictionaries)) {
        context.addIssue({
          code: "custom",
          message: `${item.id}: no dictionary ${item.dictionary}`,
        });
      }
    }
  });
export type TranscriptionFixtures = z.infer<typeof transcriptionFixturesSchema>;

export function loadTranscriptionFixtures(path = transcriptionFixturesPath): TranscriptionFixtures {
  return transcriptionFixturesSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function projectedTerms(fixtures: TranscriptionFixtures, name: string): ProjectedTerm[] {
  return (fixtures.dictionaries[name] ?? []).map(({ term, aliases }) => ({
    term,
    aliases,
    useCount: 1,
    lastUsedAt: fixtures.dictionaryUsedAt,
  }));
}

export function promptFor(fixtures: TranscriptionFixtures, name: string): string {
  return transcriberPrompt(projectedTerms(fixtures, name), {
    now: new Date(fixtures.dictionaryUsedAt),
    halfLifeDays: dictionaryHalfLifeDays,
    tokenBudget: defaultSttPromptTokenBudget,
  }).prompt;
}

export function voicesFor(
  fixtures: TranscriptionFixtures,
  item: TranscriptionCase,
): (Voice | "none")[] {
  if (item.kind === "noise") return ["none"];
  return item.mixed ? fixtures.voices.mixed : fixtures.voices[item.language];
}

export interface Clip {
  id: string;
  item: TranscriptionCase;
  voice: Voice | "none";
  audio: Buffer;
  seconds: number;
  levelDbfs: number;
  sha256: string;
}

export async function buildClip(
  polly: PollyClient,
  item: TranscriptionCase,
  voice: Voice | "none",
): Promise<Clip> {
  let audio: Buffer;
  if (item.kind === "noise") {
    audio = noise(item);
  } else {
    if (voice === "none") throw new Error(`${item.id} needs a voice`);
    const spoken = await speak(polly, item.text, voice);
    audio = item.levelDbfs === undefined ? spoken : withLevel(spoken, item.levelDbfs);
  }
  return {
    id: `${item.id}/${voice}`,
    item,
    voice,
    audio,
    seconds: seconds(audio),
    levelDbfs: sustainedLevel(audio),
    sha256: createHash("sha256").update(audio).digest("hex"),
  };
}

export const languageModes = ["one", "both"] as const;
export type LanguageMode = (typeof languageModes)[number];

export const bothLanguages: readonly Language[] = ["es", "en"];

export function languagesFor(item: TranscriptionCase, mode: LanguageMode): Language[] {
  return mode === "one" ? [item.language] : [...bothLanguages];
}
