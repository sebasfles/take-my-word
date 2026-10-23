---
phase: 2
branch: feat/0016_self_hosting
updated: 2026-10-23
---

# Phase 2: Run your own, and the desktop's own server

## Scope

- `pnpm selfhost`, idempotent: asks profile, region, domain (zone apex or a subdomain inside a Route 53 zone of the account), Groq and OpenAI keys, environments (prd by default, dev optional); creates the state bucket, applies Terraform, writes the secrets, builds and uploads the Lambdas and the web, creates the first user and prints the URLs and its temporary password.
- Update by re-running it; a documented removal step that deletes everything the setup created, its own state bucket included, and nothing else.
- `self-host/README.md` (prerequisites, steps, update, removal, real dated cost) and `self-host/skill/SKILL.md` with how to install it into `.claude/skills/`.
- Desktop: "Use your own server" as a small secondary link on the sign-in step, in the prd and dev apps; domain, discovery, validation, stored with the session; sign-out offers the return to the official server; updates stay on the official releases.
- The scratch run: official account, us-east-2, a scratch subdomain in the official zone, its own deployment name and state bucket, prd only, no CI.

## Acceptance

1. From a fresh clone, following only `self-host/README.md` with the skill, the scratch deployment ends with a working web sign-in and a dictation from a local prd build of the branch through "Use your own server"; the run is logged in `om-developer notes`.
2. The removal step leaves nothing of the scratch deployment: resources by name and tag, records in the zone, certificates, log groups, secrets (no pending deletion), state bucket.
3. A second run of `pnpm selfhost` on the live scratch deployment changes nothing and succeeds.
4. Desktop screenshots of the link and the server step, es and en, light and dark, at the 0014 sizes.
5. No secret reaches the repo, tfvars, the shell history, process arguments or the logs.

## om-developer notes

### Round 1

Done:

