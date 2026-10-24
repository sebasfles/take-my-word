import type { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { describe, expect, it } from "vitest";
import { cachedEvalKeys, MissingEvalKeysError } from "./keys.ts";

const secret = (keys: Record<string, string>) =>
  ({
    send: () => Promise.resolve({ SecretString: JSON.stringify(keys) }),
  }) as unknown as SecretsManagerClient;

const production = { GROQ_API_KEY: "g", OPENAI_API_KEY: "o" };

describe("cachedEvalKeys", () => {
  it("reads the Together and Cerebras keys from the providers secret", async () => {
    const keys = { ...production, TOGETHER_API_KEY: "t", CEREBRAS_API_KEY: "c" };
    expect(await cachedEvalKeys(secret(keys), "s")()).toEqual(keys);
  });

  it("refuses a secret that still holds only production's keys or an empty placeholder", async () => {
    await expect(cachedEvalKeys(secret(production), "s")()).rejects.toThrow(MissingEvalKeysError);
    await expect(
      cachedEvalKeys(secret({ ...production, TOGETHER_API_KEY: "t", CEREBRAS_API_KEY: "" }), "s")(),
    ).rejects.toThrow(MissingEvalKeysError);
  });
});
