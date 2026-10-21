import {
  defaultRefiner,
  defaultTranscriber,
  fallbackStyleId,
  localeSchema,
  refinerIds,
  styleIdSchema,
  transcriberIds,
  type Settings,
} from "@take-my-word/shared";
import { z } from "zod";

export const defaultSettings: Settings = {
  defaultStyleId: fallbackStyleId,
  locale: "es",
  providers: { transcriber: defaultTranscriber, refiner: defaultRefiner },
};

const storedSettingsSchema = z.object({
  defaultStyleId: styleIdSchema.catch(defaultSettings.defaultStyleId),
  locale: localeSchema.catch(defaultSettings.locale),
  providers: z
    .object({
      transcriber: z.enum(transcriberIds).catch(defaultSettings.providers.transcriber),
      refiner: z.enum(refinerIds).catch(defaultSettings.providers.refiner),
    })
    .catch(defaultSettings.providers),
});

export function settingsFrom(item: Record<string, unknown>): Settings {
  return storedSettingsSchema.parse(item);
}
