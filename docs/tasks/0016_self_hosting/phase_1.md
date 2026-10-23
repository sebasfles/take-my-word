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

### Round 1

Done:

- `deployment.json` (gitignored) at the repo root, validated by a zod schema in the new package `packages/deployment`; `deployment.example.json` carries every key, and `deployment.schema.json`, generated from the zod schema (`pnpm --filter @take-my-word/deployment schema`, guarded by a test), documents each key for editors.
- `pnpm tf <core|dev|prd> <args>` replaces `infra/scripts/tf`: profile from the config, variables as `TF_VAR_*`, backend through a generated `.terraform/deployment.tfbackend` passed with `TF_CLI_ARGS_init`, `GITHUB_APP_PEM` from `.env` only with a `github` section.
- Terraform: every root takes `deployment`, `aws_account_id`, `aws_region`, plus `domain` and `hosted_zone` (dev and prd) and `github` (required in core, nullable in dev and prd); backends are partial; hosts derive from `domain` (`dev.<domain>`, `api.<web host>`); the stack's name prefix is `<deployment>-<env>`, default unchanged.
- No `github`: no OIDC data source, no GitHub data sources, no deploy role, no Actions variables; `moved` blocks keep `aws_iam_role.deploy` and `aws_iam_role_policy.deploy` at `[0]`; the github provider is configured with a dynamic `app_auth` (checked with a local plan: no credentials needed without CI).
- The web certificate comes from an `aws.us_east_1` provider alias passed to the stack, so any region works.
- `pnpm deploy:api` and `pnpm deploy:web` (`packages/deployment/src/deploy.ts`) build and swap code exactly as the YAML did; `reusable-deploy*` now only assume the role and call them; `packages/deployment/` joined the deploy triggers and `desktop-ci` paths.
- Discovery: `discoverySchema` in `packages/shared` (version 1, `https://<hostname>` API, region and ids by pattern, pool region must equal region); the web serves `/.well-known/take-my-word.json` from `API_URL`, `USER_POOL_ID`, `USER_POOL_CLIENT_ID`, region from the pool id, so no Lambda env changes; verified on a local `next build` plus `next start`.
- Web: release links come from `RELEASES_REPOSITORY`, inlined at build by `next.config`; a build without it fails; CI passes `github.repository`. e2e and integration read `WEB_URL` from `.env`.
- OG card: domain line dropped (D3), assets regenerated and copied.
- Desktop: the official server is the discovery document in `TAKE_MY_WORD_SERVER` at build time (`option_env!`, parsed with serde, version checked); a build without it refuses to start. `node scripts/tauri.ts <dev|prd> <tauri args>` (behind `tauri:build:*`, `tauri:dev` and `desktop-release`'s `tauriScript`) takes the server, updater key and releases repository from env or `deployment.json`, validates them and adds the updater pubkey and endpoint as a `--config` overlay; `tauri.prd.conf.json` no longer has them. `release-check` takes `--pubkey`. `discovery` joined the Rust contract check. SRP vectors regenerated with a fake pool id through `packages/cognito`'s `srp.ts`. `windows.sh` mirrors `deployment.json`.
- `git grep` of the account id, domain, owner, profile, zone id, App ids, pool and client ids, state bucket and updater key: hits only in `docs/` (scrubbed by the docs pass) and the desktop identifier exception.

Actions variables the om-manager must set before merge (repository level; the environment ones stay Terraform's):

- `DESKTOP_DEV_SERVER`: the dev discovery JSON, `{"version":1,"apiUrl":"https://api.dev.<domain>","region":"us-east-1","userPoolId":"<dev pool>","clientId":"<dev native client>"}` (read by `desktop-ci`).
- `DESKTOP_PRD_SERVER`: the same for prd (read by `desktop-release`).
- `DESKTOP_UPDATER_PUBKEY`: the current `pubkey` of `tauri.prd.conf.json` on develop (read by `desktop-release` and its release check).
- Releases repository and updater endpoint come from `github.repository`; no variable.

Pending:

- Acceptance 2: `terraform plan` on core, dev and prd after the rebase on 0015, once SSO is back; the wrapper reached the backend and stopped at the expired token. The main clone's `.terraform` dirs may need `pnpm tf <root> init -reconfigure` once.
- Desktop `rust:lint` and `rust:test` on the Windows host (held by 0015); `cargo test` passed in the Linux container.
- Web `pnpm integration` and `pnpm e2e` (dev held, SSO expired); both now need `WEB_URL` in `.env`.
- The main clone's `deployment.json` (the workspace has one with the official values).

Decisions not in the plan:

- JSON config plus a generated JSON Schema instead of a commented format: no parser dependency, and editors show each key's description.
- One new workspace package, `packages/deployment`, holds config, Terraform wrapper and deploy scripts, so phase 2's `pnpm selfhost` reuses them and they get lint, typecheck and tests.
- The web's releases repository is a build-time value, not a Lambda variable, so the plans stay empty.
- Desktop server values are one JSON variable per build (the discovery shape), not four, so the same schema validates config, CI and discovery.

Deferred:

- `pnpm screenshots` in `apps/web` needs a build made with `RELEASES_REPOSITORY`; worth a line in the web TRD at the docs pass.

### Round 2

Done, one per finding:

1. `deploy.ts` runs `<api|web> <build|swap>`: build makes the bundles, or the OpenNext output plus `apps/web/.open-next/server-function.zip`, with no AWS call; swap only uploads, swaps, waits and invalidates. `reusable-deploy*` build before `configure-aws-credentials` and swap after; the step tests assert that no build step calls AWS and no swap step builds.
2. The web e2e compares the installer link with `releaseLinks(RELEASES_REPOSITORY).windowsInstaller`; `.env` now needs `WEB_URL` and `RELEASES_REPOSITORY` for `pnpm integration` and `pnpm e2e`.
3. `tauriOverlay` is exported from `scripts/tauri.ts` and its exact shape is tested (prd `plugins.updater.pubkey` and `endpoints`, dev `{}`); `updater.rs` reads only the committed configs (updater only in prd, `requireSignedVersion`, `createUpdaterArtifacts`).
4. The verify.log block of this round names the round's commit; it is appended after that commit and travels in the next one, since a commit cannot name itself.

Still pending before phase 1 closes: Windows `rust:lint` and `rust:test`, web `integration` and `e2e`, and the core, dev and prd plans after the rebase on 0015 and the SSO login.

## Result
