import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repositoryRoot, requiredEnv } from "./workspace.ts";

export interface Step {
  name: string;
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export const apiFunctions = [
  ["AUTHORIZER_FUNCTION_NAME", "authorizer"],
  ["DICTATE_FUNCTION_NAME", "dictate"],
  ["API_FUNCTION_NAME", "api"],
  ["DICTIONARY_USAGE_FUNCTION_NAME", "dictionary-usage"],
] as const;

export const webTargets = [
  "WEB_FUNCTION_NAME",
  "WEB_ASSETS_BUCKET",
  "WEB_DISTRIBUTION_ID",
  "RELEASES_REPOSITORY",
] as const;

type ApiTargets = Record<(typeof apiFunctions)[number][0], string>;
type WebTargets = Record<(typeof webTargets)[number], string>;

function swapCode(functionName: string, zip: string): Step[] {
  return [
    {
      name: `update ${functionName}`,
      command: "aws",
      args: [
        "lambda",
        "update-function-code",
        "--function-name",
        functionName,
        "--zip-file",
        `fileb://${zip}`,
        "--query",
        "[FunctionName,CodeSha256]",
        "--output",
        "text",
        "--no-cli-pager",
      ],
    },
    {
      name: `wait for ${functionName}`,
      command: "aws",
      args: ["lambda", "wait", "function-updated-v2", "--function-name", functionName],
    },
  ];
}

export function apiDeploySteps(root: string, targets: ApiTargets): Step[] {
  return [
    {
      name: "build the Lambda bundles",
      command: "pnpm",
      args: ["--filter", "@take-my-word/api", "build"],
      cwd: root,
    },
    ...apiFunctions.flatMap(([variable, bundle]) =>
      swapCode(targets[variable], join(root, "apps", "api", "dist", `${bundle}.zip`)),
    ),
  ];
}

export function webDeploySteps(root: string, targets: WebTargets, scratch: string): Step[] {
  const openNext = join(root, "apps", "web", ".open-next");
  const assets = join(openNext, "assets");
  const zip = join(scratch, "web.zip");
  const bucket = `s3://${targets.WEB_ASSETS_BUCKET}`;
  return [
    {
      name: "build the web with OpenNext",
      command: "pnpm",
      args: ["--filter", "@take-my-word/web", "bundle"],
      cwd: root,
      env: { RELEASES_REPOSITORY: targets.RELEASES_REPOSITORY },
    },
    {
      name: "package the server function",
      command: "zip",
      args: ["-qry", zip, "."],
      cwd: join(openNext, "server-functions", "default"),
    },
    {
      name: "upload the immutable assets",
      command: "aws",
      args: [
        "s3",
        "sync",
        ".",
        bucket,
        "--exclude",
        "*",
        "--include",
        "_next/static/*",
        "--cache-control",
        "public,max-age=31536000,immutable",
        "--no-progress",
      ],
      cwd: assets,
    },
    ...swapCode(targets.WEB_FUNCTION_NAME, zip),
    {
      name: "upload the remaining assets",
      command: "aws",
      args: [
        "s3",
        "sync",
        ".",
        bucket,
        "--exclude",
        "_next/static/*",
        "--cache-control",
        "public,max-age=300,must-revalidate",
        "--no-progress",
      ],
      cwd: assets,
    },
    {
      name: "invalidate the distribution",
      command: "aws",
      args: [
        "cloudfront",
        "create-invalidation",
        "--distribution-id",
        targets.WEB_DISTRIBUTION_ID,
        "--paths",
        "/*",
        "--query",
        "Invalidation.Id",
        "--output",
        "text",
        "--no-cli-pager",
      ],
    },
  ];
}

export function run(steps: Step[]): void {
  for (const step of steps) {
    console.log(`\n> ${step.name}`);
    execFileSync(step.command, step.args, {
      stdio: "inherit",
      cwd: step.cwd ?? repositoryRoot,
      env: { ...process.env, ...step.env },
    });
  }
}

function main(side: string | undefined): number {
  if (side === "api") {
    run(apiDeploySteps(repositoryRoot, requiredEnv(apiFunctions.map(([name]) => name))));
    return 0;
  }
  if (side === "web") {
    const scratch = mkdtempSync(join(tmpdir(), "take-my-word-web-"));
    try {
      run(webDeploySteps(repositoryRoot, requiredEnv(webTargets), scratch));
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
    return 0;
  }
  console.error("usage: node packages/deployment/src/deploy.ts <api|web>");
  return 2;
}

if (import.meta.main) {
  process.exitCode = main(process.argv[2]);
}
