import { z } from "zod";
import { appIdSchema } from "./app-rules.ts";
import { styleIdSchema } from "./styles.ts";

export const dictationFields = {
  audio: "audio",
  meta: "meta",
  previous: "previous",
  segments: "segments",
} as const;

export const segmentsPath = "/dictations/segments";

export const maxAudioBytes = 4 * 1024 * 1024;
export const minAudioSeconds = 0.5;
export const maxTakeSeconds = 120;
export const maxSegmentTextBytes = 64 * 1024;
export const maxEarlierSegments = 24;

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
export const languageSchema = z.enum(languages);

export const localeSchema = z
  .string()
  .regex(/^(es|en)(-[A-Z]{2})?$/, "expected es or en, optionally with a region");

export const dictationMetaSchema = z.object({
  locale: localeSchema.optional(),
  styleId: styleIdSchema.optional(),
  appId: appIdSchema.optional(),
  language: languageSchema.optional(),
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

export const segmentMetaSchema = z.object({
  language: languageSchema.optional(),
});
export type SegmentMeta = z.infer<typeof segmentMetaSchema>;

export const segmentResponseSchema = z.object({
  raw: z.string(),
  skipped: z.literal("silence").optional(),
  language: languageSchema.optional(),
  receipt: z.string().optional(),
  providers: z.object({ transcriber: z.string().optional() }),
  latencyMs: z.object({
    quota: milliseconds.optional(),
    profile: milliseconds.optional(),
    transcribe: milliseconds.optional(),
    total: milliseconds,
  }),
});
export type SegmentResponse = z.infer<typeof segmentResponseSchema>;

export const earlierSegmentsSchema = z
  .array(z.object({ text: z.string(), receipt: z.string().min(1).max(512) }))
  .min(1)
  .max(maxEarlierSegments);
export type EarlierSegments = z.infer<typeof earlierSegmentsSchema>;
