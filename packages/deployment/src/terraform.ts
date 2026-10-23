import { hostedZone, stateBucket, type DeploymentConfig, type Environment } from "./config.ts";

export type Root = "core" | Environment;

export function rootProblem(config: DeploymentConfig, root: Root): string | null {
  if (root === "core") {
    return config.github === undefined
      ? "core manages CI only; it needs the github section of the deployment config"
      : null;
  }
  return config.environments.includes(root)
    ? null
    : `${root} is not one of this deployment's environments (${config.environments.join(", ")})`;
}

export function siteHosts(domain: string, env: Environment): { web: string; api: string } {
  const web = env === "prd" ? domain : `dev.${domain}`;
  return { web, api: `api.${web}` };
}

export function backendConfig(config: DeploymentConfig, root: Root): string {
  return [
    `bucket = ${JSON.stringify(stateBucket(config))}`,
    `key = ${JSON.stringify(`${root}/terraform.tfstate`)}`,
    `region = ${JSON.stringify(config.aws.region)}`,
    `allowed_account_ids = [${JSON.stringify(config.aws.accountId)}]`,
    "",
  ].join("\n");
}

export function terraformVariables(
  config: DeploymentConfig,
  root: Root,
  githubAppPem: string | undefined,
): Record<string, string> {
  const github =
    config.github === undefined
      ? {}
      : {
          TF_VAR_github: JSON.stringify({
            owner: config.github.owner,
            repository: config.github.repository,
            app_id: config.github.appId,
            app_installation_id: config.github.appInstallationId,
          }),
          ...(githubAppPem === undefined ? {} : { TF_VAR_github_app_pem: githubAppPem }),
        };
  const site =
    root === "core" ? {} : { TF_VAR_domain: config.domain, TF_VAR_hosted_zone: hostedZone(config) };
  return {
    TF_VAR_deployment: config.name,
    TF_VAR_aws_account_id: config.aws.accountId,
    TF_VAR_aws_region: config.aws.region,
    ...site,
    ...github,
    ...(root === "dev" && config.evalFunction && { TF_VAR_eval_function: "true" }),
  };
}
