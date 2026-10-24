import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.ts";
import { backendConfig, rootProblem, terraformVariables } from "./terraform.ts";

const selfHosted = parseConfig({
  name: "tmw-mine",
  aws: { profile: "me", accountId: "123456789012", region: "eu-west-1" },
  domain: "dictation.example.com",
  hostedZone: "example.com",
  releases: "owner/take-my-word",
});

const withCi = parseConfig({
  aws: { profile: "me", accountId: "210987654321", region: "us-east-1" },
  domain: "words.example.org",
  stateBucket: "words-state",
  environments: ["dev", "prd"],
  releases: "someone/take-my-word",
  github: { owner: "someone", repository: "take-my-word", appId: "11", appInstallationId: "22" },
});

describe("terraform roots", () => {
  it("runs core only for a deployment with CI, and only the configured environments", () => {
    expect(rootProblem(selfHosted, "core")).toMatch(/github section/);
    expect(rootProblem(selfHosted, "dev")).toMatch(/not one of this deployment's environments/);
    expect(rootProblem(selfHosted, "prd")).toBeNull();
    expect(rootProblem(withCi, "core")).toBeNull();
    expect(rootProblem(withCi, "dev")).toBeNull();
  });

  it("keeps each root's state under its own key in the deployment's bucket and account", () => {
    expect(backendConfig(selfHosted, "prd")).toBe(
      [
        'bucket = "tmw-mine-terraform-state-123456789012"',
        'key = "prd/terraform.tfstate"',
        'region = "eu-west-1"',
        'allowed_account_ids = ["123456789012"]',
        "",
      ].join("\n"),
    );
    expect(backendConfig(withCi, "core")).toContain('key = "core/terraform.tfstate"');
    expect(backendConfig(withCi, "core")).toContain('bucket = "words-state"');
  });

  it("passes no github variable without CI, so the stack creates no deploy role", () => {
    expect(terraformVariables(selfHosted, "prd", "unused pem")).toEqual({
      TF_VAR_deployment: "tmw-mine",
      TF_VAR_aws_account_id: "123456789012",
      TF_VAR_aws_region: "eu-west-1",
      TF_VAR_domain: "dictation.example.com",
      TF_VAR_hosted_zone: "example.com",
    });
  });

  it("passes the github object and the App key with CI, and no site to core", () => {
    const core = terraformVariables(withCi, "core", "pem");
    expect(core).not.toHaveProperty("TF_VAR_domain");
    expect(JSON.parse(core.TF_VAR_github ?? "")).toEqual({
      owner: "someone",
      repository: "take-my-word",
      app_id: "11",
      app_installation_id: "22",
    });
    expect(core.TF_VAR_github_app_pem).toBe("pem");
    expect(terraformVariables(withCi, "dev", "pem").TF_VAR_hosted_zone).toBe("words.example.org");
  });

  it("gives the eval Lambda to dev only, and only when the config asks for it", () => {
    const withEval = parseConfig({
      ...{
        aws: { profile: "me", accountId: "210987654321", region: "us-east-1" },
        domain: "words.example.org",
        environments: ["dev", "prd"],
        releases: "someone/take-my-word",
      },
      evalFunction: true,
    });
    expect(terraformVariables(withEval, "dev", undefined).TF_VAR_eval_function).toBe("true");
    expect(terraformVariables(withEval, "prd", undefined)).not.toHaveProperty(
      "TF_VAR_eval_function",
    );
    expect(terraformVariables(withCi, "dev", "pem")).not.toHaveProperty("TF_VAR_eval_function");
    expect(() =>
      parseConfig({
        aws: { profile: "me", accountId: "210987654321", region: "us-east-1" },
        domain: "words.example.org",
        releases: "someone/take-my-word",
        evalFunction: true,
      }),
    ).toThrow(/evalFunction needs the dev environment/);
  });
});
