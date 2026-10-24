import { GetSecretValueCommand, type SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { providerKeyNames, type ProviderKeyName } from "@take-my-word/shared";
import { z } from "zod";

const providerKeysSchema = z.object(
  Object.fromEntries(providerKeyNames.map((name) => [name, z.string().optional()])) as Record<
    ProviderKeyName,
    z.ZodOptional<z.ZodString>
  >,
);
export type ProviderKeys = Partial<Record<ProviderKeyName, string | undefined>>;

export class InvalidProvidersSecretError extends Error {
  constructor() {
    super("The providers secret is not a JSON object of string keys.");
    this.name = "InvalidProvidersSecretError";
  }
}

export class MissingProviderKeysError extends Error {
  readonly keys: readonly ProviderKeyName[];

  constructor(keys: readonly ProviderKeyName[]) {
    super(`The providers secret has no value for ${keys.join(" and ")}.`);
    this.name = "MissingProviderKeysError";
    this.keys = keys;
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
      throw new InvalidProvidersSecretError();
    }
    const parsed = providerKeysSchema.safeParse(json);
    if (!parsed.success) throw new InvalidProvidersSecretError();
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

export function requiredKeys(
  keys: ProviderKeys,
  names: readonly ProviderKeyName[],
): Record<ProviderKeyName, string> {
  const missing = names.filter((name) => !keys[name]);
  if (missing.length > 0) throw new MissingProviderKeysError(missing);
  return keys as Record<ProviderKeyName, string>;
}
