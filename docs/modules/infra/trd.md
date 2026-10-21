---
updated: 2026-10-20
source: setup
---

# Infra: technical

Planned; no code yet, phase 1 builds the Terraform environments, the dev and prd stacks and the deploy workflows.

## Structure

| Path | What |
|---|---|
| `infra/environments/core` | Applied once per account: GitHub OIDC provider, GitHub App wiring, Actions environments `dev` and `prd`, branch rulesets. |
| `infra/environments/dev`, `infra/environments/prd` | One Terraform root per env, each instantiating `stacks/app` with its own variables. |
| `infra/stacks/app` | Everything one env runs, plus the per-env deploy role scoped to that env's Actions environment. |
| `infra/modules/aws/*` | Reusable modules: `lambda`, `http_api`, `cognito`, `dynamodb`, `s3`, `cloudfront`, `acm`, `secrets`. |
| `.github/workflows` | Path-filtered per app: build and deploy `api` and `web`, open the promotion PR; desktop releases on `desktop-v*` tags and mobile builds through EAS are described in their modules. |

## Resources per env

| Resource | Purpose |
|---|---|
| API Gateway HTTP API | Fronts every route; the auth module's Lambda authorizer is attached to it. |
| Lambda `api` | Hono, every CRUD route; Node 24, ARM64, bundled with esbuild. |
| Lambda `dictate` | `POST /dictations`; 60 s timeout and more memory than `api`. |
| Lambda `dictionary-usage` | Consumer of the table's DynamoDB Stream (dictionary module). |
| DynamoDB `take-my-word-{env}` | The single table, with TTL and a stream enabled. |
| Cognito user pool | Configured by the auth module, created here. |
| Secrets Manager blob | Groq and OpenAI keys in one secret, read by `dictate`. |
| S3 debug bucket | Dev only, optional raw audio for debugging, one-day lifecycle. |
| Web hosting | `apps/web` through OpenNext on Lambda behind CloudFront. |
| Route 53 records | `takemyword.fless.dev` for prd, `dev.takemyword.fless.dev` for dev; the API hostname is set in phase 1. |
| CloudWatch | Structured logs and metrics per provider (latency, tokens). |

## Endpoints owned

None; infra hosts every route and owns no business endpoint.
Jobs, listeners or scheduled work: none.

## Delivery

- `develop` deploys dev and the dev deploy opens the promotion PR to `main`; `main` deploys prd.
- Workflows assume the env's deploy role over GitHub OIDC, build, and run `aws lambda update-function-code`.
- The deploy role grants `UpdateFunctionCode` on that env's functions only.
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
- Lambda environment variables (table name, secret id, quota, debug bucket) are wired by `stacks/app`.
- Deploy role ARN and function names reach the workflows as Actions environment variables.
- Terraform state backend is chosen in phase 1.

## Testing

- `terraform fmt -check` and `terraform validate` per environment root.
- Phase 1 acceptance: a curl to `POST /dictations` in dev with a Cognito token.
