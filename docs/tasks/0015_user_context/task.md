---
id: "0015"
title: user_context
type: feature
crew: pair
clearance: full
branch: feat/0015_user_context
modules: [dictation, desktop, dictionary, auth, infra]
repos: ["."]
phases: 0
depends_on: ["0013", "0014"]
ticket:
created: 2026-10-22
updated: 2026-10-22
---

# 0015 What you do: user context for transcription and cleanup

## Goal

Take My Word knows what the user does (software development, biology research, law...), so domain words come out right without filling the dictionary: a developer's "CI", "PR" or "deploy", a biologist's species and techniques.
The user says it once in the onboarding and can change it any time.
Ships in desktop 0.3.0 with 0013, 0014 and 0016.

## Scope

- Settings gain the user's context: up to 3 picks from a predefined set plus an optional free-text detail (up to 200 characters, for example "backend with AWS and TypeScript", "molecular biology, CRISPR").
  Predefined set, labels in es and en: Software development; Data and AI; Design; Product management; Marketing; Sales; Customer support; Writing and content; Research and academia; Biology and life sciences; Medicine and health; Law; Finance and accounting; Education and teaching; Engineering (non-software); Student.
- The contract lives in `packages/shared` settings (schema and update schema), stored in the user's `SETTINGS` item; empty by default, which keeps today's behavior.
- Dictation uses it on every request:
  - the speech-recognition prompt gets a short domain hint from the picks and detail, within the existing `STT_PROMPT_TOKEN_BUDGET`, after the dictionary terms' priority is decided (the dictionary still wins space);
  - the cleanup prompt gets the context as background only, with an explicit rule that it never adds, inserts or changes meaning, only helps spell and recognize terms.
- Desktop: a new onboarding step after dictation languages ("What do you do?"), skippable; editable in Settings > General; upgraded users see the one-time "new" note from 0014 mention it.
- Web: the Account page shows it read-only, like the other settings.
- Daily quota visible (folded in from the `me_usage` draft, Sebastian 2026-10-22): `GET /me/usage` in the `api` Lambda returns `{ usedSeconds, capSeconds, resetsAt }` from the `QUOTA#date` item and the cap (the `DAILY_QUOTA_MINUTES` value made available to the `api` Lambda through Terraform); contract in `packages/shared`; the web Account page and desktop Settings > General show used versus cap and the reset time.
- Evaluation: a small fixture set of spoken samples per domain (developer with "CI/CD", "PR", "kubectl"; biology with domain terms) run against dev with and without context, results in the PR.
- Release: desktop 0.3.0 (0013 plus 0014 plus this), cut with `pnpm release:desktop` after the om-manager's release go, merge commit so the tag reaches `develop`; update check from 0.2.0 by Sebastian's own app (read-only evidence, as 0014 decided); prd landing shows 0.3.0.

## Out of scope

- Suggesting dictionary terms from the context (deferred).
- Per-app context.

## Acceptance

1. Contract, API, desktop and web tests pass; `ci`, `desktop-ci` windows and linux-check green; after merge `deploy-dev` green.
2. With context set, the fixture samples show fewer domain-term errors than without, on dev, with the numbers in the PR; no sample gains invented content.
3. Empty context behaves exactly as today (existing dictation tests unchanged in assertions).
4. `GET /me/usage` contract and API tests; web Account and desktop Settings show the quota.
5. Onboarding step and Settings field in es and en, light and dark, at the 0014 screenshot sizes; web Account shows it.
6. 0.3.0 published as latest; prd API deployed before the release (promotion merged and `deploy-prd` green first, so 0.3.0 never calls a prd API without the field); Sebastian's 0.2.0 updates to 0.3.0; prd landing shows 0.3.0.

## Approach

- Picks are stable ids in `packages/shared`, labels live in each client's i18n; the API maps ids to English domain phrases for the prompts.
- The STT hint stays short (a few words) so it does not bias language detection; measure on the es and en fixtures.

## Database

`SETTINGS` item gains the context fields; no migration (absent means empty).

## Infra

Deploys to dev through CI as usual; prd through the promotion, which the om-manager merges before the desktop release. No Terraform changes expected. Windows runs follow the machine rules of 0011 to 0014.

## Design

Onboarding step in 0014's two-column frame: chips for the picks (max 3) and the detail field, with a one-line example of the difference it makes.

## Risks

- A long context can bias Whisper's language detection; keep the hint short and measure.
- The cleanup model could take the context as content; the prompt rule and Acceptance 2 guard it.

## Depends on

0013 and 0014 merged to `develop` (0014 merges without a release). 0.3.0 is cut by whichever of 0015 and 0016 merges last; the om-manager decides which and gives the release go.

