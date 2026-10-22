import {
  defaultDictationLanguages,
  defaultRefiner,
  defaultTranscriber,
  dictationLanguagesSchema,
  fallbackStyleId,
  languageOfLocale,
  localeFor,
  localeSchema,
  refinerIds,
  styleIdSchema,
  transcriberIds,
  type Settings,
} from "@take-my-word/shared";
import { z } from "zod";

export const defaultSettings: Settings = {
  defaultStyleId: fallbackStyleId,
  locale: localeFor(defaultDictationLanguages),
  dictationLanguages: [...defaultDictationLanguages],
  providers: { transcriber: defaultTranscriber, refiner: defaultRefiner },
};

const storedSettingsSchema = z.object({
  defaultStyleId: styleIdSchema.catch(defaultSettings.defaultStyleId),
  locale: localeSchema.optional().catch(undefined),
  dictationLanguages: dictationLanguagesSchema.optional().catch(undefined),
  providers: z
    .object({
      transcriber: z.enum(transcriberIds).catch(defaultSettings.providers.transcriber),
      refiner: z.enum(refinerIds).catch(defaultSettings.providers.refiner),
    })
    .catch(defaultSettings.providers),
});

export function settingsFrom(item: Record<string, unknown>): Settings {
  const stored = storedSettingsSchema.parse(item);
  const dictationLanguages =
    stored.dictationLanguages ??
    (stored.locale === undefined
      ? [...defaultDictationLanguages]
      : [languageOfLocale(stored.locale)]);
  return {
    defaultStyleId: stored.defaultStyleId,
    locale: localeFor(dictationLanguages, stored.locale),
    dictationLanguages,
    providers: stored.providers,
  };
}
