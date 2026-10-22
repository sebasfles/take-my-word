import { z } from "zod";
import {
  type Language,
  languages,
  localeSchema,
  refinerIds,
  transcriberIds,
} from "./dictations.ts";
import { styleIdSchema } from "./styles.ts";

export const defaultDictationLanguages: readonly Language[] = ["en"];

export const dictationLanguagesSchema = z
  .array(z.enum(languages))
  .min(1)
  .refine((chosen) => new Set(chosen).size === chosen.length, "each language at most once");

export const settingsSchema = z.object({
  defaultStyleId: styleIdSchema,
  locale: localeSchema,
  dictationLanguages: dictationLanguagesSchema,
  providers: z.object({
    transcriber: z.enum(transcriberIds),
    refiner: z.enum(refinerIds),
  }),
});
export type Settings = z.infer<typeof settingsSchema>;

export const settingsUpdateSchema = settingsSchema.extend({
  locale: localeSchema.optional(),
  dictationLanguages: dictationLanguagesSchema.optional(),
});
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

export function languageOfLocale(locale: string): Language {
  return locale.startsWith("en") ? "en" : "es";
}

export function localeFor(chosen: readonly Language[], stored?: string): string {
  const first = chosen[0] ?? "en";
  return stored !== undefined && languageOfLocale(stored) === first ? stored : first;
}
