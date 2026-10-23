import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { PollyClient } from "@aws-sdk/client-polly";
import { loadConfig, repositoryRoot, type DeploymentConfig } from "@take-my-word/deployment";

export const measuredRegion = "us-east-1";

export interface Workspace {
  config: DeploymentConfig;
  evalFunctionName: string;
  lambda: LambdaClient;
  polly: PollyClient;
}

export function openWorkspace(): Workspace {
  const config = loadConfig(repositoryRoot);
  if (config.aws.region !== measuredRegion) {
    throw new Error(
      `the evaluation measures in ${measuredRegion}; the deployment is in ${config.aws.region}`,
    );
  }
  if (!config.environments.includes("dev"))
    throw new Error("the deployment has no dev environment");
  process.env.AWS_PROFILE = config.aws.profile;
  return {
    config,
    evalFunctionName: `${config.name}-dev-eval`,
    lambda: new LambdaClient({ region: measuredRegion, maxAttempts: 3 }),
    polly: new PollyClient({ region: measuredRegion }),
  };
}

const git = (...args: string[]) =>
  execFileSync("git", ["-C", repositoryRoot, ...args], { encoding: "utf8" }).trim();

export interface CodeState {
  commit: string;
  clean: boolean;
}

export function codeState(paths: readonly string[]): CodeState {
  const relativePaths = paths.map((path) => relative(repositoryRoot, path));
  return {
    commit: git("rev-parse", "HEAD"),
    clean: git("status", "--porcelain", "--", ...relativePaths) === "",
  };
}

export function isTracked(path: string): boolean {
  try {
    git("ls-files", "--error-unmatch", relative(repositoryRoot, path));
    return true;
  } catch {
    return false;
  }
}

export function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function requireCommittedFixtures(fixtures: string, code: readonly string[]): CodeState {
  if (!isTracked(fixtures))
    throw new Error(`${fixtures} is not committed; commit the fixtures first`);
  const state = codeState([fixtures, ...code]);
  if (!state.clean) {
    throw new Error(
      "the fixtures or the evaluation code have uncommitted changes; commit them first",
    );
  }
  return state;
}

export function lastCommitTouching(paths: readonly string[]): string {
  return git(
    "log",
    "-1",
    "--format=%H",
    "--",
    ...paths.map((path) => relative(repositoryRoot, path)),
  );
}

export const apiRoot = join(import.meta.dirname, "..", "..");
export const evaluationCodePaths = [
  join(apiRoot, "src"),
  join(apiRoot, "evaluation"),
  join(apiRoot, "package.json"),
];
