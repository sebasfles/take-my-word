import { z } from "zod";
import { defaultGroqWhisperModel } from "../dictation/providers/groq-whisper.ts";
import { defaultOpenaiModel } from "../dictation/providers/openai.ts";
import { defaultSilenceLevels } from "../dictation/silence.ts";

const configSchema = z
  .object({
    TABLE_NAME: z.string().min(1),
    PROVIDERS_SECRET_ID: z.string().min(1),
    DAILY_QUOTA_MINUTES: z.coerce.number().int().positive(),
    DEBUG_BUCKET: z.string().min(1).optional(),
    GROQ_WHISPER_MODEL: z.string().min(1).default(defaultGroqWhisperModel),
    OPENAI_MODEL: z.string().min(1).default(defaultOpenaiModel),
    SILENCE_FLOOR_DBFS: z.coerce.number().max(0).default(defaultSilenceLevels.floorDbfs),
    SPEECH_LEVEL_DBFS: z.coerce.number().max(0).default(defaultSilenceLevels.speechLevelDbfs),
    DICTIONARY_HALF_LIFE_DAYS: z.coerce.number().positive().default(30),
    STT_PROMPT_TOKEN_BUDGET: z.coerce.number().int().nonnegative().default(224),
  })
  .refine((config) => config.SILENCE_FLOOR_DBFS < config.SPEECH_LEVEL_DBFS, {
    message: "SILENCE_FLOOR_DBFS must be below SPEECH_LEVEL_DBFS",
  });
export type DictateConfig = z.infer<typeof configSchema>;

export function readConfig(env: NodeJS.ProcessEnv): DictateConfig {
  return configSchema.parse(env);
}
