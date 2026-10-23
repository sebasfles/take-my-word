import { randomBytes, randomInt } from "node:crypto";
import { CloudWatchLogsClient, DescribeLogGroupsCommand } from "@aws-sdk/client-cloudwatch-logs";
import {
  AdminCreateUserCommand,
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { IAMClient, ListRolesCommand } from "@aws-sdk/client-iam";
import {
  GetResourcesCommand,
  ResourceGroupsTaggingAPIClient,
} from "@aws-sdk/client-resource-groups-tagging-api";
import {
  ListHostedZonesByNameCommand,
  ListResourceRecordSetsCommand,
  Route53Client,
  type RRType,
} from "@aws-sdk/client-route-53";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  GetBucketTaggingCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectVersionsCommand,
  PutBucketEncryptionCommand,
  PutBucketTaggingCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  PutPublicAccessBlockCommand,
  S3Client,
  type BucketLocationConstraint,
} from "@aws-sdk/client-s3";
import {
  GetSecretValueCommand,
  ListSecretsCommand,
  PutSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import {
  ConfigError,
  environments,
  hostedZone,
  stateBucket,
  type DeploymentConfig,
} from "./config.ts";
import { siteHosts } from "./terraform.ts";

export const createdBy = "pnpm selfhost";
const certificateRegion = "us-east-1";

export function useProfile(profile: string, region: string): void {
  process.env.AWS_PROFILE = profile;
  process.env.AWS_REGION = region;
  delete process.env.AWS_DEFAULT_REGION;
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;
  delete process.env.AWS_SESSION_TOKEN;
}

export async function callerAccount(region: string): Promise<string> {
  const identity = await new STSClient({ region }).send(new GetCallerIdentityCommand({}));
  if (identity.Account === undefined) throw new Error("STS returned no account");
  return identity.Account;
}

export interface Zone {
  id: string;
  name: string;
  private: boolean;
}

export function zoneFor(domain: string, zones: readonly Zone[]): Zone | null {
  return (
    zones
      .filter((zone) => !zone.private)
      .filter((zone) => domain === zone.name || domain.endsWith(`.${zone.name}`))
      .sort((a, b) => b.name.length - a.name.length)[0] ?? null
  );
}

export async function publicZones(domain: string): Promise<Zone[]> {
  const route53 = new Route53Client({ region: certificateRegion });
  const labels = domain.split(".");
  const zones: Zone[] = [];
  for (let start = 0; start < labels.length - 1; start += 1) {
    const name = labels.slice(start).join(".");
    const listed = await route53.send(
      new ListHostedZonesByNameCommand({ DNSName: name, MaxItems: 10 }),
    );
    for (const zone of listed.HostedZones ?? []) {
      const zoneName = (zone.Name ?? "").replace(/\.$/, "");
      if (zoneName === name && zone.Id !== undefined) {
        zones.push({
          id: zone.Id.replace("/hostedzone/", ""),
          name: zoneName,
          private: zone.Config?.PrivateZone === true,
        });
      }
    }
  }
  return zones;
}

function isStatus(error: unknown, ...statuses: number[]): boolean {
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return status !== undefined && statuses.includes(status);
}

function isNamed(error: unknown, ...names: string[]): boolean {
  return error instanceof Error && names.includes(error.name);
}

function bucketTags(name: string) {
  return [
    { Key: "Project", Value: name },
    { Key: "ManagedBy", Value: createdBy },
  ];
}

export type BucketTags = readonly { Key?: string | undefined; Value?: string | undefined }[];

export function isOwnBucket(tags: BucketTags, name: string): boolean {
  const value = (key: string) => tags.find((tag) => tag.Key === key)?.Value;
  return value("Project") === name && value("ManagedBy") === createdBy;
}

export function stateBucketUse(
  tags: BucketTags | null,
  name: string,
  bucket: string,
): "create" | "own" {
  if (tags === null) return "create";
  if (isOwnBucket(tags, name)) return "own";
  throw new ConfigError(
    `the state bucket ${bucket} was not created by pnpm selfhost for ${name}, so it may hold another deployment's state; name a bucket that does not exist yet in stateBucket, or leave stateBucket out`,
  );
}

async function stateBucketTags(s3: S3Client, Bucket: string): Promise<BucketTags | null> {
  try {
    return (await s3.send(new GetBucketTaggingCommand({ Bucket }))).TagSet ?? [];
  } catch (error) {
    if (isNamed(error, "NoSuchBucket") || isStatus(error, 404)) return null;
    if (isNamed(error, "NoSuchTagSet")) return [];
    if (isStatus(error, 403)) {
      throw new ConfigError(
        `the state bucket ${Bucket} belongs to another account or this profile cannot read it; set another stateBucket`,
        { cause: error },
      );
    }
    throw error;
  }
}

export async function checkStateBucket(config: DeploymentConfig): Promise<"create" | "own"> {
  const s3 = new S3Client({ region: config.aws.region });
  const Bucket = stateBucket(config);
  return stateBucketUse(await stateBucketTags(s3, Bucket), config.name, Bucket);
}

export async function ensureStateBucket(config: DeploymentConfig): Promise<"created" | "exists"> {
  if ((await checkStateBucket(config)) === "own") return "exists";
  const s3 = new S3Client({ region: config.aws.region });
  const Bucket = stateBucket(config);
  await s3.send(
    new CreateBucketCommand({
      Bucket,
      ...(config.aws.region === "us-east-1"
        ? {}
        : {
            CreateBucketConfiguration: {
              LocationConstraint: config.aws.region as BucketLocationConstraint,
            },
          }),
    }),
  );
  await s3.send(
    new PutBucketTaggingCommand({ Bucket, Tagging: { TagSet: bucketTags(config.name) } }),
  );
  await s3.send(
    new PutPublicAccessBlockCommand({
      Bucket,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    }),
  );
  await s3.send(
    new PutBucketVersioningCommand({ Bucket, VersioningConfiguration: { Status: "Enabled" } }),
  );
  await s3.send(
    new PutBucketEncryptionCommand({
      Bucket,
      ServerSideEncryptionConfiguration: {
        Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }],
      },
    }),
  );
  return "created";
}

