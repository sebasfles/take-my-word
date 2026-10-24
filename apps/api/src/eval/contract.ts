import { audioContainers, languages } from "@take-my-word/shared";
import { z } from "zod";

export const transcriberSpecSchema = z.object({
  provider: z.enum(["groq-whisper", "openai-transcribe"]),
  model: z.string().min(1),
  languageField: z.enum(["language", "languages[]"]).optional(),
});
export type TranscriberSpec = z.infer<typeof transcriberSpecSchema>;

export const refinerSpecSchema = z.object({
  provider: z.enum(["openai", "groq-chat"]),
  model: z.string().min(1),
  reasoningEffort: z.string().min(1).optional(),
  temperature: z.number().min(0).optional(),
});
export type RefinerSpec = z.infer<typeof refinerSpecSchema>;

export const connections = ["fresh", "reused"] as const;
export type Connection = (typeof connections)[number];

export const evalRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("warmup") }),
  z.object({
    kind: z.literal("transcribe"),
    connection: z.enum(connections),
    transcriber: transcriberSpecSchema,
    audioBase64: z.string().min(1),
    container: z.enum(audioContainers),
    languages: z.array(z.enum(languages)).min(1),
    prompt: z.string(),
  }),
  z.object({
    kind: z.literal("refine"),
    connection: z.enum(connections),
    refiner: refinerSpecSchema,
    raw: z.string(),
    language: z.enum(languages),
    instructions: z.string().min(1),
  }),
]);
export type EvalRequest = z.infer<typeof evalRequestSchema>;
export type ProviderRequest = Exclude<EvalRequest, { kind: "warmup" }>;

export const providerCallSchema = z.object({
  requested: z.enum(languages).optional(),
  usage: z
    .object({
      seconds: z.number().optional(),
      inputTokens: z.number().optional(),
      outputTokens: z.number().optional(),
    })
    .optional(),
  ms: z.number(),
  headersMs: z.number().optional(),
  status: z.number().optional(),
  newConnections: z.number(),
  headers: z.record(z.string(), z.string()),
  error: z.string().optional(),
});
export type ProviderCall = z.infer<typeof providerCallSchema>;

export const evalResponseSchema = z.object({
  ok: z.boolean(),
  label: z.string(),
  text: z.string().optional(),
  language: z.enum(languages).optional(),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }).optional(),
  error: z.object({ status: z.number().optional(), message: z.string() }).optional(),
  calls: z.array(providerCallSchema),
  coldStart: z.boolean(),
  region: z.string(),
  memoryMb: z.number(),
});
export type EvalResponse = z.infer<typeof evalResponseSchema>;
