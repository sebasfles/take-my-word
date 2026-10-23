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

### Round 3

Evidence on the Windows host (`computer available`), no code change:

- Windows `rust:lint` and `rust:test` on 5726592, whose code is e892526: green, 218 passed, 9 ignored.
- Local prd build, built and never launched (decided with the om-reviewer: Sebastian's prd app shares the prd identifier, so a prd run would touch his settings, session, autostart and single instance):
  - `pnpm tauri:build:prd --no-sign` with the official prd server and updater key from `deployment.json`: exit 0.
  - A first run without `--no-sign` built the same installer and stopped at the updater signature ("A public key has been found, but no private key"): the release key stays with `desktop-release`, and WSLENV does not forward variables to the host, so no local signing.
  - Artefacts, kept in `C:\dev\tmw-0016-prd`: `take-my-word.exe` sha256 f871ca9fb50709ba3f332eb062c96e2673cf92cae3446c6de52c28927beb3926, `Take My Word_0.2.0_x64-setup.exe` sha256 b91a7ebcfdbaad5fc5f772ea3a993c686d3472ed8e1feb6d756521c63bae3a31.
  - The exe embeds the prd discovery document byte for byte (`apiUrl` https://api.takemyword.fless.dev), the updater public key of `deployment.json` and the `releases/latest/download/latest.json` endpoint.
- The dictation against scratch will run on a dev release build of the same commit with the dev identity, dev folders and Credential Manager entries backed up and restored, the idle guard and a clipboard snapshot, as in 0014.

### Round 4

Code: b06fc0f (`terminal-smoke.sh --server <domain> --real`, defaults unchanged) and d835329 (the removal's leftovers check confirms a tagged user pool with Cognito before counting it: AWS's tag index kept the deleted pool for over 15 minutes). Both found in this round's evidence.

Official plans, preview before the rebase on 0015 (`pnpm tf <root> plan -lock=false`, never applied):

- core: "No changes. Your infrastructure matches the configuration."
- prd: the two moves `module.app.aws_iam_role.deploy` and `module.app.aws_iam_role_policy.deploy` to `[0]`, "Plan: 0 to add, 0 to change, 0 to destroy."
- dev: the same two moves, plus 0015's additive changes reversed (not ours): destroy of the `GET /me/usage` integration and route, `DAILY_QUOTA_MINUTES` removed from the api function; "Plan: 0 to add, 1 to change, 2 to destroy."

Dev (`dev available`): this branch's api and web deployed with `pnpm deploy:<api|web> build|swap` (12:02:58-12:03:52); discovery 200 and valid; web `integration` 4 passed and `e2e` 13 passed (`WEB_URL` and `RELEASES_REPOSITORY` added to the workspace `.env`); then develop 61be296 redeployed from a clean clone with develop's own workflow steps (12:06:40-12:07:46, exit 0), discovery back to 404; `dev free` sent.

Scratch run, from a fresh clone of the branch, the skill driven by a subagent that knew only the clone, the skill and the README; I answered as the person. Transcript, secrets redacted:

- 11:34:01 fresh clone of feat/0016_self_hosting at f1f96b9, origin set to the GitHub URL; no deployment.json, no .env.
- 11:34:08-11:34:12 person: README steps 1-2 (pnpm install --frozen-lockfile, copy self-host/skill to .claude/skills/self-host).
- 11:34:34 agent: /self-host started; tools checked (node 24.21.0, pnpm 10.34.7, terraform 1.13.3, aws 2.28.8, git 2.43.0, zip 3.0).
- 11:34:55 agent asks: profile (lists profiles), region (us-east-1), domain, dev (no), first username (admin).
- 11:35:08 person: profile fless-takemyword, region us-east-2, domain selfhost.takemyword.fless.dev, prd only, user scratch, deployment name tmw-scratch.
- 11:35:16-11:35:23 agent: sts get-caller-identity (115891590483), zone found takemyword.fless.dev; asks the person to write the two keys into .env.
- 11:36 person: wrote GROQ_API_KEY and OPENAI_API_KEY into .env (values redacted, never in the chat).
- 11:35:42-11:35:50 agent: checked the key names only; its write of deployment.json was refused by this harness (background subagents cannot write to an unisolated directory), not by the product; it also ran pnpm selfhost --plan too early, which stopped at once with "deployment.json is missing" and changed nothing.
- 11:37 person: saved deployment.json exactly as the agent proposed it (tmw-scratch, fless-takemyword, 115891590483, us-east-2, selfhost.takemyword.fless.dev, zone takemyword.fless.dev, prd, releases from origin).
- 11:36:24-11:37:11 agent: pnpm selfhost --plan, exit 0; it created the empty state bucket tmw-scratch-terraform-state-115891590483 (us-east-2, tags Project=tmw-scratch, ManagedBy=pnpm selfhost); plan 96 to add, 0 to change, 0 to destroy; agent summarized and asked to go on.
- 11:38 developer check of selfhost.tfplan (terraform show -json): 96 create, 1 data read, nothing else; every tags_all is Project=tmw-scratch, Environment=prd; names all tmw-scratch-prd*, /aws/lambda/tmw-scratch-prd-*, /aws/apigateway/tmw-scratch-prd, or sub-names (app client native, stage $default, role policies logs and access); DNS: 5 records in zone Z06585121NIUBTW9PNNB1, A and AAAA selfhost.takemyword.fless.dev, A api.selfhost.takemyword.fless.dev, two ACM validation CNAMEs for those two hosts.
- 11:38 person (after the om-reviewer approved the plan): agrees to apply.
- 11:38:27-11:44:34 agent: pnpm selfhost --yes --user scratch, exit 0 (6 min 7 s): "Plan: 96 to add, 0 to change, 0 to destroy." then "Apply complete! Resources: 96 added, 0 changed, 0 destroyed.", provider keys stored, cookie key generated, f1f96b9 deployed, user scratch created, discovery answered, Ready.
- 11:44:38 agent to person: web https://selfhost.takemyword.fless.dev, API https://api.selfhost.takemyword.fless.dev, user scratch, temporary password <redacted>, the desktop steps, and that the keys may now leave .env.
- 11:44:56 person: asks for the update the skill describes.
- 11:45:04-11:45:34 agent: git pull exit 1 (the scratch clone tracks a branch that exists only locally; expected for this test, not a product issue), pnpm install exit 0 (up to date), pnpm selfhost --plan exit 0: "No changes. Your infrastructure matches the configuration.", "prd already matches the code."; asks before --yes.
- 11:45:55-11:46:02 developer as the person, web sign-in through Playwright (Chromium, en, 1280x800): https://selfhost.takemyword.fless.dev/sign-in with scratch and the temporary password, "Choose your password" step, new password (generated, kept in a 0600 file outside every worktree), "Save and sign in", landed on /app showing scratch. Screenshots: scratch-evidence/web-new-password.png, web-signed-in.png.
- 11:45:55-11:46:25 agent, second run: pnpm selfhost --yes --user scratch, exit 0 (30 s): state bucket "already exists"; "No changes. Your infrastructure matches the configuration." and "prd already matches the code; nothing to apply."; "The provider keys of prd are already stored."; "prd already runs f1f96b9." (no build, no swap); "prd already has users; none created."; discovery answered; Ready.
- 11:49:00 host snapshot: Roaming dev folder absent; Local dev.fless.takemyword.dev copied, 193 files, listing sha256 9ae844a8c8f378921cdab9289c38fc0b70f9454e73398afc623b8b390cf4761b; Credential Manager: only the three prd entries (*.dev.fless.takemyword), no dev entry.
- 11:49:42-11:50:52 dictation: debug build of b06fc0f (dev identity, sha256 299c1be5f33c4cc009278ee11a56a27c5ce0f503776c35dbbdf41bb2c755573c), terminal-smoke --targets 6 --tries 1 --multiline none --server selfhost.takemyword.fless.dev --real; clipboard sealed (sha256 f2d2921e...cc51); app log "dev: API stub mode Off, real API", "server: selfhost.takemyword.fless.dev", "signed in"; speech.wav dictated 11:50:18.9, pasted 11:50:21.5 into the WinForms box: "Hello, this is a test." (landed yes, clipboard back yes); scratch API access log 11:50:19 POST /dictations 200; the guard logged no real input; the automated sign-out failed on WSL interop ("signing out did not finish"), the app was stopped; clipboard restored and verified, same sha256.
- 11:51:36 web History on scratch (Playwright, signed in with the chosen password) shows "Hello, this is a test." at 11:50, Style Plain, Audio 2.2 s (scratch-evidence/web-history.png).
- 11:52 host restore: the run's three dev credentials (*.dev.fless.takemyword.dev, the scratch session) deleted with cmdkey; Credential Manager listing identical to before; Roaming dev folder (settings.json written by the run) removed, absent again; Local dev folder restored, listing sha256 9ae844a8...761b identical; only Sebastian's prd app running, untouched.
- 11:52:23 person: removal requested, typed selfhost.takemyword.fless.dev to confirm.
- ~11:52-12:08 agent: pnpm selfhost remove --yes: "Apply complete! Resources: 0 added, 4 changed, 0 destroyed." (table and pool protection off, both secrets' recovery window 0), "Destroy complete! Resources: 96 destroyed.", "deleted the state bucket tmw-scratch-terraform-state-115891590483", then the leftovers check listed only arn:aws:cognito-idp:us-east-2:115891590483:userpool/us-east-2_F86wSZwly for 10 minutes and stopped with "these remain after removal"; DescribeUserPool on that id answered ResourceNotFoundException: the tagging index lags behind the deletion (false leftover). Fixed in d835329: a tagged user pool counts only when Cognito still describes it.
- 12:10 person: pulled d835329 into the clone.
- 12:09:05-12:09:22 agent, removal again on d835329: "tmw-scratch-terraform-state-115891590483 is gone, so no state is left.", "Nothing of tmw-scratch is left in account 115891590483.", exit 0.
- 12:09:42 independent check (`scratch-evidence/leftovers.txt` in the workspace): in us-east-2 and us-east-1 no ACM certificate for selfhost, no log group, no secret (pending deletion included), no Lambda, table, user pool or HTTP API named tmw-scratch; no IAM role, S3 bucket or CloudFront distribution; no record under selfhost.takemyword.fless.dev in the zone; the tag index still lists the deleted pool us-east-2_F86wSZwly, which DescribeUserPool answers ResourceNotFoundException.
- 12:10 local cleanup: the clone's `.env`, the chosen password, the run logs holding the temporary password, the clones and the host's scratch and backup folders deleted; the builds stay in `C:\dev\tmw-0016-{prd,dev,debug}`.

Timings: setup 6 min 7 s from apply to Ready (plan step 47 s), second run 30 s, removal 16 min (destroy and the 10-minute leftovers wait), removal again 17 s.

Findings of the run for the product:

- The tag index outlives a deleted user pool: fixed in d835329.
- The skill's subagent could not write `deployment.json` in this harness (background subagents cannot write outside a worktree); a person's Claude Code session can, so the skill is unchanged.
- `git pull` in the update step failed only because the scratch branch is not on the remote.

Deviation agreed with the om-reviewer: the dictation ran on a dev debug build of the same commit, not a local prd build, so Sebastian's prd app and identity were never touched.

### Round 5

1. The user pool test uses example ids (`123456789012`, `us-east-2_AbC123xyZ`); outside `docs/tasks/` the official account now appears only in `docs/` module text, which the docs pass scrubs. Code 8df450d, verify block on it.

The Windows host is released: nothing of ours runs there (only Sebastian's prd app); the builds stay in `C:\dev\tmw-0016-{prd,dev,debug}` until clean-task.

## Result
