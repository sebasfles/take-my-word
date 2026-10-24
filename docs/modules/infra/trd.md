---
updated: 2026-10-24
source: 0017_eval_harness
---

# Infra: technical

Every per-deployment value (account, region, profile, domain, zone, state bucket, name prefix, GitHub repository and App) comes from `deployment.json` at the repo root, gitignored, documented key by key in `deployment.example.json` and the generated `deployment.schema.json`; no value lives in `.tf` files.
The official deployment runs `core`, `dev` and `prd` from Sebastian's machine and ships code through CI; a self-hosted one runs prd (and optionally dev) through `pnpm selfhost`, with no `core` and no CI.

## Structure

| Path | What |
|---|---|
| `infra/environments/core` | Only with a `github` section: GitHub OIDC provider, GitHub App wiring, Actions environments `dev` and `prd`, branch rulesets. |
| `infra/environments/dev`, `infra/environments/prd` | One Terraform root per env, each instantiating `stacks/app`; hosts derive from `domain` (`dev.<domain>`, `api.<web host>`), names from `<deployment>-<env>`. |
| `infra/stacks/app` | Everything one env runs; the deploy role, the GitHub data sources and the Actions variables exist only when `github` is set (`moved` blocks keep the official addresses at `[0]`). |
| `infra/modules/aws/*` | Reusable modules: `lambda` (IAM statements may carry conditions, optional `AWS_IAM` Function URL), `http_api`, `cognito`, `dynamodb`, `acm`, `secrets`, `s3` (private bucket), `cloudfront` (distribution with OAC to a bucket and a Function URL, security headers policy, alias records). |
| `packages/deployment` | The config schema, `pnpm tf <core\|dev\|prd> <args>` (profile from the config, variables as `TF_VAR_*`, a generated `.terraform/deployment.tfbackend`, `GITHUB_APP_PEM` from `.env` only with `github`), `pnpm deploy:<api\|web> <build\|swap>` and `pnpm selfhost`. |
| `.github/workflows` | `ci` (no path filter, also runs the OpenNext build); `deploy-dev` and `deploy-prd` run `reusable-changes`, then `reusable-deploy` (api) and `reusable-deploy-web` only for the side the push touched (the web side includes `packages/brand/` and `packages/deployment/`), each calling `pnpm deploy:<side> build` before assuming the role and `swap` after; `desktop-release` builds and publishes the desktop on `desktop-v*` tags with no AWS access (desktop module); mobile release paths live in its module. |

## Resources per env

| Resource | Purpose |
|---|---|
| API Gateway HTTP API | Fronts every route at `api.<web host>` (execute-api endpoint off, 10 requests per second, burst 20); the authorizer is attached; integrations time out at 30 s. |
| Lambda `api` | Hono, every CRUD route (dictionary, styles, app rules, settings, history); 512 MB, 15 s; Node 24, ARM64, bundled with esbuild. |
| Lambda `dictate` | `POST /dictations`; 60 s timeout and more memory than `api`. |
| Lambda `dictionary-usage` | Consumer of the table's DynamoDB Stream through an event source mapping filtered to inserts of `DICTATION#`, batch 10, retry 2, bisect, batch item failures (dictionary module). |
| DynamoDB `<deployment>-{env}` | The single table, with TTL and a stream enabled. |
| Cognito user pool | Configured by the auth module, created here. |
| Secrets Manager blob | Groq and OpenAI keys in one secret, read by `dictate`; `<deployment>-{env}/web` holds the web's `COOKIE_KEY`; prd's recovery window is 7 days, 0 under `removal`. |
| S3 debug bucket | Dev only, optional raw audio for debugging, one-day lifecycle. |
| Lambda `eval` | Dev only, when `evalFunction` is on: the evaluation harness swaps its code from the checkout that runs it and invokes it with the deployment profile; no route, 1024 MB like `dictate`, 120 s, allowed only to read the providers secret; CI and the deploy role never touch it. |
| Web hosting | Lambda `web` (OpenNext server, 512 MB, 30 s) behind an `AWS_IAM` Function URL, the private bucket `<deployment>-{env}-web-assets-{account}` for `/_next/static/*` and `/static/*`, and one CloudFront distribution with OAC to both, caching disabled for the server and a headers policy (HSTS, nosniff, `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`); its certificate comes from an `aws.us_east_1` provider alias, so any region works. |
| Route 53 records | `<domain>` for prd and `dev.<domain>` for dev (A and AAAA to CloudFront), and an `api.` alias in front of each, each with its ACM certificate, in the zone named by `hostedZone`, which Terraform reads and never owns. |
| CloudWatch | Structured logs and EMF metrics per provider; every log group keeps 30 days. |

