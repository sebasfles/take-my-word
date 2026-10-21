---
updated: 2026-10-21
source: 0001_platform_skeleton
---

# Infra: technical

`core` and `dev` are applied and `prd` is written and planned since 0001; `api`, `dictionary-usage` and web hosting come with their phases.

## Structure

| Path | What |
|---|---|
| `infra/environments/core` | Applied once per account: GitHub OIDC provider, GitHub App wiring, Actions environments `dev` and `prd`, branch rulesets. |
| `infra/environments/dev`, `infra/environments/prd` | One Terraform root per env, each instantiating `stacks/app` with its own variables. |
| `infra/stacks/app` | Everything one env runs, plus the per-env deploy role scoped to that env's Actions environment. |
| `infra/modules/aws/*` | Reusable modules: `lambda`, `http_api`, `cognito`, `dynamodb`, `acm`, `secrets`; `s3` and `cloudfront` arrive with the web. |
| `infra/scripts/tf` | `infra/scripts/tf <env> <terraform args>` (`core`, `dev` or `prd`): feeds `GITHUB_APP_PEM` from `.env` as `TF_VAR_github_app_pem` and uses the `fless-takemyword` profile. |
| `.github/workflows` | `ci` (no path filter), `deploy-dev` and `deploy-prd` (path-filtered to the api, shared, workflows and lockfile) through `reusable-deploy`; desktop and mobile release paths live in their modules. |

## Resources per env

| Resource | Purpose |
|---|---|
| API Gateway HTTP API | Fronts every route at `api.dev.takemyword.fless.dev` and `api.takemyword.fless.dev` (execute-api endpoint off, 10 requests per second, burst 20); the authorizer is attached; integrations time out at 30 s. |
| Lambda `api` | Hono, every CRUD route; Node 24, ARM64, bundled with esbuild. |
| Lambda `dictate` | `POST /dictations`; 60 s timeout and more memory than `api`. |
| Lambda `dictionary-usage` | Consumer of the table's DynamoDB Stream (dictionary module). |
| DynamoDB `take-my-word-{env}` | The single table, with TTL and a stream enabled. |
| Cognito user pool | Configured by the auth module, created here. |
| Secrets Manager blob | Groq and OpenAI keys in one secret, read by `dictate`. |
| S3 debug bucket | Dev only, optional raw audio for debugging, one-day lifecycle. |
| Web hosting | `apps/web` through OpenNext on Lambda behind CloudFront. |
| Route 53 records | `takemyword.fless.dev` for prd, `dev.takemyword.fless.dev` for dev, and an `api.` alias in front of each with its ACM certificate. |
| CloudWatch | Structured logs and EMF metrics per provider; every log group keeps 30 days. |

## Endpoints owned

None; infra hosts every route and owns no business endpoint.
Jobs, listeners or scheduled work: none.

## Delivery

- `develop` deploys dev and the dev deploy opens the promotion PR to `main`; `main` deploys prd.
- Workflows assume the env's deploy role over GitHub OIDC, build, and run `aws lambda update-function-code`.
- The deploy role grants `UpdateFunctionCode` and `GetFunction` on that env's functions only and trusts exactly `repo:sebasfles/take-my-word:environment:{env}`.
- The Lambda module ignores `filename`, `source_code_hash` and `publish`, so Terraform never fights CI over code.
- Terraform is applied only from Sebastian's machine with the `fless-takemyword` profile.

## Depends on

- AWS account `takemyword` (115891590483), created by the organization's account vending outside this repo, with its hosted zone and budget.
- Cloudflare: delegates `takemyword.fless.dev` to the account's Route 53 zone.
- GitHub: repo `sebasfles/take-my-word`, Actions, OIDC.

## Depended on by

- Every module: auth (pool, authorizer attachment), dictation (`dictate`, secret, metrics), dictionary (stream and `dictionary-usage`), styles (`api`, table), desktop and mobile (the API they call).

## Configuration

- AWS profile `fless-takemyword`, login with `aws sso login --sso-session fless`; regions us-east-1 and us-east-2 only.
- Hosted zone `takemyword.fless.dev` (`Z06585121NIUBTW9PNNB1`).
- Lambda environment variables are wired by `stacks/app`; `DEBUG_BUCKET` only while the dev variable `debug_audio` is on.
- `AWS_ROLE_ARN`, `AWS_REGION`, `DICTATE_FUNCTION_NAME` and `AUTHORIZER_FUNCTION_NAME` are written by `stacks/app` into the env's Actions environment, which `core` creates.
- State: S3 bucket `takemyword-terraform-state-115891590483` (versioned, encrypted, public access blocked, created by hand), one key per root, S3 lockfile.
- Apply order on a fresh account: state bucket, `core`, then each env.

## Testing

- `terraform fmt -check -recursive` and `terraform validate` per environment root, in `ci` and in `verify-task`.
- `pnpm e2e` in `apps/api` exercises the deployed dev stack.
