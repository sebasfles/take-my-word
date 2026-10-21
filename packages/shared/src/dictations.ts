import { z } from "zod";
import { appIdSchema } from "./app-rules.ts";
import { styleIdSchema } from "./styles.ts";

export const transcriberIds = ["groq-whisper"] as const;
export const refinerIds = ["openai"] as const;
export type TranscriberId = (typeof transcriberIds)[number];
export type RefinerId = (typeof refinerIds)[number];

export const defaultTranscriber: TranscriberId = "groq-whisper";
export const defaultRefiner: RefinerId = "openai";

export const dictationFields = { audio: "audio", meta: "meta" } as const;

export const maxAudioBytes = 4 * 1024 * 1024;
export const minAudioSeconds = 0.5;

export const audioContainers = ["wav", "m4a"] as const;
export type AudioContainer = (typeof audioContainers)[number];

export const audioContentTypes: Readonly<Record<string, AudioContainer>> = {
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav",
  "audio/vnd.wave": "wav",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
};

export const languages = ["es", "en"] as const;
export type Language = (typeof languages)[number];

export const localeSchema = z
  .string()
  .regex(/^(es|en)(-[A-Z]{2})?$/, "expected es or en, optionally with a region");

export const dictationMetaSchema = z.object({
  locale: localeSchema,
  sttProvider: z.enum(transcriberIds).optional(),
  refineProvider: z.enum(refinerIds).optional(),
  styleId: styleIdSchema.optional(),
  appId: appIdSchema.optional(),
});
export type DictationMeta = z.infer<typeof dictationMetaSchema>;

const milliseconds = z.number().int().nonnegative();

export const dictationResponseSchema = z.object({
  raw: z.string(),
  text: z.string(),
  skipped: z.literal("silence").optional(),
  styleId: styleIdSchema.optional(),
  providers: z.object({
    transcriber: z.string().optional(),
    refiner: z.string().optional(),
  }),
  latencyMs: z.object({
    quota: milliseconds.optional(),
    profile: milliseconds.optional(),
    transcribe: milliseconds.optional(),
    refine: milliseconds.optional(),
    save: milliseconds.optional(),
    total: milliseconds,
  }),
});
export type DictationResponse = z.infer<typeof dictationResponseSchema>;
