import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ConfigError, type DeploymentConfig, loadConfig } from "./config.ts";
import { backendConfig, rootProblem, terraformVariables, type Root } from "./terraform.ts";
import { readDotEnv, repositoryRoot } from "./workspace.ts";

const roots: readonly Root[] = ["core", "dev", "prd"];

function isRoot(value: string | undefined): value is Root {
  return roots.includes(value as Root);
}

export interface TerraformOptions {
  variables?: Record<string, string>;
  capture?: boolean;
}

export interface TerraformResult {
  status: number;
  stdout: string;
}

export function terraform(
  config: DeploymentConfig,
  root: Root,
  args: string[],
  options: TerraformOptions = {},
): TerraformResult {
  const problem = rootProblem(config, root);
  if (problem !== null) throw new ConfigError(problem);

  const dir = join(repositoryRoot, "infra", "environments", root);
  const backendFile = join(dir, ".terraform", "deployment.tfbackend");
  mkdirSync(join(dir, ".terraform"), { recursive: true });
  writeFileSync(backendFile, backendConfig(config, root));

  const pem = readDotEnv(repositoryRoot).GITHUB_APP_PEM?.replaceAll("\\n", "\n");
  if (config.github !== undefined && !pem) {
    throw new ConfigError("GITHUB_APP_PEM is missing from .env; the github section needs it");
  }

  const result = spawnSync("terraform", [`-chdir=${dir}`, ...args], {
    stdio: ["inherit", options.capture === true ? "pipe" : "inherit", "inherit"],
    encoding: "utf8",
    env: {
      ...process.env,
      AWS_PROFILE: config.aws.profile,
      TF_CLI_ARGS_init: `-backend-config=${backendFile}`,
      ...terraformVariables(config, root, pem),
      ...options.variables,
    },
  });
  if (result.error) throw result.error;
  return { status: result.status ?? 1, stdout: options.capture === true ? result.stdout : "" };
}

function main(args: string[]): number {
  const [root, ...terraformArgs] = args;
  if (!isRoot(root) || terraformArgs.length === 0) {
    console.error("usage: pnpm tf <core|dev|prd> <terraform args...>");
    return 2;
  }
  return terraform(loadConfig(repositoryRoot), root, terraformArgs).status;
}

if (import.meta.main) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(error.message);
    process.exitCode = 2;
  }
}
