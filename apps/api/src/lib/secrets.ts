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

export function cachedSecretJson<T>(
  client: SecretsManagerClient,
  secretId: string,
  schema: z.ZodType<T>,
  missing: () => Error,
): () => Promise<T> {
  let cached: Promise<T> | undefined;
  const load = async () => {
    const { SecretString } = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
    let json: unknown;
    try {
      json = JSON.parse(SecretString ?? "");
    } catch {
      throw missing();
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw missing();
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

export function cachedProviderKeys(
  client: SecretsManagerClient,
  secretId: string,
): () => Promise<ProviderKeys> {
  return cachedSecretJson(
    client,
    secretId,
    providerKeysSchema,
    () => new MissingProviderKeysError(),
  );
}
