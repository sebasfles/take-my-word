import type { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { describe, expect, it } from "vitest";
import { cachedProviderKeys, MissingProviderKeysError } from "./secrets.ts";

function client(answers: (() => Promise<{ SecretString?: string }>)[]) {
  let calls = 0;
  const fake = {
    send: () => {
      const answer = answers[Math.min(calls, answers.length - 1)];
      calls += 1;
      return answer ? answer() : Promise.reject(new Error("no answer"));
    },
  };
  return { client: fake as unknown as SecretsManagerClient, calls: () => calls };
}

const keys = JSON.stringify({ GROQ_API_KEY: "g", OPENAI_API_KEY: "o" });

describe("cachedProviderKeys", () => {
  it("reads the secret once per execution environment", async () => {
    const fake = client([() => Promise.resolve({ SecretString: keys })]);
    const load = cachedProviderKeys(fake.client, "s");
    await load();
    expect(await load()).toEqual({ GROQ_API_KEY: "g", OPENAI_API_KEY: "o" });
    expect(fake.calls()).toBe(1);
  });

  it("rejects the empty placeholders", async () => {
    const placeholders = JSON.stringify({ GROQ_API_KEY: "", OPENAI_API_KEY: "" });
    const fake = client([() => Promise.resolve({ SecretString: placeholders })]);
    await expect(cachedProviderKeys(fake.client, "s")()).rejects.toThrow(MissingProviderKeysError);
  });

  it("retries after a failed read instead of caching the failure", async () => {
    const fake = client([
      () => Promise.reject(new Error("throttled")),
      () => Promise.resolve({ SecretString: keys }),
    ]);
    const load = cachedProviderKeys(fake.client, "s");
    await expect(load()).rejects.toThrow("throttled");
    expect((await load()).GROQ_API_KEY).toBe("g");
  });

  it("keeps only production's keys when the secret holds evaluation keys too", async () => {
    const all = JSON.stringify({
      GROQ_API_KEY: "g",
      OPENAI_API_KEY: "o",
      TOGETHER_API_KEY: "t",
      CEREBRAS_API_KEY: "c",
    });
    const fake = client([() => Promise.resolve({ SecretString: all })]);
    expect(await cachedProviderKeys(fake.client, "s")()).toEqual({
      GROQ_API_KEY: "g",
      OPENAI_API_KEY: "o",
    });
  });
});
