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

## Result