## Context & decisions

Consolidated 2026-10-23 by the om-reviewer; answers from the om-manager.

- Scope adjusted, release (om-manager): 0015 merges first with no tag; the promotion merges and `deploy-prd` goes green; then 0016 cuts 0.3.0. Acceptance 6 (release, Sebastian's update from 0.2.0, prd landing version) moves to 0016. Why: 0015's own API must be in prd before any 0.3.0 tag, which only happens after this PR merges.
- Infra adjusted (om-manager): Terraform is needed. Add `GET /me/usage` to the route list in `infra/stacks/app/api.tf`, and `DAILY_QUOTA_MINUTES` (from `var.daily_quota_minutes`) to the `api` Lambda in `compute.tf`. The `api` Lambda requires the cap at cold start, like `dictate`.
- Dev Terraform: the crew runs `infra/scripts/tf dev apply` before the branch API reaches dev.
- Prd Terraform: on the clean signal and before "PR ready", the om-developer runs `infra/scripts/tf prd plan`, attaches it to the PR, then applies. The apply goes ahead only if the plan is that route (with its own wiring) plus the `api` env var, with nothing destroyed or replaced; anything else stops and goes to the om-reviewer. If SSO has expired, report "SSO needed" and never sign in yourself.
- Dev is shared with 0016 (om-manager): take it only when the om-manager hands it out busy, and redeploy develop's code before freeing it. The Windows host follows the same rule and the machine rules of 0011 to 0014.
- STT hint (om-manager, Approach adjusted): the API keeps the domain phrases per pick id in es and en, and sends the hint in the transcription language. The detection pass uses the first dictation language, and the hint is dropped from that pass if any fixture flips language. The hint is the labels plus the detail, no seed vocabularies. It enters after the ranked terms only if it fits whole in the remaining `STT_PROMPT_TOKEN_BUDGET` bytes (`docs/modules/dictionary/ard.md`, byte budget).
- Evaluation (om-manager): Polly neural voices generated at run time; only sentence texts and expected terms are committed, never audio. Samples: developer and biology in es and en, Spanish with English dev terms mixed in, plus control sentences with no domain. Each sample runs with and without context, under one language and under both, 3 runs each, against dev with a throwaway user deleted afterwards. The PR gets domain-term errors, language flips and every word not in the expected text. The fixture set is committed before the first with-context run, and Acceptance 2 is not loosened: no gain is reported as is.
- Contract (om-reviewer): settings read always carry the context (empty by default; a stored value that does not parse falls back per field, `docs/modules/dictation/ard.md` 2026-10-21). On `PUT` the context is optional: absent keeps the stored one, so 0.2.0 and the web never wipe it; explicit empty clears it. Pick ids are unique, at most 3. The detail is trimmed, at most 200.
- Desktop mirror (om-reviewer): `UserSettings` in `src-tauri/src/api/mod.rs` carries the context, so the `save_onboarding` round trip keeps it; run `pnpm contract`. `GET /me/usage` is a new forwarder variant, with no Rust mirror (`docs/modules/desktop/ard.md`, route forwarder).
- Refiner (om-reviewer): the context goes in a delimited background block in the prompt's language, treated as data, with a rule that it never adds, inserts or changes meaning. The context and detail never reach logs.
- Usage (om-reviewer): `usedSeconds` is today's `QUOTA#date` (0 when absent) and may pass the cap, so clients clamp. `capSeconds` is the cap times 60. `resetsAt` is the next UTC midnight in ISO, shown in local time. Clients hide the quota on a 404 (older or self-hosted servers). Desktop reads it when General opens, with no polling.
- Desktop UI (om-reviewer): the step is `user` scope after `languages` in `views/onboarding/plan.ts`, prefilled from settings and saved with the rest; skipping keeps it empty. It shows one static before/after example per language. The 0014 hands-free note's copy also names the context. The web Account shows the labels from its own es and en copy.
- Constraints: contracts only in `packages/shared` (CLAUDE.md); settings replaced whole (`docs/modules/dictation/ard.md`); no code comments; screenshots at the 0014 sizes for desktop, and the web Account page at 390, 768 and 1280.
- Review checks beyond the Pipeline:
  - a unit test proving that with empty context the transcriber prompt and the refiner instructions are byte-identical to today (Acceptance 3);
  - the fixture commit precedes the first with-context results;
  - the prd plan output is in the PR before the apply.
- clearance: full: dev `infra/scripts/tf dev apply`; prd plan and the additive apply above; `update-function-code` on the four dev Lambdas and the web deploy steps; `pnpm e2e` and `pnpm integration` with throwaway users and Polly; the Windows host. No `pnpm release:desktop`.

## om-developer notes
