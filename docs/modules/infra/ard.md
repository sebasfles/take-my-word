---
updated: 2026-10-22
source: 0011_desktop_rebrand
---

# Infra: architecture and debt

## 2026-10-20: Own AWS account, two regions, 5 USD budget

- Decision: the project runs in its own account `takemyword` (115891590483) in the organization, restricted to us-east-1 and us-east-2, with hosted zone `takemyword.fless.dev` and a 5 USD monthly budget alerting at 80% actual and 100% forecast.
- Alternatives rejected: a 10 USD budget and the names `take-my-word` and `take-my-word.fless.dev`, as the original proposal had them.
- Reason: one account per project isolates cost, blast radius and credentials; AWS covers hosting, data, identity and secrets, so no third-party vendor is added.
- Debt created: none.
- Revisit when: monthly spend approaches the budget, or a provider or service needs a region outside the two allowed.
- Source: setup

## 2026-10-20: Infra lives in the one public monorepo

- Decision: Terraform sits in `infra/` of the monorepo `sebasfles/take-my-word`, next to `apps/*` and `packages/shared`, with `.github/workflows` path-filtered per app.
- Alternatives rejected: four repos (docs, platform with api, web and infra, desktop, mobile) as the original proposal laid out; a separate infra repo.
- Reason: one PR per task across api, clients and infra; only the backend and web deploy to AWS, so nothing else needs to share infra.
- Debt created: none.
- Revisit when: a second deployable outside this repo needs the same account.
- Source: setup

## 2026-10-20: Terraform owns infrastructure, CI only swaps Lambda code

- Decision: Terraform is applied only from Sebastian's machine; `environments/core` creates the GitHub OIDC provider, GitHub App wiring, Actions environments and branch rulesets; `stacks/app` creates one deploy role per env, scoped to that env's Actions environment, allowed only to swap code: `UpdateFunctionCode` on its functions, plus the web assets sync and the distribution invalidation; workflows run `aws lambda update-function-code`; the Lambda module ignores `filename`, `source_code_hash` and `publish`.
- Alternatives rejected: Terraform apply in CI; long-lived AWS keys in GitHub secrets.
- Reason: CI can never change or destroy infrastructure, and Terraform and CI never fight over the deployed code; the pattern is already proven on Sebastian's other platforms.
- Debt created: infrastructure changes wait for Sebastian's machine, and nothing flags drift between the Terraform code and the account.
- Revisit when: someone other than Sebastian needs to change infrastructure.
- Source: setup

## 2026-10-20: Serverless backend, `dictate` split from `api`

- Decision: API Gateway HTTP API in front of Lambdas on Node 24, ARM64, bundled with esbuild: `api` (Hono, every CRUD route) and `dictate` (the pipeline, 60 s timeout, more memory); the web runs through OpenNext on Lambda behind CloudFront.
- Alternatives rejected: containers or always-on servers; Vercel for the web.
- Reason: idle cost is near zero for a handful of users; the pipeline needs time and memory the CRUD routes do not, so each gets its own size; AWS already covers web hosting.
- Debt created: none.
- Revisit when: cold starts dominate measured dictation latency.
- Source: setup

## 2026-10-20: One DynamoDB table per env, with stream and TTL

- Decision: a single table `take-my-word-{env}` holds every item kind (`SETTINGS`, `QUOTA#date`, `DICT#term`, `STYLE#id`, `APPRULE#appId`, `DICTATION#ts`); TTL expires dictations after 90 days; its stream feeds the `dictionary-usage` Lambda; no ORM, no migrations.
- Alternatives rejected: one table per item kind; a relational database.
- Reason: every access is by user, so one partition per user serves every read; on-demand DynamoDB stays inside the free tier at this scale.
- Debt created: none.
- Revisit when: a query needs to cross users, such as the evaluation dashboard or admin views.
- Source: setup

## 2026-10-20: Provider keys in one Secrets Manager blob

- Decision: Groq and OpenAI keys live in one secret per env, read by `dictate` and cached per execution environment.
- Alternatives rejected: Lambda environment variables; one secret per provider.
- Reason: keys stay out of Terraform state and Lambda configuration, and one secret costs one secret's fee.
- Debt created: a rotated key reaches warm Lambdas only when their execution environment recycles.
- Revisit when: a key is rotated or leaked.
- Source: setup

## 2026-10-20: No warming and no provisioned concurrency in v1

- Decision: no scheduled warm ping and no provisioned concurrency on `dictate`; latency is only measured per stage.
- Alternatives rejected: provisioned concurrency, which alone would exceed the budget.
- Reason: there is no latency target in v1; it gets set from real numbers.
- Debt created: cold starts land on the user's first dictation after idle time.
- Revisit when: the parked latency work starts, with cold and warm numbers per provider.
- Source: setup

## 2026-10-21: Terraform state in a hand-made S3 bucket, applied through one wrapper

- Decision: every root keeps its state in `takemyword-terraform-state-115891590483` under its own key, locked with the S3 lockfile; the bucket is created by hand outside Terraform; `infra/scripts/tf` passes the GitHub App pem from `.env` and the account profile; a fresh account applies the bucket, `core`, then each env.
- Alternatives rejected: a DynamoDB lock table; a Terraform-managed state bucket; a tfvars copy of the pem.
- Reason: the state bucket cannot hold its own state, the S3 lockfile needs no extra resource, and the pem never lands on disk outside `.env`.
- Debt created: none.
- Revisit when: someone other than Sebastian applies infrastructure.
- Source: 0001_platform_skeleton

