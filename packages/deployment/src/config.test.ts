import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ConfigError, hostedZone, parseConfig, stateBucket } from "./config.ts";
import { configJsonSchema, examplePath, schemaPath } from "./schema.ts";

const minimal = {
  aws: { profile: "me", accountId: "123456789012", region: "eu-west-1" },
  domain: "dictation.example.com",
  releases: "owner/take-my-word",
};

describe("deployment config", () => {
  it("the committed example is a valid config with every key", () => {
    const example: unknown = JSON.parse(readFileSync(examplePath, "utf8"));
    const config = parseConfig(example);
    expect(Object.keys(example as object).sort()).toEqual(
      Object.keys((configJsonSchema() as { properties: object }).properties).sort(),
    );
    expect(config.desktop?.servers.prd?.region).toBe("us-east-1");
  });

  it("the committed JSON schema matches the zod schema; run pnpm --filter @take-my-word/deployment schema after changing it", () => {
    expect(JSON.parse(readFileSync(schemaPath, "utf8"))).toEqual(configJsonSchema());
  });

  it("defaults a self-hosted deployment to prd only, no CI and no desktop builds", () => {
    const config = parseConfig(minimal);
    expect(config.name).toBe("take-my-word");
    expect(config.environments).toEqual(["prd"]);
    expect(config.github).toBeUndefined();
    expect(config.desktop).toBeUndefined();
    expect(hostedZone(config)).toBe("dictation.example.com");
    expect(stateBucket(config)).toBe("take-my-word-terraform-state-123456789012");
  });

  it("keeps an explicit zone and state bucket", () => {
    const config = parseConfig({
      ...minimal,
      hostedZone: "example.com",
      stateBucket: "my-state",
    });
    expect(hostedZone(config)).toBe("example.com");
    expect(stateBucket(config)).toBe("my-state");
  });

  it.each([
    { hostedZone: "other.com" },
    { hostedZone: "ample.com" },
    { domain: "https://dictation.example.com" },
    { aws: { ...minimal.aws, accountId: "1234" } },
    { aws: { ...minimal.aws, region: "eu-west-1.evil.example" } },
    { environments: [] },
    { environments: ["prd", "prd"] },
    { environments: ["staging"] },
    { name: "Take My Word" },
    { releases: "take-my-word" },
    { unknownKey: true },
    { providers: { prd: { transcriber: "groq-whisper" } } },
    { providers: { prd: { refiner: "openai" } } },
    { providers: { prd: { refiner: "gpt-5.4-nano", model: "gpt-6" } } },
    { providers: { staging: {} } },
    { providers: { dev: { transcriber: "gpt-transcribe" } } },
    { github: { owner: "o", repository: "r", appId: "x", appInstallationId: "1" } },
    {
      desktop: {
        updaterPublicKey: "k",
        servers: { prd: { version: 1, apiUrl: "http://insecure.example.com" } },
      },
    },
  ])("refuses %j with the config's name in the message", (change) => {
    expect(() => parseConfig({ ...minimal, ...change }, "deployment.json")).toThrow(ConfigError);
    expect(() => parseConfig({ ...minimal, ...change }, "deployment.json")).toThrow(
      /deployment\.json/,
    );
  });
});