- Phase 1 carry-over: Windows `rust:lint` failed on `cargo fmt` in `auth/mod.rs` (a Windows-only test line); fixed, then Windows `rust:lint` and `rust:test` green at afe949f (208 passed, 9 ignored).
- `pnpm selfhost` in `packages/deployment/src/selfhost.ts`, with `aws.ts` (SDK helpers) and `prompt.ts` (hidden input):
  - asks profile, region, domain, deployment name, dev or not, releases repository (default: the clone's origin) and the two keys, hidden; checks the account through STS and finds the most specific public zone holding the domain;
  - `--yes` runs from `deployment.json` and reads the keys from `.env`; `--plan` stops after the plan; `--user` names the first user (default `admin`);
  - creates the state bucket (versioned, encrypted, public access blocked, tagged `Project` and `ManagedBy=pnpm selfhost`), then per env init, plan with `-detailed-exitcode`, apply only when there are changes (asking in a terminal);
  - writes the provider keys and a generated `COOKIE_KEY` through the SDK only when they differ; builds once and swaps per env with phase 1's deploy steps; records the deployed commit in `selfhost/deployed.json` of the assets bucket, so a re-run on a clean tree at the same commit with no infra change deploys nothing;
  - creates the first user with a generated temporary password (`AdminCreateUser`, suppressed message) only in a pool with no users, and waits until `/.well-known/take-my-word.json` answers with the deployment's own values;
  - refuses any config with a `github` section, so the official deployment is never touched by it.
- `pnpm selfhost remove`: asks to type the domain (or `--yes`), skips envs whose state is empty (a second removal never recreates anything), applies `removal=true` only on the table, pool and the two secrets, destroys, deletes the state bucket when the setup created it (tags) or only this deployment's state keys otherwise, then polls leftovers for up to 10 minutes: tagged resources in the region and us-east-1, IAM roles, secrets including pending deletion, log groups, A/AAAA and ACM validation records of the deployment's hosts, the state bucket.
- prd root: `variable "removal"` (default false) drives `deletion_protection` and the secret recovery window; with the default the values are unchanged (true, 7).
- `self-host/README.md` (cost checked on the provider pages 2026-10-23, prerequisites, both paths, sign-in, update, removal, what it creates, failures) and `self-host/skill/SKILL.md` (install: copy to `.claude/skills/self-host`); the skill never sees the keys, runs `--plan` and waits for agreement before `--yes`.
- Desktop: `server.rs` holds `Server` (moved from `env.rs`), validation at parity with `discoverySchema`, domain normalization (trim, lower case, optional `https://` and one trailing slash; anything else refused) and discovery (HTTPS, no redirects, 16 KiB cap, 15 s timeout).
  Parity is enforced by `src-tauri/src/discovery_vectors.json`: 10 accepted and 44 refused documents, checked against `discoverySchema` by vitest (`contract/discovery.test.ts`) and against the Rust validator by cargo.
  The official server from the build goes through the same validation.
- Desktop server switch: `use_server` and `use_official_server` commands; `Account::while_signed_out` swaps the Cognito client and the API base URL (shared by every clone of the API) under the session lock and drops a pending new-password step; refused while signed in.
  The choice lives in `settings.json` as `server` (domain plus discovery), re-validated at start (an invalid one falls back to the official server); a 0.2.0 file has none and reads as the official server.
- UI: "Use your own server" as a small text link under the sign-in button, a domain step with Back and Continue and error messages per cause (domain, unreachable, not Take My Word, newer version, still signed in), the chosen domain with "Use the official server" on the sign-in step, and "Server: <domain>" in Settings, Account. es and en.
- Screenshots in `.workspaces/0016_self_hosting/screenshots/desktop/` (sign-in, server, server error, sign-in with own server, settings account with server; es and en, light and dark, 380, 1280, 1920, 2560).

Pending:

- The scratch run, its second run and removal (Acceptance 1 to 3 and 5): the SSO session expired; the reviewer asked the om-manager for a login. Conditions agreed: fresh clone with no `deployment.json` or `.env`, a subagent following only the README with the skill, the plan checked for `tmw-scratch-*` names, the scratch bucket and records under `selfhost.<zone>` before any apply, transcript and removal check logged here.
- Windows `rust:lint` and `rust:test` on this round's code, and the local prd build plus dictation through "Use your own server": need the host again.
- From phase 1: web `integration` and `e2e` (dev), and the core, dev and prd plans after the rebase on 0015.

Decisions not in the plan:

- The chosen server is stored in `settings.json`, not with the keychain session: sign-out keeps it, so the sign-in step can offer the return to the official server, and a session refreshed against the wrong pool simply ends.
- Rust validation is hand-written, held to `discoverySchema` by shared vectors, instead of adding a regex crate.
- The deployed commit marker in the assets bucket makes a re-run skip the build and swap, so Acceptance 3 holds literally; a dirty tree (tracked files) or any infra change always redeploys.
- `pnpm selfhost` uses the AWS SDK for every call that carries a secret or a password (Secrets Manager, Cognito), so none reaches argv; Terraform and the code swap keep phase 1's paths.
- `--plan` was added so the skill, and the scratch gate, can show the plan before anything changes.

Deferred:

- Adding users after setup is documented through the Cognito console; a `pnpm selfhost user` command could come later.

### Round 2

Done, one per finding:

1. `accountToUse`: a first run takes the account from STS; when `deployment.json` already names an account, a profile resolving to another one stops setup and removal with the same message. Unit-tested.
2. `stateBucketUse`: setup and removal accept a state bucket only when it does not exist yet or carries `Project=<name>` and `ManagedBy=pnpm selfhost`, and refuse any other before planning or destroying; removal checks it before touching Terraform, skips Terraform when the bucket is gone, and always deletes the whole own bucket. The foreign-bucket branch is gone. The bucket is tagged right after it is created. Unit-tested.
3. `--plan` now says what it does in the usage, the README and the skill: it saves the answers and creates the empty state bucket it needs, shows the plan, and changes nothing else.

Process: the code is commit e892526 and the verify block names it; this commit carries only the notes and verify.log.

## Result