## 2026-10-21: The API answers on `api.` of each environment's host

- Decision: the HTTP API serves `api.dev.takemyword.fless.dev` and `api.takemyword.fless.dev` with a regional ACM certificate and a Route 53 alias; the execute-api endpoint is disabled; the stage throttles at 10 requests per second with a burst of 20; `core` creates the Actions environments and `stacks/app` writes their variables.
- Alternatives rejected: the default execute-api address.
- Reason: clients bake in a stable address, and a disabled default endpoint leaves one way in.
- Debt created: none.
- Revisit when: the web needs the API under its own origin.
- Source: 0001_platform_skeleton

## 2026-10-21: Each deploy job runs only for the side of the monorepo the push touched

- Decision: `deploy-dev` and `deploy-prd` first run `reusable-changes`, which diffs the push against its previous head; the api job runs for `apps/api`, the web job for `apps/web` and `packages/cognito`, and both for `packages/shared`, the workflows, `package.json`, `pnpm-lock.yaml` and `pnpm-workspace.yaml`; a push with no previous head deploys both; the promotion PR waits for both jobs and opens unless one failed.
- Alternatives rejected: workflow-level `paths`, which cannot tell the jobs apart; a third-party paths-filter action.
- Reason: an api-only merge must not redeploy the web and the reverse, with no action outside GitHub's own.
- Debt created: none.
- Revisit when: a third deployable joins the workflows.
- Source: 0004_web_landing

## 2026-10-21: The web deploy keeps pnpm's symlinks and never deletes assets

- Decision: the server function is zipped with `zip -y`; `/_next/static/*` is synced before the code swap and the rest after it, with no `--delete`.
- Alternatives rejected: `zip -r`, which follows the links (seen on dev: `Cannot find module '@swc/helpers/...'` at init); syncing everything after the swap; `--delete`, which removes chunks an open page still loads.
- Reason: OpenNext's output keeps pnpm's symlinked `node_modules`, which resolve only as links; new HTML must never reference a chunk that is not in the bucket yet.
- Debt created: chunks of old builds stay in the web bucket forever.
- Revisit when: the bucket's size shows on the bill, then add a lifecycle rule on `_next/static/` older than a few weeks.
- Source: 0004_web_landing

## 2026-10-21: CloudFront sets the web's security headers, with a framing-only CSP

- Decision: one response headers policy on every behavior sets HSTS (2 years, subdomains), `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` and a CSP limited to `frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`.
- Alternatives rejected: headers from Next.js, which the bucket behaviors would not carry; a full `script-src` policy, which Next's inline scripts would need nonces for.
- Reason: one place covers server and bucket responses, and the default behavior's caching stays disabled so no per-user or per-language page is ever cached.
- Debt created: no `script-src` restriction.
- Revisit when: the web renders content a user did not write, or adds third-party scripts.
- Source: 0004_web_landing

## 2026-10-21: The desktop updater key lives in repository Actions secrets

- Decision: the minisign key that signs desktop updates is two repository Actions secrets, set by hand with `gh secret set` from stdin and read only by `desktop-release`, which runs with no AWS role.
- Alternatives rejected: environment secrets, since releases are not per env; AWS Secrets Manager, which would give a release job AWS access for no gain.
- Reason: the key is only needed where GitHub builds the release, and keeping AWS out of that job keeps its blast radius to the repository.
- Debt created: the secrets sit outside Terraform, and the key has no rotation path, because installed apps trust only the public key they shipped with.
- Revisit when: the key leaks or must change, or the repository gains other maintainers.
- Source: 0005_desktop_release

## 2026-10-22: The web loads the brand fonts through next/font

- Decision: `apps/web` loads the brand's woff2 files with `next/font/local`, which serves them from `/_next/static`, preloads them through `Link` response headers and sets `--font-face-display` and `--font-face-text`; the brand tokens read those variables first, and the desktop keeps the brand's own `@font-face`.
- Alternatives rejected: the brand's `@font-face` in the web too, discovered only after the CSS; copying fonts to `/static/`, which the plan reserves for fixed URLs.
- Reason: without preload the swap moved the hero by a line on mobile (CLS 0.112); preloaded, Lighthouse measured CLS 0.000.
- Debt created: two font-loading paths for one set of files.
- Revisit when: the desktop needs preloading, or Next changes how `next/font/local` resolves files outside the app.
- Source: 0010_brand_web

## 2026-10-22: Brand assets are copied into the web's static folder, guarded by a test

- Decision: `pnpm --filter @take-my-word/web static` copies the favicons, PWA icons and OG card from `packages/brand/src/assets` into `apps/web/public/static`; a unit test fails if the copies differ from the brand's or anything else is there.
- Alternatives rejected: generating them inside the web build; serving them from `/_next/static`, whose hashed URLs cannot back favicons and social cards.
- Reason: these files need fixed URLs, and the brand stays their only source.
- Debt created: `desktop-ci` does not watch `packages/brand/` yet.
- Resolved by: 0011_desktop_rebrand, 2026-10-22
- Revisit when: 0011 makes the desktop consume the brand package.
- Source: 0010_brand_web

