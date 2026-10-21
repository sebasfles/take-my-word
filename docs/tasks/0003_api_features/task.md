---
id: "0003"
title: api_features
type: feature
crew: pair
clearance: full
branch: feat/0003_api_features
modules: [dictionary, styles, dictation, auth, infra]
repos: ["."]
phases: 0
depends_on: ["0001"]
ticket:
created: 2026-10-21
updated: 2026-10-21
---

# 0003 API features: dictionary, styles, app rules, settings, history

## Goal

A signed-in user keeps a personal dictionary, styles and per-app rules, picks a default style, reads their dictation history, and every dictation is corrected with their dictionary and shaped by the right style.
This is the rest of the backend over the pipeline 0001 delivered; the desktop editors (0008) and the web views (0009) consume it.

## Scope

- `apps/api`: a new `api` Lambda (Hono, one bundle) behind the same authorizer, serving:
  - `GET/POST /dictionary`, `PUT/DELETE /dictionary/{term}`: terms with optional "sounds like" aliases; term keys normalized (case and accent folding) for uniqueness while the display form is kept; duplicate add answers 409.
  - `GET /styles`, `POST /styles`, `PUT/DELETE /styles/{id}`: built-in styles `plain`, `casual`, `formal` (read-only, same for everyone, defined in code with one prompt each that works in Spanish and English) plus the user's custom styles (name, prompt).
  - `GET/POST /app-rules`, `PUT/DELETE /app-rules/{appId}`: desktop app identifier to style id and paste keystroke.
  - `GET/PUT /me/settings`: default style id, locale, default providers; `USER` item created on first read.
  - `GET /dictations`: history newest first, cursor pagination, text only; `DELETE /dictations/{ts}`.
- `dictate` reads the user's settings, resolves the style (`styleId` from the request, else the `APPRULE#appId`, else the default style, else `plain`), builds the two dictionary projections (top terms by decayed score into the Whisper prompt within 224 tokens; full list with aliases into the refiner prompt as a correction table) and records `styleId` on the saved dictation.
- `dictionary-usage` Lambda on the table stream: for each new `DICTATION#ts`, find the user's terms (term or alias, case and accent folded, word boundaries) in the final text and increment `useCount` and set `lastUsedAt`; idempotent enough for at-least-once delivery.
- Deleting a custom style resets app rules pointing to it to the default style; deleting the default style resets the setting to `plain`.
- `packages/shared`: zod contracts for every route above, the style and app rule shapes, the paste keystroke enum, and the dictation request gaining `styleId` and `appId` semantics.
- `infra`: `api` and `dictionary-usage` Lambdas, routes on the HTTP API, event source mapping on the stream filtered to inserts of `DICTATION#`, IAM scoped per function, deploy role extended to the new functions; applied to dev; prd planned.
- First milestone: the first `deploy-dev` run after merging #1 (https://github.com/sebasfles/take-my-word/actions/runs/39539986525) failed at `aws-actions/configure-aws-credentials` with `Not authorized to perform sts:AssumeRoleWithWebIdentity` on `arn:aws:iam::115891590483:role/take-my-word-dev-deploy` (trust policy subject versus the job's actual OIDC subject, or the job not running inside the `dev` Actions environment); diagnose and fix it in Terraform or the workflow so `deploy-dev` deploys and opens the promotion PR, since this task extends the same deploy role and workflow.
- E2E against dev with the `crew-e2e` user: CRUDs, a dictation with a dictionary term that Whisper misspells without it, a dictation under an app rule, history listing.
- Docs: module docs of dictionary, styles, dictation, auth and infra via `document-task`; TRD verification rows if commands change.

## Out of scope

- Desktop and web user interfaces: 0008 and 0009.
- Mobile.
- Per-user quota override, import or export of dictionaries, automatic term suggestions.
- Transcribe custom vocabularies and every extra provider adapter: evaluation harness.
- Deferred: a materialized top-N list if dictionaries grow large; per-dictation style override UI on desktop.

## Acceptance