async function deleteVersions(s3: S3Client, Bucket: string): Promise<void> {
  for (;;) {
    const listed = await s3.send(new ListObjectVersionsCommand({ Bucket }));
    const objects = [...(listed.Versions ?? []), ...(listed.DeleteMarkers ?? [])]
      .filter((version) => version.Key !== undefined)
      .map((version) => ({ Key: version.Key ?? "", VersionId: version.VersionId }));
    if (objects.length === 0) return;
    await s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: objects, Quiet: true } }));
  }
}

export async function removeState(config: DeploymentConfig): Promise<string> {
  const Bucket = stateBucket(config);
  if ((await checkStateBucket(config)) === "create")
    return `the state bucket ${Bucket} is already gone`;
  const s3 = new S3Client({ region: config.aws.region });
  await deleteVersions(s3, Bucket);
  await s3.send(new DeleteBucketCommand({ Bucket }));
  return `deleted the state bucket ${Bucket}`;
}

export type SecretValues = Record<string, string>;

export async function readSecret(region: string, SecretId: string): Promise<SecretValues> {
  const secrets = new SecretsManagerClient({ region });
  const value = await secrets.send(new GetSecretValueCommand({ SecretId }));
  const parsed: unknown = JSON.parse(value.SecretString ?? "{}");
  if (typeof parsed !== "object" || parsed === null) return {};
  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export async function writeSecret(
  region: string,
  SecretId: string,
  values: SecretValues,
): Promise<void> {
  const secrets = new SecretsManagerClient({ region });
  await secrets.send(new PutSecretValueCommand({ SecretId, SecretString: JSON.stringify(values) }));
}

export function cookieKey(): string {
  return randomBytes(32).toString("base64");
}

const passwordSets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789"] as const;

export function temporaryPassword(length = 20): string {
  const all = passwordSets.join("");
  const characters = [
    ...passwordSets.map((set) => set[randomInt(set.length)] ?? ""),
    ...Array.from({ length: length - passwordSets.length }, () => all[randomInt(all.length)] ?? ""),
  ];
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1);
    [characters[index], characters[other]] = [characters[other] ?? "", characters[index] ?? ""];
  }
  return characters.join("");
}

export type FirstUser = { created: false } | { created: true; password: string };

export async function ensureFirstUser(
  region: string,
  UserPoolId: string,
  Username: string,
): Promise<FirstUser> {
  const cognito = new CognitoIdentityProviderClient({ region });
  const listed = await cognito.send(new ListUsersCommand({ UserPoolId, Limit: 1 }));
  if ((listed.Users ?? []).length > 0) return { created: false };
  const password = temporaryPassword();
  await cognito.send(
    new AdminCreateUserCommand({
      UserPoolId,
      Username,
      TemporaryPassword: password,
      MessageAction: "SUPPRESS",
    }),
  );
  return { created: true, password };
}

export interface DeployedMarker {
  commit: string;
  build?: string;
}

const markerKey = "selfhost/deployed.json";

export async function readDeployed(region: string, Bucket: string): Promise<DeployedMarker | null> {
  const s3 = new S3Client({ region });
  try {
    const object = await s3.send(new GetObjectCommand({ Bucket, Key: markerKey }));
    const parsed: unknown = JSON.parse((await object.Body?.transformToString()) ?? "{}");
    const { commit, build } = parsed as { commit?: unknown; build?: unknown };
    if (typeof commit !== "string") return null;
    return typeof build === "string" ? { commit, build } : { commit };
  } catch (error) {
    if (isNamed(error, "NoSuchKey")) return null;
    throw error;
  }
}

export async function writeDeployed(
  region: string,
  Bucket: string,
  marker: DeployedMarker,
): Promise<void> {
  const s3 = new S3Client({ region });
  await s3.send(
    new PutObjectCommand({
      Bucket,
      Key: markerKey,
      Body: JSON.stringify(marker),
      ContentType: "application/json",
    }),
  );
}

