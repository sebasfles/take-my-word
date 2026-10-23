import { describe, expect, it } from "vitest";
import { isDeploymentRecord, stateBucketUse, temporaryPassword, zoneFor } from "./aws.ts";
import { ConfigError, parseConfig } from "./config.ts";
import {
  accountToUse,
  needsDeploy,
  nextProviderKeys,
  planOutcome,
  readOutputs,
  repositoryOf,
  SelfHostError,
  selfHostProblem,
} from "./selfhost.ts";
import { siteHosts } from "./terraform.ts";

const base = {
  aws: { profile: "me", accountId: "123456789012", region: "us-east-2" },
  domain: "dictation.example.com",
  releases: "owner/take-my-word",
};

describe("pnpm selfhost", () => {
  it("refuses a deployment that ships through CI", () => {
    expect(selfHostProblem(parseConfig(base))).toBeNull();
    const withCi = parseConfig({
      ...base,
      github: { owner: "o", repository: "r", appId: "1", appInstallationId: "2" },
    });
    expect(selfHostProblem(withCi)).toMatch(/github section/);
  });

  it("takes the account from the profile on a first run and refuses another one afterwards", () => {
    expect(accountToUse(null, "111111111111", "me")).toBe("111111111111");
    expect(accountToUse("111111111111", "111111111111", "me")).toBe("111111111111");
    expect(() => accountToUse("111111111111", "222222222222", "me")).toThrow(
      /me is account 222222222222, not 111111111111/,
    );
  });

  it("reads the releases repository from every form of origin URL", () => {
    for (const url of [
      "git@github.com:someone/take-my-word.git",
      "https://github.com/someone/take-my-word",
      "https://github.com/someone/take-my-word.git",
      "https://github.com/someone/take-my-word/",
      "personal-github:someone/take-my-word.git",
    ]) {
      expect(repositoryOf(url), url).toBe("someone/take-my-word");
    }
    expect(repositoryOf("not a url")).toBeNull();
  });

  it("keeps stored provider keys unless new ones are given, and names the missing ones", () => {
    const stored = { GROQ_API_KEY: "gsk_old", OPENAI_API_KEY: "sk-old" };
    expect(nextProviderKeys(stored, { GROQ_API_KEY: "", OPENAI_API_KEY: "  " })).toEqual({
      values: stored,
      changed: false,
      missing: [],
    });
    expect(nextProviderKeys(stored, { GROQ_API_KEY: " gsk_new " })).toEqual({
      values: { GROQ_API_KEY: "gsk_new", OPENAI_API_KEY: "sk-old" },
      changed: true,
      missing: [],
    });
    expect(nextProviderKeys(stored, stored).changed).toBe(false);
    const placeholder = { GROQ_API_KEY: "", OPENAI_API_KEY: "" };
    expect(nextProviderKeys(placeholder, { OPENAI_API_KEY: "sk-new" }).missing).toEqual([
      "GROQ_API_KEY",
    ]);
  });

  it("deploys code only when it changed, the tree is dirty or the infrastructure moved", () => {
    const clean = { deployed: "abc", head: "abc", dirty: false, infraChanged: false };
    expect(needsDeploy(clean)).toBe(false);
    expect(needsDeploy({ ...clean, deployed: null })).toBe(true);
    expect(needsDeploy({ ...clean, head: "def" })).toBe(true);
    expect(needsDeploy({ ...clean, dirty: true })).toBe(true);
    expect(needsDeploy({ ...clean, infraChanged: true })).toBe(true);
  });

  it("reads terraform plan's detailed exit code and stops on a failed plan", () => {
    expect(planOutcome(0)).toBe("unchanged");
    expect(planOutcome(2)).toBe("changes");
    expect(() => planOutcome(1)).toThrow(SelfHostError);
  });

  it("reads every output the setup needs and refuses a partial apply", () => {
    const names = [
      "api_url",
      "web_url",
      "user_pool_id",
      "native_client_id",
      "providers_secret_id",
      "web_secret_id",
      "authorizer_function_name",
      "dictate_function_name",
      "api_function_name",
      "dictionary_usage_function_name",
      "web_function_name",
      "web_assets_bucket",
      "web_distribution_id",
    ];
    const outputs = Object.fromEntries(names.map((name) => [name, { value: `v-${name}` }]));
    const read = readOutputs(JSON.stringify({ ...outputs, deploy_role_arn: { value: null } }));
    expect(read.web.WEB_ASSETS_BUCKET).toBe("v-web_assets_bucket");
    expect(read.functions.DICTATE_FUNCTION_NAME).toBe("v-dictate_function_name");
    expect(() => readOutputs(JSON.stringify({ ...outputs, web_url: { value: "" } }))).toThrow(
      /web_url/,
    );
  });
});

describe("AWS rules of the setup and the removal", () => {
  it("picks the most specific public zone that holds the domain", () => {
    const zones = [
      { id: "Z1", name: "example.com", private: false },
      { id: "Z2", name: "dictation.example.com", private: true },
      { id: "Z3", name: "ample.com", private: false },
    ];
    expect(zoneFor("dictation.example.com", zones)?.id).toBe("Z1");
    expect(zoneFor("example.com", zones)?.id).toBe("Z1");
    expect(
      zoneFor("dictation.example.com", [
        ...zones,
        { id: "Z4", name: "dictation.example.com", private: false },
      ])?.id,
    ).toBe("Z4");
    expect(zoneFor("dictation.example.org", zones)).toBeNull();
  });

  it("counts as leftovers only the records the deployment creates, never the zone's own", () => {
    const hosts = [...Object.values(siteHosts("example.com", "prd"))];
    const leftover = (name: string, type: string) => isDeploymentRecord({ name, type }, hosts);
    expect(leftover("example.com.", "A")).toBe(true);
    expect(leftover("api.example.com.", "AAAA")).toBe(true);
    expect(leftover("_3f1c2a9b8e7d6c5b4a39281706f5e4d3.api.example.com.", "CNAME")).toBe(true);
    expect(leftover("example.com.", "MX")).toBe(false);
    expect(leftover("example.com.", "TXT")).toBe(false);
    expect(leftover("_dmarc.example.com.", "CNAME")).toBe(false);
    expect(leftover("www.example.com.", "A")).toBe(false);
    expect(leftover("dev.example.com.", "A")).toBe(false);
  });

  it("uses a state bucket only when it is missing or pnpm selfhost created it for this deployment", () => {
    const own = [
      { Key: "Project", Value: "tmw-mine" },
      { Key: "ManagedBy", Value: "pnpm selfhost" },
    ];
    expect(stateBucketUse(null, "tmw-mine", "b")).toBe("create");
    expect(stateBucketUse(own, "tmw-mine", "b")).toBe("own");
    for (const foreign of [own, [], [{ Key: "Project", Value: "tmw-mine" }]]) {
      expect(() => stateBucketUse(foreign, "tmw-other", "b")).toThrow(ConfigError);
    }
    expect(() => stateBucketUse([], "tmw-mine", "b")).toThrow(/another deployment's state/);
  });

  it("generates temporary passwords Cognito's policy accepts", () => {
    const passwords = Array.from({ length: 200 }, () => temporaryPassword());
    for (const password of passwords) {
      expect(password).toHaveLength(20);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
    }
    expect(new Set(passwords).size).toBe(passwords.length);
  });
});