1. Root `pnpm lint`, `pnpm typecheck`, `pnpm test` pass; `terraform fmt -check` and `validate` pass for core, dev, prd; `ci` green on the PR.
1b. The OIDC assumption is proven before merge: after the Terraform fix the crew re-runs the failed `deploy-dev` run (or a `workflow_dispatch` of it on `develop`) and it goes green, with the run linked in the PR; after merge the om-manager checks the new run and the promotion PR.
2. Every route above answers 401 without a token and is scoped to the caller: a term, style, rule or dictation of user A is invisible to user B (e2e with `crew-e2e` and a second crew user).
3. Dictionary CRUD: add `Kubernetes` with alias `cubernetes`, list shows it with `useCount` 1 and `lastUsedAt` today; adding it again (any case or accent) answers 409; edit aliases; delete.
4. A Polly recording that says a dictionary term is returned spelled as the term, and the same recording without the term in the dictionary is not (evidence of both in the PR); the saved dictation names the style used.
5. After that dictation, within a minute, the term's `useCount` is 2 and `lastUsedAt` updated, via the stream Lambda, not via `dictate`.
6. Styles: `GET /styles` lists the three built-ins and the user's custom ones; built-ins cannot be edited or deleted (405 or 403); a custom style can; a dictation with `styleId` casual and one with formal produce visibly different text for the same recording (evidence in the PR).
7. App rules: a rule for `notepad.exe` with style formal and keystroke `ctrl+v`; a dictation sent with `appId` `notepad.exe` and no `styleId` uses formal; deleting that custom style resets the rule to the default style.
8. Settings: first `GET /me/settings` creates the user with `plain` default and locale `es`; `PUT` changes the default style; a dictation without `styleId` or a matching rule uses it.
9. History: `GET /dictations` returns the user's dictations newest first with cursor pagination; `DELETE /dictations/{ts}` removes one; audio is nowhere.
10. Unit tests cover normalization, decayed score ranking and prompt budget, term matching in the stream Lambda, style resolution order, and route authorization.

## Approach

- One `api` Lambda with Hono routers per module under `apps/api/src/{dictionary,styles,app-rules,settings,history}`; `dictate` stays its own function; alternative rejected: one route per Lambda, more infra for no isolation gain.
- Items under `USER#{sub}`: `DICT#{normalizedTerm}` (term, aliases, useCount, lastUsedAt, createdAt), `STYLE#{id}` (custom only; built-ins live in code), `APPRULE#{appId}` (styleId, keystroke), `SETTINGS` (defaultStyleId, locale, providers), `DICTATION#{ts}` gains `styleId`; all with the table's TTL attribute only where the module says.
- Decayed score `useCount * 0.5^(days/halfLife)` computed at read in `dictate`, half-life from `DICTIONARY_HALF_LIFE_DAYS` (30); prompt budget by a token estimate with the 224 cap; alternative rejected: a stored score column, stale by design.
- Stream consumer with an event source filter on `INSERT` and `SK begins_with DICTATION#`, batch size small, bisect on error; matching by normalized word boundaries over text; alternative rejected: counting in `dictate`, which would put writes on the response path.
- Built-in styles as code: three prompts in `apps/api/src/styles/builtin/`, versioned by file; alternative rejected: seeding per user, which would drift.
- Style resolution and dictionary projection live in `dictation/` as pure functions with tests; `dictate` loads settings, rule, style and dictionary in one query of the user's partition (`USER#{sub}` with the needed SK prefixes) to keep latency flat.
- Pagination by `LastEvaluatedKey` encoded as an opaque cursor.
- Keystroke enum: `ctrl+v`, `ctrl+shift+v`, `shift+insert`, `cmd+v` for later platforms.

## Database

- Owns: `DICT#`, `STYLE#`, `APPRULE#`, `SETTINGS` under `USER#{sub}`; adds `styleId` to `DICTATION#`.
- Invariants: normalized term unique per user; app rules point to an existing style or a built-in; settings default style exists; dictations written once, `useCount` and `lastUsedAt` written only by `dictionary-usage`.
- No migrations; new item kinds only.

## Infra

- `api` Lambda (Node 24 ARM64, 512 MB, 15 s) with routes on the existing HTTP API and the existing authorizer; `dictionary-usage` Lambda on the table stream with a filter and a DLQ-less retry policy of 2 and bisect.
- IAM: `api` reads and writes the user's partition; `dictionary-usage` updates `DICT#` items only; deploy role gains `UpdateFunctionCode` and `GetFunction` on both.
- Env: `TABLE_NAME`, `DICTIONARY_HALF_LIFE_DAYS`, `STT_PROMPT_TOKEN_BUDGET=224`.
- Workflows: `reusable-deploy` updates the four functions; `ci` unchanged.
- Applied to dev by the crew with `fless-takemyword`; prd planned.

## Design

None.

## Risks

- Prompt budget: Whisper's 224 tokens are model tokens; a conservative estimate may leave headroom unused, fine for v1.
- Stream at-least-once can double count a use; tolerated as ranking noise.
- Query fan-out in `dictate` adds one DynamoDB read to every dictation; measured in per-stage latency.

## Depends on

0001 (merged). Runs in parallel with 0002 (desktop shell), which touches no backend file.

## Context & decisions

Consolidated 2026-10-21 by the om-reviewer with the om-manager (Sebastian unavailable until wave 3).

