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

export const userContextPicks = [
  "software-development",
  "data-ai",
  "design",
  "product-management",
  "marketing",
  "sales",
  "customer-support",
  "writing-content",
  "research-academia",
  "biology-life-sciences",
  "medicine-health",
  "law",
  "finance-accounting",
  "education-teaching",
  "engineering",
  "student",
] as const;
export type UserContextPick = (typeof userContextPicks)[number];

export const userContextLimits = { maxPicks: 3, maxDetailLength: 200 } as const;

export const userContextPicksSchema = z
  .array(z.enum(userContextPicks))
  .max(userContextLimits.maxPicks)
  .refine((chosen) => new Set(chosen).size === chosen.length, "each pick at most once");

export const userContextDetailSchema = z.string().trim().max(userContextLimits.maxDetailLength);

export const userContextSchema = z.object({
  picks: userContextPicksSchema,
  detail: userContextDetailSchema,
});
export type UserContext = z.infer<typeof userContextSchema>;

export const emptyUserContext: UserContext = { picks: [], detail: "" };

export function isEmptyUserContext(context: UserContext): boolean {
  return context.picks.length === 0 && context.detail === "";
}

export const settingsSchema = z.object({
  defaultStyleId: styleIdSchema,
  locale: localeSchema,
  dictationLanguages: dictationLanguagesSchema,
  providers: z.object({
    transcriber: z.enum(transcriberIds),
    refiner: z.enum(refinerIds),
  }),
  context: userContextSchema,
});
export type Settings = z.infer<typeof settingsSchema>;

export const settingsUpdateSchema = settingsSchema.extend({
  locale: localeSchema.optional(),
  dictationLanguages: dictationLanguagesSchema.optional(),
  context: userContextSchema.optional(),
});
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

export function languageOfLocale(locale: string): Language {
  return locale.startsWith("en") ? "en" : "es";
}

export function localeFor(chosen: readonly Language[], stored?: string): string {
  const first = chosen[0] ?? "en";
  return stored !== undefined && languageOfLocale(stored) === first ? stored : first;
}