## Endpoints owned

None; infra hosts every route and owns no business endpoint.
Jobs, listeners or scheduled work: none.

## Delivery

- `develop` deploys dev and the dev deploy opens the promotion PR to `main`; `main` deploys prd.
- Workflows build with no AWS credentials, then assume the env's deploy role over GitHub OIDC and swap the code; the web job also syncs the assets bucket and invalidates the CloudFront distribution.
- The web swap uploads `/_next/static/*` (immutable, one year) before swapping the function code, then the rest of the assets (5 minutes), then invalidates the distribution; the server zip keeps pnpm's symlinks (`zip -y`).
- The deploy role grants `UpdateFunctionCode` and `GetFunction` on that env's functions only, `s3:ListBucket` and `s3:PutObject` on the web bucket and `cloudfront:CreateInvalidation` on the web distribution, and trusts exactly the repository's immutable subject, `repo:<owner>@<owner id>/<repository>@<repository id>:environment:{env}`, built from the GitHub user and repository ids.
- The Lambda module ignores `filename`, `source_code_hash` and `publish`, so Terraform never fights CI over code.
- The official Terraform is applied only from Sebastian's machine, through `pnpm tf`.
- `pnpm selfhost` deploys from the machine that runs it and records the commit and web build inputs in `selfhost/deployed.json` of the assets bucket, so a re-run with nothing changed deploys nothing; it refuses a config with `github`, so it never touches the official deployment.
- `desktop-release` is the only workflow with `contents: write` and the only one that sees the updater signing key; it assumes no AWS role.

## Depends on

- An AWS account with a public Route 53 zone for the domain; the official one comes from the organization's account vending, with its budget, and its domain is delegated from Cloudflare.
- GitHub Actions and OIDC, only for a deployment with `github`.

## Depended on by

- Every module: auth (pool, authorizer attachment), dictation (`dictate`, secret, metrics), dictionary (stream and `dictionary-usage`), styles (`api`, table), desktop and mobile (the API they call).

## Configuration

- `deployment.json`: see `deployment.example.json`; `pnpm tf` refuses a profile that resolves to another account than `aws.accountId`.
- Lambda environment variables are wired by `stacks/app`; `DEBUG_BUCKET` only while the dev variable `debug_audio` is on.
- `evalFunction` in `deployment.json` (off by default, refused without dev) makes `pnpm tf dev` pass `TF_VAR_eval_function`; prd and core never receive it, and the stack refuses it outside dev.
- Repository Actions variables, set by hand: `DESKTOP_DEV_SERVER` and `DESKTOP_PRD_SERVER` (the discovery JSON each desktop build signs in to), `DESKTOP_UPDATER_PUBKEY` and `WEB_INDEXED_ORIGIN` (the prd origin search engines may index).
- `AWS_ROLE_ARN`, `AWS_REGION`, `DICTATE_FUNCTION_NAME`, `AUTHORIZER_FUNCTION_NAME`, `API_FUNCTION_NAME`, `DICTIONARY_USAGE_FUNCTION_NAME`, `WEB_FUNCTION_NAME`, `WEB_ASSETS_BUCKET` and `WEB_DISTRIBUTION_ID` are written by `stacks/app` into the env's Actions environment, which `core` creates.
- Repository Actions secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (the updater key, minisign, password-protected) are set by hand with `gh secret set` from stdin, outside Terraform; the values also sit in the root `.env` and Sebastian's password manager, and the public half in `DESKTOP_UPDATER_PUBKEY` and `deployment.json`.
  Rotating the key strands installed apps, which only trust the old public key.
- State: the config's `stateBucket` (default `<deployment>-terraform-state-<account>`; versioned, encrypted, public access blocked; by hand for the official one, by `pnpm selfhost` otherwise, tagged so removal deletes only its own), one key per root, S3 lockfile.
- Apply order on a fresh account: state bucket, `core` (with `github` only), then each env.
- A newly applied env answers `not deployed` (503) until code reaches it: write its two secrets from `.env` and a fresh `COOKIE_KEY` (stdin, never arguments), then push the code once by hand in `reusable-deploy` order, or let the next deploy run do it.

## Testing

- `terraform fmt -check -recursive` and `terraform validate` per environment root, in `ci` and in `verify-task`.
- `pnpm e2e` in `apps/api` and in `apps/web` exercise the deployed dev stack.