export function isDeploymentRecord(
  record: { name: string; type: string },
  hosts: readonly string[],
): boolean {
  const name = record.name.replace(/\.$/, "").toLowerCase();
  if (record.type === "A" || record.type === "AAAA") return hosts.includes(name);
  if (record.type !== "CNAME") return false;
  const [label, ...rest] = name.split(".");
  return /^_[0-9a-f]{32}$/.test(label ?? "") && hosts.includes(rest.join("."));
}

async function taggedResources(region: string, project: string): Promise<string[]> {
  const tagging = new ResourceGroupsTaggingAPIClient({ region });
  const arns: string[] = [];
  let PaginationToken: string | undefined;
  do {
    const page = await tagging.send(
      new GetResourcesCommand({
        TagFilters: [{ Key: "Project", Values: [project] }],
        PaginationToken,
      }),
    );
    arns.push(...(page.ResourceTagMappingList ?? []).flatMap((r) => r.ResourceARN ?? []));
    PaginationToken = page.PaginationToken || undefined;
  } while (PaginationToken !== undefined);
  const live: string[] = [];
  for (const arn of arns) if (await stillExists(arn)) live.push(arn);
  return live;
}

export function userPoolOf(arn: string): { region: string; id: string } | null {
  const match = /^arn:aws:cognito-idp:([a-z0-9-]+):\d{12}:userpool\/([\w-]+)$/.exec(arn);
  return match === null ? null : { region: match[1] ?? "", id: match[2] ?? "" };
}

async function stillExists(arn: string): Promise<boolean> {
  const pool = userPoolOf(arn);
  if (pool === null) return true;
  try {
    await new CognitoIdentityProviderClient({ region: pool.region }).send(
      new DescribeUserPoolCommand({ UserPoolId: pool.id }),
    );
    return true;
  } catch (error) {
    if (isNamed(error, "ResourceNotFoundException")) return false;
    throw error;
  }
}

export async function leftovers(config: DeploymentConfig): Promise<string[]> {
  const { region } = config.aws;
  const prefixes = environments.map((env) => `${config.name}-${env}`);
  const owned = (name: string | undefined) =>
    prefixes.some(
      (prefix) =>
        name === prefix || name?.startsWith(`${prefix}-`) || name?.startsWith(`${prefix}/`),
    );
  const found: string[] = [];

  for (const each of new Set([region, certificateRegion])) {
    found.push(...(await taggedResources(each, config.name)));
  }

  const iam = new IAMClient({ region: certificateRegion });
  let Marker: string | undefined;
  do {
    const page = await iam.send(new ListRolesCommand({ Marker }));
    found.push(
      ...(page.Roles ?? [])
        .filter((role) => owned(role.RoleName))
        .map((role) => `IAM role ${role.RoleName}`),
    );
    Marker = page.IsTruncated === true ? page.Marker : undefined;
  } while (Marker !== undefined);

  const secrets = new SecretsManagerClient({ region });
  let NextToken: string | undefined;
  do {
    const page = await secrets.send(
      new ListSecretsCommand({ IncludePlannedDeletion: true, NextToken }),
    );
    found.push(
      ...(page.SecretList ?? [])
        .filter((secret) => owned(secret.Name))
        .map(
          (secret) =>
            `secret ${secret.Name}${secret.DeletedDate === undefined ? "" : " (pending deletion)"}`,
        ),
    );
    NextToken = page.NextToken;
  } while (NextToken !== undefined);

  const logs = new CloudWatchLogsClient({ region });
  for (const prefix of prefixes) {
    for (const logGroupNamePrefix of [`/aws/lambda/${prefix}-`, `/aws/apigateway/${prefix}`]) {
      const groups = await logs.send(new DescribeLogGroupsCommand({ logGroupNamePrefix }));
      found.push(...(groups.logGroups ?? []).map((group) => `log group ${group.logGroupName}`));
    }
  }

  const zone = zoneFor(config.domain, await publicZones(hostedZone(config)));
  if (zone !== null) {
    const hosts = environments.flatMap((env) => Object.values(siteHosts(config.domain, env)));
    const route53 = new Route53Client({ region: certificateRegion });
    let StartRecordName: string | undefined;
    let StartRecordType: RRType | undefined;
    do {
      const page = await route53.send(
        new ListResourceRecordSetsCommand({
          HostedZoneId: zone.id,
          StartRecordName,
          StartRecordType,
        }),
      );
      found.push(
        ...(page.ResourceRecordSets ?? [])
          .filter((record) =>
            isDeploymentRecord({ name: record.Name ?? "", type: record.Type ?? "" }, hosts),
          )
          .map((record) => `DNS ${record.Type} ${record.Name}`),
      );
      StartRecordName = page.IsTruncated === true ? page.NextRecordName : undefined;
      StartRecordType = page.NextRecordType;
    } while (StartRecordName !== undefined);
  }

  try {
    await new S3Client({ region }).send(new HeadBucketCommand({ Bucket: stateBucket(config) }));
    found.push(`state bucket ${stateBucket(config)}`);
  } catch (error) {
    if (!isStatus(error, 404, 403)) throw error;
  }
  return found;
}
