---
updated: 2026-10-21
source: 0005_desktop_release
---

# Infra: technical

`core`, `dev` and `prd` are applied; prd serves `takemyword.fless.dev` and `api.takemyword.fless.dev` since 0006, and `main` deploys it.

## Structure

| Path | What |
|---|---|
| `infra/environments/core` | Applied once per account: GitHub OIDC provider, GitHub App wiring, Actions environments `dev` and `prd`, branch rulesets. |
| `infra/environments/dev`, `infra/environments/prd` | One Terraform root per env, each instantiating `stacks/app` with its own variables. |
| `infra/stacks/app` | Everything one env runs, plus the per-env deploy role scoped to that env's Actions environment. |
| `infra/modules/aws/*` | Reusable modules: `lambda` (IAM statements may carry conditions, optional `AWS_IAM` Function URL), `http_api`, `cognito`, `dynamodb`, `acm`, `secrets`, `s3` (private bucket), `cloudfront` (distribution with OAC to a bucket and a Function URL, security headers policy, alias records). |
| `infra/scripts/tf` | `infra/scripts/tf <env> <terraform args>` (`core`, `dev` or `prd`): feeds `GITHUB_APP_PEM` from `.env` as `TF_VAR_github_app_pem` and uses the `fless-takemyword` profile. |
| `.github/workflows` | `ci` (no path filter, also runs the OpenNext build); `deploy-dev` and `deploy-prd` run `reusable-changes`, then `reusable-deploy` (api) and `reusable-deploy-web` only for the side the push touched; `desktop-release` builds and publishes the desktop on `desktop-v*` tags with no AWS access (desktop module); mobile release paths live in its module. |

## Resources per env

| Resource | Purpose |
|---|---|
| API Gateway HTTP API | Fronts every route at `api.dev.takemyword.fless.dev` and `api.takemyword.fless.dev` (execute-api endpoint off, 10 requests per second, burst 20); the authorizer is attached; integrations time out at 30 s. |
| Lambda `api` | Hono, every CRUD route (dictionary, styles, app rules, settings, history); 512 MB, 15 s; Node 24, ARM64, bundled with esbuild. |
| Lambda `dictate` | `POST /dictations`; 60 s timeout and more memory than `api`. |
| Lambda `dictionary-usage` | Consumer of the table's DynamoDB Stream through an event source mapping filtered to inserts of `DICTATION#`, batch 10, retry 2, bisect, batch item failures (dictionary module). |
| DynamoDB `take-my-word-{env}` | The single table, with TTL and a stream enabled. |
| Cognito user pool | Configured by the auth module, created here. |
| Secrets Manager blob | Groq and OpenAI keys in one secret, read by `dictate`; `take-my-word-{env}/web` holds the web's `COOKIE_KEY`. |
| S3 debug bucket | Dev only, optional raw audio for debugging, one-day lifecycle. |
| Web hosting | Lambda `web` (OpenNext server, 512 MB, 30 s) behind an `AWS_IAM` Function URL, the private bucket `take-my-word-{env}-web-assets-{account}` for `/_next/static/*` and `/static/*`, and one CloudFront distribution with OAC to both, caching disabled for the server and a headers policy (HSTS, nosniff, `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`); its us-east-1 certificate validates in the hosted zone. |
| Route 53 records | `takemyword.fless.dev` for prd and `dev.takemyword.fless.dev` for dev (A and AAAA to CloudFront), and an `api.` alias in front of each, each with its ACM certificate. |
| CloudWatch | Structured logs and EMF metrics per provider; every log group keeps 30 days. |

## Endpoints owned

None; infra hosts every route and owns no business endpoint.
Jobs, listeners or scheduled work: none.

## Delivery

- `develop` deploys dev and the dev deploy opens the promotion PR to `main`; `main` deploys prd.
- Workflows assume the env's deploy role over GitHub OIDC, build, and run `aws lambda update-function-code`; the web job also syncs the assets bucket and invalidates the CloudFront distribution.
- The web job uploads `/_next/static/*` (immutable, one year) before swapping the function code, then the rest of the assets (5 minutes), then invalidates the distribution; the server zip keeps pnpm's symlinks (`zip -y`).
- The deploy role grants `UpdateFunctionCode` and `GetFunction` on that env's functions only, `s3:ListBucket` and `s3:PutObject` on the web bucket and `cloudfront:CreateInvalidation` on the web distribution, and trusts exactly the repository's immutable subject, `repo:sebasfles@64487774/take-my-word@1427740478:environment:{env}`, built from the GitHub user and repository ids.
- The Lambda module ignores `filename`, `source_code_hash` and `publish`, so Terraform never fights CI over code.
- Terraform is applied only from Sebastian's machine with the `fless-takemyword` profile.
- `desktop-release` is the only workflow with `contents: write` and the only one that sees the updater signing key; it assumes no AWS role.

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
- `AWS_ROLE_ARN`, `AWS_REGION`, `DICTATE_FUNCTION_NAME`, `AUTHORIZER_FUNCTION_NAME`, `API_FUNCTION_NAME`, `DICTIONARY_USAGE_FUNCTION_NAME`, `WEB_FUNCTION_NAME`, `WEB_ASSETS_BUCKET` and `WEB_DISTRIBUTION_ID` are written by `stacks/app` into the env's Actions environment, which `core` creates.
- Repository Actions secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (the updater key, minisign, password-protected) are set by hand with `gh secret set` from stdin, outside Terraform; the values also sit in the root `.env` and Sebastian's password manager, and the public half in `apps/desktop/src-tauri/tauri.prd.conf.json`.
  Rotating the key strands installed apps, which only trust the old public key.
- State: S3 bucket `takemyword-terraform-state-115891590483` (versioned, encrypted, public access blocked, created by hand), one key per root, S3 lockfile.
- Apply order on a fresh account: state bucket, `core`, then each env.
- A newly applied env answers `not deployed` (503) until code reaches it: write its two secrets from `.env` and a fresh `COOKIE_KEY` (stdin, never arguments), then push the code once by hand in `reusable-deploy` order, or let the next deploy run do it.

## Testing

- `terraform fmt -check -recursive` and `terraform validate` per environment root, in `ci` and in `verify-task`.
- `pnpm e2e` in `apps/api` and in `apps/web` exercise the deployed dev stack.
