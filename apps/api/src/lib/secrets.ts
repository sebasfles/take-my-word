import { GetSecretValueCommand, type SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { z } from "zod";

const providerKeysSchema = z.object({
  GROQ_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
});
export type ProviderKeys = z.infer<typeof providerKeysSchema>;

export class MissingProviderKeysError extends Error {
  constructor() {
    super("The providers secret is missing GROQ_API_KEY or OPENAI_API_KEY.");
    this.name = "MissingProviderKeysError";
  }
}

export function cachedProviderKeys(
  client: SecretsManagerClient,
  secretId: string,
): () => Promise<ProviderKeys> {
  let cached: Promise<ProviderKeys> | undefined;
  const load = async () => {
    const { SecretString } = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
    let json: unknown;
    try {
      json = JSON.parse(SecretString ?? "");
    } catch {
      throw new MissingProviderKeysError();
    }
    const parsed = providerKeysSchema.safeParse(json);
    if (!parsed.success) throw new MissingProviderKeysError();
    return parsed.data;
  };
  return () => {
    cached ??= load().catch((error: unknown) => {
      cached = undefined;
      throw error;
    });
    return cached;
  };
}
