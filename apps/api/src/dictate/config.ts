import { defaultRefiner, defaultTranscriber, dictionaryHalfLifeDays } from "@take-my-word/shared";
import { z } from "zod";
import { defaultSilenceLevels } from "../dictation/silence.ts";

export const defaultSttPromptTokenBudget = 224;

const configSchema = z
  .object({
    TABLE_NAME: z.string().min(1),
    PROVIDERS_SECRET_ID: z.string().min(1),
    DAILY_QUOTA_MINUTES: z.coerce.number().int().positive(),
    DEBUG_BUCKET: z.string().min(1).optional(),
    TRANSCRIBER: z.string().default(defaultTranscriber),
    REFINER: z.string().default(defaultRefiner),
    SILENCE_FLOOR_DBFS: z.coerce.number().max(0).default(defaultSilenceLevels.floorDbfs),
    SPEECH_LEVEL_DBFS: z.coerce.number().max(0).default(defaultSilenceLevels.speechLevelDbfs),
    DICTIONARY_HALF_LIFE_DAYS: z.coerce.number().positive().default(dictionaryHalfLifeDays),
    STT_PROMPT_TOKEN_BUDGET: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(defaultSttPromptTokenBudget),
  })
  .refine((config) => config.SILENCE_FLOOR_DBFS < config.SPEECH_LEVEL_DBFS, {
    message: "SILENCE_FLOOR_DBFS must be below SPEECH_LEVEL_DBFS",
  });
export type DictateConfig = z.infer<typeof configSchema>;

export function readConfig(env: NodeJS.ProcessEnv): DictateConfig {
  return configSchema.parse(env);
}