- Deploy fix (om-reviewer): the repo issues immutable OIDC subjects (`repo:sebasfles@64487774/take-my-word@1427740478:environment:{env}`) while `infra/stacks/app/deploy.tf` trusts `repo:sebasfles/take-my-word:environment:{env}`; build the subject in `stacks/app` from github data sources (owner and repo ids, never hardcoded); rejected: reverting the repo to mutable subjects in `core`. deploy-prd keeps failing on `main` until prd is applied.
- E2E credentials (om-manager): the crew reads pool ids and `API_URL` from `infra/scripts/tf dev output`, sets a new permanent password for `crew-e2e`, creates `crew-e2e-b` in the dev pool, and appends all keys (`CREW_E2E_B_USERNAME`, `CREW_E2E_B_PASSWORD` included) to the workspace and root `.env`; values never printed.
- Settings item (om-manager): `SK = SETTINGS` under `USER#{sub}`, owned by dictation; Scope's "`USER` item" means this; `document-task` removes `USER` as an item kind from every module doc.
- App rules (om-manager): `styleId` is optional; deleting a custom style removes `styleId` from rules pointing to it, so they follow the default; deleting the default style also resets `defaultStyleId` to `plain`. Cleanup is best effort, resolution tolerates dangling ids.
- Limits (om-manager): 500 terms per user, 10 aliases per term, 64 chars per term or alias; 20 custom styles (name 40, prompt 2000 chars); 100 app rules; over a limit answers 400.
- Reads in `dictate` (om-reviewer, adjusts Approach): one Query cannot cover `SETTINGS` and `STYLE#` without reading `DICTATION#`; use one round trip of parallel calls (Query `DICT#`, Query `STYLE#`, BatchGet `SETTINGS` and `APPRULE#{appId}`), concurrent with the quota charge; skipped silence reads nothing.
- IAM (om-reviewer, adjusts Infra): roles cannot be scoped to a user's partition or to `DICT#`; per-function action lists on the table, `dictionary-usage` with Query plus UpdateItem limited by `dynamodb:Attributes` to `PK`, `SK`, `useCount`, `lastUsedAt` and the stream read actions; per-user scoping in code from the authorizer `userId` only.
- Usage (om-reviewer): +1 per dictation containing the term; UpdateItem conditioned on `attribute_exists(SK)` and `lastUsedAt < dictation createdAt`, so a deleted term is never recreated and a redelivered record is a no-op; matching uses Unicode-aware boundaries, never `\b`; the mapping reports batch item failures, retry 2, bisect.
- Style resolution (om-reviewer): request `styleId`, else the rule's, else `defaultStyleId`, else `plain`; an unknown or deleted id falls through, never fails a charged dictation; the response and `DICTATION#` carry the `styleId` used. `settings.providers` fill what `meta` omits; `meta.locale` stays required, `settings.locale` (default `es`) is a client preference.
- Refiner prompt (om-reviewer): the editing contract stays in code (today's `plainV1` rules), then the style prompt as a tone section, then the correction table; `plain` adds nothing; a custom prompt never replaces the contract.
- History (om-reviewer, adjusts Scope): items carry `id`, `createdAt`, `locale`, `text`, `raw`, `styleId`, `audioSeconds`; no audio, latency or tokens; `id` is opaque (encodes the SK suffix), route `DELETE /dictations/{id}`; the cursor carries only the SK, the PK always comes from the caller; a malformed cursor answers 400.
- Contracts (om-reviewer): `appId` lowercased on write and lookup; built-ins answer 403 `forbidden`; new error codes `not_found` 404, `conflict` 409, `forbidden` 403; missing items on PUT and DELETE answer 404.
- Acceptance 7 rewritten (om-manager): a rule `notepad.exe` with `formal` and `ctrl+v`; a dictation with that `appId` and no `styleId` uses formal; the rule is then pointed at a custom style, the style is deleted, the rule answers without `styleId` and the next dictation uses the default style.
- Acceptance 4 (om-reviewer): `Kubernetes` serves the CRUD only; the dictation term must be one Whisper and the refiner both get wrong without the dictionary (rare or invented), shown with evidence.
- Constraints: contracts only in `packages/shared` (CLAUDE.md); new items carry no `expiresAt`, so fix the infra/database.md invariant; `reusable-deploy` needs `API_FUNCTION_NAME` and `DICTIONARY_USAGE_FUNCTION_NAME` written by `stacks/app`, and dev must be applied before merge.
- Review checks beyond the Pipeline: what Groq does past 224 prompt tokens is proven once in dev, and if it errors the estimate must be an upper bound; terms with spaces, accents, `/`, `#`, `%` round-trip through PUT and DELETE; e2e cleans up and reruns green; Acceptance 5 evidence is a `dictionary-usage` log line for that dictation; Acceptance 1b run linked in the PR.
- clearance: full, AWS profile `fless-takemyword` (apply dev, plan prd), Cognito dev pool users, GitHub Actions re-runs on `sebasfles/take-my-word`.

## om-developer notes
