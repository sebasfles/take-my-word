import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import {
  awsRegionPattern,
  discoveryPath,
  discoverySchema,
  hostnamePattern,
} from "@take-my-word/shared";
import {
  callerAccount,
  cookieKey,
  ensureFirstUser,
  ensureStateBucket,
  leftovers,
  publicZones,
  readDeployed,
  readSecret,
  removeState,
  useProfile,
  writeDeployed,
  writeSecret,
  zoneFor,
  type SecretValues,
} from "./aws.ts";
import {
  ConfigError,
  configFile,
  loadConfig,
  parseConfig,
  stateBucket,
  type DeploymentConfig,
  type Environment,
} from "./config.ts";
import { apiBuildSteps, apiSwapSteps, run, webBuildSteps, webSwapSteps } from "./deploy.ts";
import { Prompt } from "./prompt.ts";
import { siteHosts } from "./terraform.ts";
import { terraform } from "./tf.ts";
import { readDotEnv, repositoryRoot } from "./workspace.ts";

const usage = `usage:
  pnpm selfhost              set up or update your deployment, asking what it needs
  pnpm selfhost --yes        the same without questions: ${configFile} as it is, keys from .env
  pnpm selfhost --plan       show what a run would change in AWS, and stop before changing it
  pnpm selfhost remove       delete everything your deployment created, its state bucket included
options:
  --user <name>              username of the first user (default: admin)
  --yes                      answer yes to every confirmation`;

export const providerKeys = ["GROQ_API_KEY", "OPENAI_API_KEY"] as const;
const removalTargets = [
  "module.app.module.table",
  "module.app.module.user_pool",
  "module.app.module.providers_secret",
  "module.app.module.web_secret",
];

export class SelfHostError extends Error {}

export function selfHostProblem(config: DeploymentConfig): string | null {
  return config.github === undefined
    ? null
    : `${configFile} has a github section: that deployment ships through CI, so pnpm selfhost leaves it alone`;
}

