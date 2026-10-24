import type { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { z } from "zod";
import { cachedSecretJson } from "../lib/secrets.ts";

const evalKeysSchema = z.object({
  GROQ_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  TOGETHER_API_KEY: z.string().min(1),
  CEREBRAS_API_KEY: z.string().min(1),
});
export type EvalKeys = z.infer<typeof evalKeysSchema>;

export class MissingEvalKeysError extends Error {
  constructor() {
    super(
      "The providers secret is missing one of GROQ_API_KEY, OPENAI_API_KEY, TOGETHER_API_KEY or CEREBRAS_API_KEY.",
    );
    this.name = "MissingEvalKeysError";
  }
}

export function cachedEvalKeys(
  client: SecretsManagerClient,
  secretId: string,
): () => Promise<EvalKeys> {
  return cachedSecretJson(client, secretId, evalKeysSchema, () => new MissingEvalKeysError());
}
