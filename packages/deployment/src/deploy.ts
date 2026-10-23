import { execFileSync } from "node:child_process";
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
] as const;

type ApiTargets = Record<(typeof apiFunctions)[number][0], string>;
type WebTargets = Record<(typeof webTargets)[number], string>;

function openNext(root: string): string {
  return join(root, "apps", "web", ".open-next");
}

function serverZip(root: string): string {
  return join(openNext(root), "server-function.zip");
}

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

export function apiBuildSteps(root: string): Step[] {
  return [
    {
      name: "build the Lambda bundles",
      command: "pnpm",
      args: ["--filter", "@take-my-word/api", "build"],
      cwd: root,
    },
  ];
}

export function apiSwapSteps(root: string, targets: ApiTargets): Step[] {
  return apiFunctions.flatMap(([variable, bundle]) =>
    swapCode(targets[variable], join(root, "apps", "api", "dist", `${bundle}.zip`)),
  );
}

export interface WebBuild {
  releasesRepository: string;
  indexedOrigin?: string | undefined;
}

export function webBuildSteps(root: string, build: WebBuild): Step[] {
  return [
    {
      name: "build the web with OpenNext",
      command: "pnpm",
      args: ["--filter", "@take-my-word/web", "bundle"],
      cwd: root,
      env: {
        RELEASES_REPOSITORY: build.releasesRepository,
        WEB_INDEXED_ORIGIN: build.indexedOrigin ?? "",
      },
    },
    {
      name: "package the server function",
      command: "zip",
      args: ["-qry", serverZip(root), "."],
      cwd: join(openNext(root), "server-functions", "default"),
    },
  ];
}

export function webSwapSteps(root: string, targets: WebTargets): Step[] {
  const assets = join(openNext(root), "assets");
  const bucket = `s3://${targets.WEB_ASSETS_BUCKET}`;
  return [
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
    ...swapCode(targets.WEB_FUNCTION_NAME, serverZip(root)),
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

export function deploySteps(side: string | undefined, phase: string | undefined): Step[] | null {
  if (side === "api" && phase === "build") return apiBuildSteps(repositoryRoot);
  if (side === "api" && phase === "swap") {
    return apiSwapSteps(repositoryRoot, requiredEnv(apiFunctions.map(([name]) => name)));
  }
  if (side === "web" && phase === "build") {
    return webBuildSteps(repositoryRoot, {
      releasesRepository: requiredEnv(["RELEASES_REPOSITORY"]).RELEASES_REPOSITORY,
      indexedOrigin: process.env.WEB_INDEXED_ORIGIN,
    });
  }
  if (side === "web" && phase === "swap")
    return webSwapSteps(repositoryRoot, requiredEnv(webTargets));
  return null;
}

if (import.meta.main) {
  const steps = deploySteps(process.argv[2], process.argv[3]);
  if (steps === null) {
    console.error(
      "usage: pnpm deploy:<api|web> <build|swap>; build needs no AWS credentials, swap needs the deploy role",
    );
    process.exitCode = 2;
  } else {
    run(steps);
  }
}
