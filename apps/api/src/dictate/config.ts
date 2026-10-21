import { z } from "zod";
import { defaultGroqWhisperModel } from "../dictation/providers/groq-whisper.ts";
import { defaultOpenaiModel } from "../dictation/providers/openai.ts";
import { defaultNoSpeechThreshold } from "../dictation/silence.ts";

const configSchema = z.object({
  TABLE_NAME: z.string().min(1),
  PROVIDERS_SECRET_ID: z.string().min(1),
  DAILY_QUOTA_MINUTES: z.coerce.number().int().positive(),
  DEBUG_BUCKET: z.string().min(1).optional(),
  GROQ_WHISPER_MODEL: z.string().min(1).default(defaultGroqWhisperModel),
  OPENAI_MODEL: z.string().min(1).default(defaultOpenaiModel),
  SILENCE_NO_SPEECH_THRESHOLD: z.coerce.number().min(0).max(1).default(defaultNoSpeechThreshold),
});
export type DictateConfig = z.infer<typeof configSchema>;

export function readConfig(env: NodeJS.ProcessEnv): DictateConfig {
  return configSchema.parse(env);
}
