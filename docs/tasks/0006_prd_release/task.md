---
id: "0006"
title: prd_release
type: chore
crew: devops
clearance: full
branch: chore/0006_prd_release
modules: [infra, auth]
repos: ["."]
phases: 0
depends_on: ["0001", "0003", "0004"]
ticket:
created: 2026-10-21
updated: 2026-10-21
---

# 0006 Production environment and first promotion

## Goal

Production exists: `takemyword.fless.dev` serves the landing, `api.takemyword.fless.dev` serves the API, Sebastian has a production account, and `main` deploys to it.
Until now every task applied `dev` and only planned `prd`; this task applies `prd` and lets the promotion PR merge.

## Scope

- Apply `infra/environments/prd` with the `fless-takemyword` profile: HTTP API with `api.takemyword.fless.dev`, Lambdas `dictate`, `authorizer`, `api`, `dictionary-usage`, web function, assets bucket, CloudFront with `takemyword.fless.dev`, Cognito pool and client, table, secrets, deploy role, Actions environment `prd` with its variables.
- Write the provider keys into `take-my-word-prd/providers` from the root `.env` (same keys as dev, never printed) and the web cookie key into `take-my-word-prd/web`.
- Create Sebastian's production user `sebastian` (email `fles.sebas26@gmail.com`) with a temporary password stored in the root `.env` as `SEBASTIAN_PRD_TEMP_PASSWORD`; he sets his own on first web sign-in. No e2e user in prd.
- Push the current `develop` code to prd functions and assets once, the same way `reusable-deploy` does, so prd answers before the first `deploy-prd` run.
- Report to the om-manager when prd is applied and verified; the om-manager merges the promotion PR (#2 or its successor) and checks `deploy-prd`.
- Any Terraform drift or fix needed for prd (variables, names, limits) goes in this task's branch and PR; `dev` must still plan clean afterwards.
- Docs: infra module docs updated with the prd facts via `document-task`; `docs/TRD.md` environments section if anything changes.

## Out of scope

- Any application code change; a prd-only bug in code becomes a task.
- Monitoring dashboards beyond what exists; budget alarms already exist in the account.
- Google sign-in, custom Cognito domain.

## Acceptance

1. `terraform apply` of `prd` succeeds from a fresh init; `terraform plan` of `dev` and `prd` afterwards shows no changes.
2. `https://takemyword.fless.dev` serves the landing over HTTPS; `https://api.takemyword.fless.dev/dictations` answers 401 without a token.
3. Sebastian's prd user exists; a sign-in on the prd web with the temporary password reaches the "choose your password" step (verified by the crew up to that step, without completing it).
4. The `prd` Actions environment holds the deploy variables written by Terraform, and the deploy role trust matches the repo's immutable OIDC subject for `environment:prd`.
5. After the om-manager merges the promotion PR, `deploy-prd` is green and prd serves the merged commit.
6. The task's PR (Terraform fixes and docs only, possibly tiny) has `ci` green.

## Approach

- Same stack as dev through `stacks/app`; prd differences are only names, domain and the absence of the debug bucket.
- Secrets are written with `put-secret-value` fed from stdin, never from command-line arguments.
- The first code push to prd mirrors `reusable-deploy.yml` step by step from this machine, so the only thing `deploy-prd` has left to prove is OIDC.

## Database

None new; the prd table is created empty.

## Infra

Everything in Scope, in account `takemyword` 115891590483, us-east-1, with the `fless-takemyword` SSO profile.

## Design

None.

## Risks

- ACM validation and CloudFront on first apply take minutes.
- prd was never applied: variables or outputs that dev tolerated may be missing; fix in Terraform, not by hand in the console.
- Budget: prd adds a second set of Lambdas and a distribution; still inside the free tier at this usage.

## Depends on

0001, 0003, 0004 (all merged). Runs alongside 0002.

## Context & decisions

Baseline at consolidation (2026-10-21): prd plans 107 to add, 0 to change, 0 to destroy; dev plans no changes; PR #2 open, `ci` green, head `24cbc0a`; `main` at `8114686`.

Decisions:

- `SEBASTIAN_PRD_TEMP_PASSWORD` is appended to the root checkout `.env` and to the workspace `.env`; nothing else in the main checkout is touched (om-manager, as in 0003).
- The temporary password expires 7 days after creation (`infra/modules/aws/cognito`, `temporary_password_validity_days`); the user is created right before verification and the om-manager tells Sebastian (om-manager).
- Sequence: apply and verify Acceptance 1 to 4, send `prd applied and verified`, wait for `promotion merged, deploy-prd <result>`, fix a red run in this branch, verify Acceptance 5, then `document-task` and `publish-task` (om-manager).
- A shared `stacks/app` fix that changes dev is applied to dev only when its plan is in-place updates with no replace or destroy; anything else is a `blocker` (om-manager).
- prd `COOKIE_KEY` is a new random 32-byte key, never dev's; dev and prd share no secret (`docs/modules/infra/database.md`) (om-devops).
- Provider keys are read from the workspace `.env`, whose values match the root `.env` by hash; both secrets are written with `put-secret-value` fed from stdin, and checked only for non-empty keys, never printed (om-devops).
- `sebastian` is created with `AdminCreateUser`, `--message-action SUPPRESS`, `email` and `email_verified=true`, like the dev throwaway users of 0004 (om-devops).
- Acceptance 3 is checked with headless Playwright on `https://takemyword.fless.dev` up to the new-password step, without submitting it; a screenshot stays in the workspace (om-devops).
- Acceptance 4 is checked by a clean prd plan (the provider refreshes every Actions variable) and by comparing the deploy role trust with the subject built from the GitHub user and repo ids; `gh` gets 403 listing environment variables (om-devops).
- Acceptance 5 is checked by the `deploy-prd` run's head SHA against the merge commit and its printed `CodeSha256` against `lambda get-function`, plus the web's build id (om-devops).
- The first code push builds `24cbc0a` with Node 24 (`.nvmrc`; local default is 22) and mirrors `reusable-deploy.yml` and `reusable-deploy-web.yml` step by step, `zip -y` included, with the SSO profile (om-devops).
- Acceptance 1 "fresh init": the prd `.terraform` left by the consolidation plan is removed before the apply's init (om-devops).

Constraints:

- CI only swaps code; the Lambda module ignores code fields (`docs/modules/infra/ard.md`, Terraform owns infrastructure).
- prd has no debug bucket and no audio anywhere (`docs/modules/infra/database.md`).
- Assets are synced `_next/static` first, rest after the code swap, never `--delete` (`docs/modules/infra/ard.md`, web deploy).
- No hand fixes in the console; any prd gap is fixed in Terraform on this branch (task.md#Risks).

Notes:

- prd adds two secrets (about 0.80 USD a month) and PITR on an empty table; still well inside the 5 USD budget, not strictly free tier as Risks says.
- prd dictation stays unexercised end to end until Sebastian sets his password; no e2e user in prd by Scope.

clearance: full; account `takemyword` 115891590483, us-east-1, profile `fless-takemyword`: apply `prd` (and `dev` only for in-place fixes), prd secrets, prd Cognito user `sebastian`, prd functions and assets, the `prd` Actions environment through Terraform.

## om-developer notes

### Round 1 (2026-10-21)

Done: prd applied from a fresh init with no Terraform change; secrets, user and first code push done; Acceptance 1 to 4 verified.
Pending: Acceptance 5 after the promotion merge, then `document-task` and `publish-task`.

| Command | Target | Environment | Result |
|---|---|---|---|
| `infra/scripts/tf prd init`, `plan -out`, `apply` of the read plan | `environments/prd` | prd | 107 added, 0 changed, 0 destroyed |
| `secretsmanager put-secret-value` from stdin | `take-my-word-prd/providers` | prd | `GROQ_API_KEY` and `OPENAI_API_KEY` from `.env`, non-empty, never printed |
| `secretsmanager put-secret-value` from stdin | `take-my-word-prd/web` | prd | new random 32-byte `COOKIE_KEY`, never printed |
| `cognito-idp admin-create-user` (SUPPRESS, `email`, `email_verified`) through a 0600 temp file, deleted after | `sebastian` in `us-east-1_uekLYxWNc` | prd | FORCE_CHANGE_PASSWORD; `SEBASTIAN_PRD_TEMP_PASSWORD` in workspace and root `.env`, never printed |
| `lambda update-function-code` and `wait function-updated-v2`, built from `be53ebc` (code of `24cbc0a`) with Node 24 | authorizer, dictate, api, dictionary-usage, web | prd | updated; web zipped with `zip -qry` |
| `s3 sync` `_next/static` (immutable), then the rest (5 min), no `--delete` | `take-my-word-prd-web-assets-115891590483` | prd | 15 then 2 objects |
| `cloudfront create-invalidation /*` | `E3OQ3ZCL4AAMGV` | prd | created |
| `terraform plan -detailed-exitcode` | `prd`, then `dev` | prd, dev | No changes, both |

Checks:

- Acceptance 2: `/`, `/sign-in`, a `_next/static` chunk and `/static/icon.svg` answer 200 over HTTPS with HSTS, `X-Frame-Options: DENY` and the CSP; the page carries build id `7kDenRoZGWxKxa3gtv--m`; `GET https://api.takemyword.fless.dev/dictations` answers 401 `Unauthorized`.
- Acceptance 3: headless Chromium on `https://takemyword.fless.dev/sign-in` with `sebastian` and the temporary password reaches "Elige tu contraseña", not submitted; user still FORCE_CHANGE_PASSWORD; screenshot `screenshots/prd-new-password-1280.png` in the workspace.
- Acceptance 4: the nine Actions variables are in prd state and refreshed by a clean plan; the deploy role trusts exactly `repo:sebasfles@64487774/take-my-word@1427740478:environment:prd`, which matches the repo's immutable OIDC subject prefix.
- The first `admin-create-user` attempt fed `--cli-input-json` from stdin and was rejected as invalid JSON before any user existed; the password lines it had already written were reused.
- Acceptance 5: PR #2 merged into `main` as `ce96a1d`; `deploy-prd` run 39552600810 on `ce96a1d` succeeded (changes, api, web); the `CodeSha256` its jobs printed for the five prd functions equal `lambda get-function`; the page now carries the CI build `HmpAQSAeAwKfZ-bP4EDG8` instead of the local `7kDenRoZGWxKxa3gtv--m`, its chunks answer 200, the API still 401.
- Docs: infra `trd.md` (prd applied and how a new env gets its first code) and `database.md` (prd table), auth `trd.md` (prd pool); no ARD entry, every decision is in Approach or Context & decisions; `docs/TRD.md` environments section still holds, but its intro "Nothing is built yet" is stale and belongs to the om-manager.
- No round commit: the round changed no code or Terraform, only this task's notes and the docs commit.
