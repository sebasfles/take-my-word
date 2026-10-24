import { readFileSync } from "node:fs";
import { join } from "node:path";
import { awsRegionSchema, discoverySchema, hostnameSchema } from "@take-my-word/shared";
import { z } from "zod";

export const environments = ["dev", "prd"] as const;
export type Environment = (typeof environments)[number];

export const configFile = "deployment.json";

const repositorySchema = z.string().regex(/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/);

export const deploymentConfigSchema = z
  .object({
    $schema: z.string().optional(),
    name: z
      .string()
      .regex(/^[a-z][a-z0-9-]{1,30}[a-z0-9]$/)
      .default("take-my-word")
      .meta({
        description:
          "Prefix of every AWS resource name, as <name>-<env>-...; changing it later replaces the whole deployment.",
      }),
    aws: z
      .object({
        profile: z
          .string()
          .min(1)
          .meta({ description: "AWS CLI profile every command runs with." }),
        accountId: z
          .string()
          .regex(/^\d{12}$/)
          .meta({
            description: "Account the profile must resolve to; Terraform refuses any other.",
          }),
        region: awsRegionSchema.meta({
          description:
            "Region of everything but the web's certificate, which CloudFront needs in us-east-1.",
        }),
      })
      .strict(),
    domain: hostnameSchema.meta({
      description:
        "Host of the prd web; dev answers on dev.<domain> and each API on api.<web host>.",
    }),
    hostedZone: hostnameSchema.optional().meta({
      description:
        "Public Route 53 hosted zone that holds the domain, read and never owned; defaults to the domain.",
    }),
    stateBucket: z
      .string()
      .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
      .optional()
      .meta({
        description:
          "S3 bucket of the Terraform state, in the deployment's region; defaults to <name>-terraform-state-<accountId>.",
      }),
    environments: z
      .array(z.enum(environments))
      .min(1)
      .refine((list) => new Set(list).size === list.length, "each environment once")
      .default(["prd"])
      .meta({ description: "Environments this deployment runs." }),
    indexed: z.boolean().default(false).meta({
      description:
        "Let search engines index the prd web at https://<domain>; off, every page answers noindex. dev is never indexed.",
    }),
    evalFunction: z.boolean().default(false).meta({
      description:
        "Give dev the eval Lambda that the evaluation harness (apps/api/evaluation) swaps and invokes; needs dev, never reaches prd.",
    }),
    releases: repositorySchema.meta({
      description:
        "GitHub repository, as owner/name, whose releases hold the desktop app the web links to.",
    }),
    github: z
      .object({
        owner: z.string().regex(/^[A-Za-z0-9-]+$/),
        repository: z.string().regex(/^[A-Za-z0-9._-]+$/),
        appId: z.string().regex(/^\d+$/),
        appInstallationId: z.string().regex(/^\d+$/),
      })
      .strict()
      .optional()
      .meta({
        description:
          "Optional CI: the repository whose Actions deploy the code, and the GitHub App Terraform manages it as (its private key is GITHUB_APP_PEM in .env). Without it there is no core, no deploy role and no Actions variable.",
      }),
    desktop: z
      .object({
        updaterPublicKey: z.string().min(1).meta({
          description: "Public half of the minisign key the desktop releases are signed with.",
        }),
        servers: z
          .object({ dev: discoverySchema.optional(), prd: discoverySchema.optional() })
          .strict()
          .meta({
            description:
              "The server each desktop build signs in to, as its /.well-known/take-my-word.json serves it.",
          }),
      })
      .strict()
      .optional()
      .meta({ description: "Optional: only for building and releasing the desktop app." }),
  })
  .strict()
  .refine(
    (config) =>
      config.hostedZone === undefined ||
      config.domain === config.hostedZone ||
      config.domain.endsWith(`.${config.hostedZone}`),
    { message: "the domain must be the hosted zone or inside it", path: ["hostedZone"] },
  )
  .refine((config) => !config.evalFunction || config.environments.includes("dev"), {
    message: "evalFunction needs the dev environment",
    path: ["evalFunction"],
  });

export type DeploymentConfig = z.infer<typeof deploymentConfigSchema>;

export class ConfigError extends Error {}

export function parseConfig(value: unknown, source = configFile): DeploymentConfig {
  const parsed = deploymentConfigSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new ConfigError(`${source} is not valid:\n${z.prettifyError(parsed.error)}`);
}

export function loadConfig(root: string): DeploymentConfig {
  const path = join(root, configFile);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new ConfigError(
      `${path} is missing; copy deployment.example.json to ${configFile} and fill it in`,
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(`${path} is not JSON: ${(error as Error).message}`);
  }
  return parseConfig(value, path);
}

export function hostedZone(config: DeploymentConfig): string {
  return config.hostedZone ?? config.domain;
}

export function indexedOrigin(config: DeploymentConfig): string | undefined {
  return config.indexed ? `https://${config.domain}` : undefined;
}

export function stateBucket(config: DeploymentConfig): string {
  return config.stateBucket ?? `${config.name}-terraform-state-${config.aws.accountId}`;
}
