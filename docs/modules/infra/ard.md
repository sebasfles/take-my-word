---
updated: 2026-10-20
source: setup
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

- Decision: Terraform is applied only from Sebastian's machine; `environments/core` creates the GitHub OIDC provider, GitHub App wiring, Actions environments and branch rulesets; `stacks/app` creates one deploy role per env, scoped to that env's Actions environment, allowed only `UpdateFunctionCode` on its functions; workflows run `aws lambda update-function-code`; the Lambda module ignores `filename`, `source_code_hash` and `publish`.
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

- Decision: a single table `take-my-word-{env}` holds every item kind (`USER`, `DICT#term`, `STYLE#id`, `APPRULE#appId`, `DICTATION#ts`); TTL expires dictations after 90 days; its stream feeds the `dictionary-usage` Lambda; no ORM, no migrations.
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