export function repositoryOf(originUrl: string): string | null {
  const match = /[:/]([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(originUrl.trim());
  return match === null ? null : `${match[1]}/${match[2]}`;
}

export function nextProviderKeys(
  stored: SecretValues,
  given: Partial<SecretValues>,
): { values: SecretValues; changed: boolean; missing: string[] } {
  const values = { ...stored };
  for (const key of providerKeys) {
    const value = given[key]?.trim();
    if (value) values[key] = value;
  }
  return {
    values,
    changed: providerKeys.some((key) => values[key] !== stored[key]),
    missing: providerKeys.filter((key) => !values[key]),
  };
}

export function needsDeploy(state: {
  deployed: string | null;
  head: string;
  dirty: boolean;
  infraChanged: boolean;
}): boolean {
  return state.dirty || state.infraChanged || state.deployed !== state.head;
}

export function planOutcome(status: number): "unchanged" | "changes" {
  if (status === 0) return "unchanged";
  if (status === 2) return "changes";
  throw new SelfHostError(`terraform plan failed with exit code ${status}`);
}

export interface Outputs {
  apiUrl: string;
  webUrl: string;
  userPoolId: string;
  clientId: string;
  providersSecretId: string;
  webSecretId: string;
  functions: {
    AUTHORIZER_FUNCTION_NAME: string;
    DICTATE_FUNCTION_NAME: string;
    API_FUNCTION_NAME: string;
    DICTIONARY_USAGE_FUNCTION_NAME: string;
  };
  web: { WEB_FUNCTION_NAME: string; WEB_ASSETS_BUCKET: string; WEB_DISTRIBUTION_ID: string };
}

export function readOutputs(json: string): Outputs {
  const raw = JSON.parse(json) as Record<string, { value?: unknown } | undefined>;
  const text = (name: string): string => {
    const value = raw[name]?.value;
    if (typeof value !== "string" || value === "") {
      throw new SelfHostError(`terraform output ${name} is missing; was the apply complete?`);
    }
    return value;
  };
  return {
    apiUrl: text("api_url"),
    webUrl: text("web_url"),
    userPoolId: text("user_pool_id"),
    clientId: text("native_client_id"),
    providersSecretId: text("providers_secret_id"),
    webSecretId: text("web_secret_id"),
    functions: {
      AUTHORIZER_FUNCTION_NAME: text("authorizer_function_name"),
      DICTATE_FUNCTION_NAME: text("dictate_function_name"),
      API_FUNCTION_NAME: text("api_function_name"),
      DICTIONARY_USAGE_FUNCTION_NAME: text("dictionary_usage_function_name"),
    },
    web: {
      WEB_FUNCTION_NAME: text("web_function_name"),
      WEB_ASSETS_BUCKET: text("web_assets_bucket"),
      WEB_DISTRIBUTION_ID: text("web_distribution_id"),
    },
  };
}

function step(title: string): void {
  console.log(`\n== ${title}`);
}

function git(args: string[]): string {
  return execFileSync("git", ["-C", repositoryRoot, ...args], { encoding: "utf8" }).trim();
}

function originRepository(): string | null {
  try {
    return repositoryOf(git(["remote", "get-url", "origin"]));
  } catch {
    return null;
  }
}

function readExisting(): Record<string, unknown> | null {
  const path = join(repositoryRoot, configFile);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function saveConfig(config: Record<string, unknown>): void {
  writeFileSync(join(repositoryRoot, configFile), `${JSON.stringify(config, null, 2)}\n`);
}

async function askUntil(
  prompt: Prompt,
  question: string,
  fallback: string | undefined,
  valid: (answer: string) => boolean,
  hint: string,
): Promise<string> {
  for (;;) {
    const answer = await prompt.ask(question, fallback);
    if (valid(answer)) return answer;
    console.log(hint);
  }
}

async function askConfig(
  prompt: Prompt,
  existing: Record<string, unknown> | null,
): Promise<Record<string, unknown>> {
  const previous = existing === null ? null : parseConfig(existing);
  const profile = await askUntil(
    prompt,
    "AWS CLI profile",
    previous?.aws.profile ?? "default",
    (answer) => answer !== "",
    "Name the profile you set up with aws configure or aws configure sso.",
  );
  const region = await askUntil(
    prompt,
    "AWS region",
    previous?.aws.region ?? "us-east-1",
    (answer) => awsRegionPattern.test(answer),
    "A region looks like us-east-1 or eu-west-2.",
  );
  const domain = (
    await askUntil(
      prompt,
      "Domain of the web, inside a Route 53 hosted zone of the account",
      previous?.domain,
      (answer) => hostnamePattern.test(answer.toLowerCase()),
      "A domain looks like dictation.example.com, with no https:// or path.",
    )
  ).toLowerCase();
  const name = await askUntil(
    prompt,
    "Deployment name, the prefix of every AWS resource",
    previous?.name ?? "take-my-word",
    (answer) => /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/.test(answer),
    "Use 3 to 32 lowercase letters, digits and hyphens, starting with a letter.",
  );
  const dev = await prompt.confirm(
    `Also create a dev environment at dev.${domain}?`,
    previous?.environments.includes("dev") ?? false,
  );
  const origin = originRepository();
  const releases = await askUntil(
    prompt,
    "GitHub repository whose releases the web offers for download, as owner/name",
    previous?.releases ?? origin ?? undefined,
    (answer) => /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(answer),
    "Write it as owner/name.",
  );
  const environments: Environment[] = dev ? ["dev", "prd"] : ["prd"];
  return {
    $schema: "./deployment.schema.json",
    ...existing,
    name,
    aws: { profile, accountId: previous?.aws.accountId ?? "000000000000", region },
    domain,
    environments,
    releases,
  };
}

async function confirmAccount(config: Record<string, unknown>): Promise<Record<string, unknown>> {
  const aws = config.aws as { profile: string; region: string; accountId: string };
  useProfile(aws.profile, aws.region);
  let account: string;
  try {
    account = await callerAccount(aws.region);
  } catch (error) {
    throw new SelfHostError(
      `the profile ${aws.profile} has no working credentials (${(error as Error).message}); for SSO, run aws sso login --profile ${aws.profile}`,
      { cause: error },
    );
  }
  return { ...config, aws: { ...aws, accountId: account } };
}

async function withHostedZone(config: Record<string, unknown>): Promise<Record<string, unknown>> {
  const domain = config.domain as string;
  const zone = zoneFor(domain, await publicZones(domain));
  if (zone === null) {
    throw new SelfHostError(
      `no public Route 53 hosted zone of this account holds ${domain}; create one for the domain or its parent first`,
    );
  }
  return { ...config, hostedZone: zone.name };
}

async function givenProviderKeys(prompt: Prompt | null): Promise<Partial<SecretValues>> {
  if (prompt === null) {
    const env = readDotEnv(repositoryRoot);
    return Object.fromEntries(providerKeys.map((key) => [key, env[key] ?? ""]));
  }
  console.log("\nThe keys are hidden as you type and go only to AWS Secrets Manager.");
  return {
    GROQ_API_KEY: await prompt.secret("Groq API key (empty keeps the stored one)"),
    OPENAI_API_KEY: await prompt.secret("OpenAI API key (empty keeps the stored one)"),
  };
}

function terraformOrFail(
  config: DeploymentConfig,
  env: Environment,
  args: string[],
  variables = {},
) {
  const { status } = terraform(config, env, args, { variables });
  if (status !== 0)
    throw new SelfHostError(`terraform ${args[0]} on ${env} failed (exit ${status})`);
}

async function applyEnvironment(
  config: DeploymentConfig,
  env: Environment,
  prompt: Prompt | null,
): Promise<{ outputs: Outputs; changed: boolean }> {
  step(`Infrastructure of ${env}`);
  terraformOrFail(config, env, ["init", "-input=false", "-reconfigure"]);
  const plan = terraform(config, env, [
    "plan",
    "-input=false",
    "-detailed-exitcode",
    "-out=selfhost.tfplan",
  ]);
  const changed = planOutcome(plan.status) === "changes";
  if (changed) {
    if (prompt !== null && !(await prompt.confirm(`Apply this plan to ${env}?`, true))) {
      throw new SelfHostError("stopped before applying; nothing was changed");
    }
    terraformOrFail(config, env, ["apply", "-input=false", "selfhost.tfplan"]);
  } else {
    console.log(`${env} already matches the code; nothing to apply.`);
  }
  const output = terraform(config, env, ["output", "-json"], { capture: true });
  if (output.status !== 0) throw new SelfHostError(`terraform output on ${env} failed`);
  return { outputs: readOutputs(output.stdout), changed };
}

async function writeSecrets(
  config: DeploymentConfig,
  env: Environment,
  outputs: Outputs,
  given: Partial<SecretValues>,
): Promise<void> {
  const { region } = config.aws;
  const providers = nextProviderKeys(await readSecret(region, outputs.providersSecretId), given);
  if (providers.missing.length > 0) {
    throw new SelfHostError(
      `${providers.missing.join(" and ")} missing: run pnpm selfhost in a terminal to type them, or add them to .env`,
    );
  }
  if (providers.changed) {
    await writeSecret(region, outputs.providersSecretId, providers.values);
    console.log(`Stored the provider keys of ${env}.`);
  } else {
    console.log(`The provider keys of ${env} are already stored.`);
  }
  const web = await readSecret(region, outputs.webSecretId);
  if (!web.COOKIE_KEY) {
    await writeSecret(region, outputs.webSecretId, { ...web, COOKIE_KEY: cookieKey() });
    console.log(`Generated the web's cookie key for ${env}.`);
  }
}

async function waitForDiscovery(env: Environment, outputs: Outputs): Promise<void> {
  const url = `${outputs.webUrl}${discoveryPath}`;
  const deadline = Date.now() + 20 * 60 * 1000;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      const parsed = discoverySchema.safeParse(response.ok ? await response.json() : null);
      if (
        parsed.success &&
        parsed.data.apiUrl === outputs.apiUrl &&
        parsed.data.userPoolId === outputs.userPoolId &&
        parsed.data.clientId === outputs.clientId
      ) {
        console.log(`${url} answers with this deployment.`);
        return;
      }
      last = `answered ${response.status}`;
    } catch (error) {
      last = (error as Error).message;
    }
    console.log(`Waiting for ${env} to answer (${last}); DNS and CloudFront can take minutes.`);
    await sleep(20_000);
  }
  throw new SelfHostError(`${url} did not answer within 20 minutes (${last})`);
}

function planOnly(config: DeploymentConfig, env: Environment): void {
  step(`Plan of ${env}`);
  terraformOrFail(config, env, ["init", "-input=false", "-reconfigure"]);
  const plan = terraform(config, env, [
    "plan",
    "-input=false",
    "-detailed-exitcode",
    "-out=selfhost.tfplan",
  ]);
  console.log(
    planOutcome(plan.status) === "changes"
      ? `Nothing was applied to ${env}; run pnpm selfhost to apply this plan.`
      : `${env} already matches the code.`,
  );
}

async function setup(options: { yes: boolean; user: string; plan: boolean }): Promise<void> {
  const prompt = options.yes || !process.stdin.isTTY ? null : new Prompt();
  try {
    const existing = readExisting();
    if (existing !== null) {
      const problem = selfHostProblem(parseConfig(existing));
      if (problem !== null) throw new SelfHostError(problem);
    }
    let draft: Record<string, unknown>;
    if (prompt !== null) {
      draft = await askConfig(prompt, existing);
    } else if (existing !== null) {
      draft = existing;
    } else {
      throw new SelfHostError(
        `${configFile} is missing: run pnpm selfhost in a terminal, or copy deployment.example.json to ${configFile} and fill it in`,
      );
    }
    step("AWS account and domain");
    draft = await withHostedZone(await confirmAccount(draft));
    const config = parseConfig(draft);
    if (JSON.stringify(existing) !== JSON.stringify(draft)) {
      saveConfig(draft);
      console.log(`Saved ${configFile}.`);
    }
    console.log(
      `Account ${config.aws.accountId}, ${config.aws.region}, ${config.domain} in the zone ${draft.hostedZone as string}.`,
    );
    const given = options.plan ? {} : await givenProviderKeys(prompt);

    step("Terraform state");
    const bucket = await ensureStateBucket(config);
    console.log(`${stateBucket(config)} ${bucket === "created" ? "created" : "already exists"}.`);

    if (options.plan) {
      for (const env of config.environments) planOnly(config, env);
      return;
    }

    const applied = new Map<Environment, { outputs: Outputs; changed: boolean }>();
    for (const env of config.environments) {
      applied.set(env, await applyEnvironment(config, env, prompt));
    }

    step("Secrets");
    for (const [env, { outputs }] of applied) await writeSecrets(config, env, outputs, given);

    step("Code");
    const head = git(["rev-parse", "HEAD"]);
    const dirty = git(["status", "--porcelain", "--untracked-files=no"]) !== "";
    const pending: [Environment, Outputs][] = [];
    for (const [env, { outputs, changed }] of applied) {
      const deployed = await readDeployed(config.aws.region, outputs.web.WEB_ASSETS_BUCKET);
      if (needsDeploy({ deployed: deployed?.commit ?? null, head, dirty, infraChanged: changed })) {
        pending.push([env, outputs]);
      } else {
        console.log(`${env} already runs ${head.slice(0, 7)}.`);
      }
    }
    if (pending.length > 0) {
      run([...apiBuildSteps(repositoryRoot), ...webBuildSteps(repositoryRoot, config.releases)]);
      for (const [env, outputs] of pending) {
        step(`Deploying ${head.slice(0, 7)}${dirty ? " with local changes" : ""} to ${env}`);
        run([
          ...apiSwapSteps(repositoryRoot, outputs.functions),
          ...webSwapSteps(repositoryRoot, outputs.web),
        ]);
        if (!dirty) {
          await writeDeployed(config.aws.region, outputs.web.WEB_ASSETS_BUCKET, { commit: head });
        }
      }
    }

    step("First user");
    const passwords: string[] = [];
    for (const [env, { outputs }] of applied) {
      const user = await ensureFirstUser(config.aws.region, outputs.userPoolId, options.user);
      if (user.created) {
        passwords.push(`${env}: user ${options.user}, temporary password ${user.password}`);
      } else {
        console.log(`${env} already has users; none created.`);
      }
    }

    step("Checking the deployment answers");
    for (const [env, { outputs }] of applied) await waitForDiscovery(env, outputs);

    step("Ready");
    for (const [env, { outputs }] of applied) {
      console.log(`${env}: web ${outputs.webUrl}, API ${outputs.apiUrl}`);
      console.log(
        `${env}: in the desktop app, choose "Use your own server" and type ${siteHosts(config.domain, env).web}`,
      );
    }
    for (const line of passwords) console.log(line);
    if (passwords.length > 0) {
      console.log("The temporary password works once: the first sign-in asks for a new one.");
    }
  } finally {
    prompt?.close();
  }
}

async function remove(options: { yes: boolean }): Promise<void> {
  const config = loadConfig(repositoryRoot);
  const problem = selfHostProblem(config);
  if (problem !== null) throw new SelfHostError(problem);
  useProfile(config.aws.profile, config.aws.region);
  const account = await callerAccount(config.aws.region);
  if (account !== config.aws.accountId) {
    throw new SelfHostError(
      `the profile ${config.aws.profile} is account ${account}, not ${config.aws.accountId}`,
    );
  }
  if (!options.yes) {
    if (!process.stdin.isTTY) throw new SelfHostError("removal needs a terminal, or --yes");
    const prompt = new Prompt();
    const typed = await prompt.ask(
      `This deletes ${config.environments.join(" and ")} of ${config.domain}, every user and dictation, and the state bucket ${stateBucket(config)}. Type ${config.domain} to go on`,
    );
    prompt.close();
    if (typed !== config.domain) throw new SelfHostError("stopped; nothing was deleted");
  }
  const removal = { TF_VAR_removal: "true" };
  for (const env of [...config.environments].reverse()) {
    step(`Removing ${env}`);
    const init = terraform(config, env, ["init", "-input=false", "-reconfigure"]);
    if (init.status !== 0) {
      console.log(
        `terraform init on ${env} failed; its state is gone, so there is nothing to destroy.`,
      );
      continue;
    }
    const state = terraform(config, env, ["state", "list"], { capture: true });
    if (state.status !== 0 || state.stdout.trim() === "") {
      console.log(`${env} has nothing in its state.`);
      continue;
    }
    terraformOrFail(
      config,
      env,
      [
        "apply",
        "-input=false",
        "-auto-approve",
        ...removalTargets.map((target) => `-target=${target}`),
      ],
      removal,
    );
    terraformOrFail(config, env, ["destroy", "-input=false", "-auto-approve"], removal);
  }

  step("Terraform state");
  console.log(await removeState(config));

  step("Checking nothing is left");
  const deadline = Date.now() + 10 * 60 * 1000;
  let found = await leftovers(config);
  while (found.length > 0 && Date.now() < deadline) {
    console.log(`Still listed (AWS indexes can lag): ${found.join(", ")}`);
    await sleep(30_000);
    found = await leftovers(config);
  }
  if (found.length > 0) {
    throw new SelfHostError(`these remain after removal:\n${found.join("\n")}`);
  }
  console.log(`Nothing of ${config.name} is left in account ${account}.`);
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      yes: { type: "boolean", default: false },
      plan: { type: "boolean", default: false },
      user: { type: "string", default: "admin" },
      help: { type: "boolean", default: false },
    },
  });
  const [command, ...extra] = positionals;
  if (values.help || extra.length > 0 || (command !== undefined && command !== "remove")) {
    console.log(usage);
    return values.help ? 0 : 2;
  }
  if (command === "remove") await remove({ yes: values.yes });
  else await setup({ yes: values.yes, user: values.user, plan: values.plan });
  return 0;
}

if (import.meta.main) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof SelfHostError || error instanceof ConfigError)) throw error;
    console.error(`\npnpm selfhost stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
