---
phase: 1
branch: feat/0016_self_hosting
updated: 2026-10-23
---

# Phase 1: Deployment config and reusable infrastructure

## Scope

- One gitignored deployment config file plus a committed example that documents every key; GitHub Actions variables carry the same values for CI.
- Terraform takes every per-deployment value through variables and a generated backend config: account, region, profile, domain and hosted zone, state bucket, deployment name (resource prefix, default keeps today's names), GitHub owner, repo and App ids.
- CI is optional: core, the deploy roles, the GitHub data sources and the Actions variables exist only when the config has a `github` section; `moved` blocks keep the official addresses.
- A region other than us-east-1 works: CloudFront's certificate still comes from us-east-1.
- The deploy steps leave the workflow YAML for scripts that CI and the setup command (phase 2) both call.
- Official values leave web, desktop, scripts and tests: release URLs, updater key and endpoint, API URLs, pool and client ids, e2e URLs, the OG card's domain line; the desktop and the release build read them at build time and fail without them.
- Discovery: `https://<domain>/.well-known/take-my-word.json` served by the web from the env it already has, its zod schema in `packages/shared`, versioned.

## Acceptance

1. `git grep` for the official account id, domain, GitHub owner and SSO profile returns only `docs/tasks/` hits and the desktop identifier (the one documented exception); docs outside `docs/tasks/` are scrubbed by the docs pass at the end of the task.
2. After the rebase on 0015 and its apply, `terraform plan` on core, dev and prd shows 0 to add, 0 to change, 0 to destroy, with moves only, listed with the plan output in `om-developer notes`.
3. Lint, typecheck and unit tests pass on a fresh clone with no deployment config.
4. The list of repository and environment Actions variables the om-manager must set before merge is written in `om-developer notes`.
5. The discovery route answers the schema for dev and prd values and is covered by tests.

## om-developer notes

## Result
