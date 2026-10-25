---
id: "0021"
title: provider_switch
type: feature
crew: pair
clearance: full
branch: feat/0021_provider_switch
modules: [dictation, infra]
repos: ["."]
phases: 0
depends_on: []
ticket:
created: 2026-10-24
updated: 2026-10-24
---

# 0021 Switch transcriber and refiner by environment variable

## Goal

Every transcriber and refiner the project has measured becomes available to production behind the existing ports, and each environment picks its transcriber and refiner with two `dictate` environment variables.
Moving production to another provider, or back, is a one-value change applied from the deployment config, with no code change and no deploy.
The evaluation harness uses the same adapters as production, so a new provider is written once and is both measurable and selectable.

## Scope

- Production registry with every adapter measured in 0017 and 0018:
  - Transcribers: Groq `whisper-large-v3-turbo` (today), OpenAI `gpt-transcribe`, Together `nvidia/parakeet-tdt-0.6b-v3`.
  - Refiners: OpenAI `gpt-5.4-nano` as called today, `gpt-5.4-nano@none`, `gpt-5.6-luna@none`; Cerebras `qwen-3.8-27b@none`, `gpt-oss-120b@low`; Groq `gpt-oss-20b@low`.
- Two `dictate` environment variables, one for the transcriber and one for the refiner, set per environment from `deployment.json` through Terraform; defaults are today's pair, so production is unchanged at merge.
- Provider keys: the providers secret already holds Groq, OpenAI, Together and Cerebras keys; a selected provider whose key is missing fails at cold start with a clear log line, never mid-dictation.
- The evaluation runner builds its candidates from the production registry; eval-only adapter copies are removed.
- Self-host gets the same two settings.
- `docs/modules/dictation` and `docs/modules/infra` say how to switch, in a few lines.

## Out of scope

- Choosing a new production pair (that follows the round 3 evaluation).
- Segmented transcription (0019, paused until this merges) and the key-down warm-up (draft `latency`).
- New providers (round 3 evaluation drafts).
- Prompt changes.

## Acceptance

1. With no new values in `deployment.json`, dev and prd behave exactly as today: same providers, and provider requests byte-identical (unit tests on URL, headers and body for every adapter).
2. Each listed transcriber and refiner is selectable by its environment variable, and on dev each of these pairs passes `pnpm e2e` after a switch: today's pair, `gpt-transcribe` + `gpt-5.4-nano`, Parakeet + Cerebras `qwen-3.8-27b`.
3. An unknown id or a missing key for the selected provider fails at cold start with one clear log line; no dictation is attempted.
4. The saved dictation records which transcriber and refiner produced it, as today.
5. The evaluation runner and production share one adapter per provider; `production-bundles.test.ts` still keeps eval-only code out of the production bundles.
6. `pnpm tf dev plan` and `pnpm tf prd plan` show only the new environment variables on `dictate`, with today's values.
7. The module docs say, in a few lines, how to switch each environment and which ids exist.

## Approach

- Module and layers touched: dictation providers and registry, the `dictate` handler's configuration, shared contracts in `packages/shared`, the eval runner in `apps/api`, the `dictate` Lambda's Terraform, `deployment.json` schema and example.
- Entities, endpoints, tables: none new.
- Decisions:
  - Selection by `dictate` environment variables from `deployment.json` through Terraform, applied from Sebastian's machine, chosen over an SSM parameter read at cold start because the configuration stays in one place and every change is recorded.
  - One adapter per provider shared by production and evaluation, chosen over separate eval copies so a provider is written once.

## Database

None.

## Infra

- `dictate` Lambda: two new environment variables per environment, values from `deployment.json`, defaults today's pair.
- No new secrets; keys already in `take-my-word-{env}/providers`.
- Dev apply for the measurements; `pnpm tf prd plan` only.

## Design

None.

## Risks

- Per-user `providers` in `SETTINGS` and per-request overrides in the dictation meta already exist; their precedence against the environment variables must be settled so the environment choice is what actually runs.
- Cerebras and Together limits in production are unmeasured; a switch there must fail fast and visibly.
- 0019 is paused mid-way and rebases on this; contract changes here must stay small.

## Depends on

None. 0019 resumes after this merges.

## Context & decisions

Consolidated 2026-10-24 by the om-reviewer with the om-manager and Sebastian.

- Scope adjustment (Sebastian): users have no provider choice; the pair belongs to the operator, set only by the two `dictate` variables. Removed everywhere: `SETTINGS.providers` in the contract, defaults and store handling, meta `sttProvider` and `refineProvider`, the web Account page's Transcription and Refiner rows, and any desktop code that reads, shows or sends them. Web screenshots at 390, 768 and 1280 px; desktop ones only if its UI changes. A dictation `ard.md` entry records that provider choice is server-side only.
- Compatibility (Sebastian): released desktops keep working. `POST /dictations` and `PUT /me/settings` accept the old fields and ignore them, never answering 400, with one test per old shape. Stored `SETTINGS` items keep their `providers` untouched, with no migration.
- Wire compatibility (om-reviewer): released desktops deserialize settings with a required `providers` (`apps/desktop/src-tauri/src/api/mod.rs:191`). `GET` and `PUT /me/settings` therefore keep answering a fixed `providers: {transcriber: "groq-whisper", refiner: "openai"}`, never read from storage and used by nothing. It is recorded as debt, to revisit when no released desktop older than this task's build remains.
- Ids (om-reviewer, accepted): the registry ids are 0018's candidate ids (`whisper-large-v3-turbo`, `gpt-transcribe`, `together-parakeet`, `gpt-5.4-nano`, `gpt-5.4-nano@none`, `gpt-5.6-luna@none`, `cerebras-qwen-3.8-27b@none`, `cerebras-gpt-oss-120b@low`, `gpt-oss-20b@low`). They are exported from `packages/shared`, so the deployment config refuses an unknown id before any apply; the cold-start check stays to catch drift. `together-whisper-large-v3` leaves the eval candidates, cited to 0018's report (it translates Spanish).
- Labels (om-reviewer, accepted): today's pair keeps `groq-whisper:whisper-large-v3-turbo` and `openai:gpt-5.4-nano` in responses, saved items and EMF `Provider`. An entry with a reasoning effort appends `@<effort>`.
- Cold start (om-reviewer, accepted): absent variables mean today's pair, so prd code can be promoted before `pnpm tf prd apply` (as 0019's receipt key). At init, an unknown id or a missing key of the selected providers logs one JSON error line and throws, before any quota or provider call. Only the selected providers' keys are required.
- `GROQ_WHISPER_MODEL` and `OPENAI_MODEL` are removed; the id carries the model (om-reviewer, accepted).
- No automatic fallback between providers; failures stay visible as today (om-reviewer, accepted).
- With Parakeet selected, the dictionary reaches only the refiner. This is recorded as debt; dictation `ard.md` 2026-10-20 names this trigger (om-reviewer, accepted).
- e2e (Sebastian, as recommended): it asserts the labels of the configured pair. Every pair keeps every clean-text assertion, and raw-level checks run only for transcribers that declare the behavior (prompted). A pair failing a clean-text assertion on model quality counts the switch as passed, and the PR shows the failure with its output.
- Self-host (Sebastian, as recommended): it reads the same `deployment.json` keys and requires and asks only for the selected providers' keys, keeping other stored keys. README and skill list the ids and keys in a few lines.
- Eval: the runner and the eval Lambda name candidates by registry id. `eval:e2e` paces with dev's configured transcriber, not a hardcoded turbo.

Constraints:
- Contracts stay in `packages/shared`; the desktop mirror and `contract.schema.json` follow through `pnpm contract`.
- 0019 rebases on this, so keep the change in `dictate.ts` to the selection point.
- `docs/ARD.md` debt rows whose trigger is "the transcriber switch task" get a trigger that has not fired yet (prd moving off turbo). The 0018 eval-keys entry in dictation `ard.md` is resolved or revised.
- Acceptance 6: the official `deployment.json` stays without new values at the end, and dev ends on today's pair.

Beyond the Pipeline I check:
- One unit test per registry entry pins URL, headers and body, and today's pair matches develop's requests byte for byte.
- An e2e pass proves the switched pair ran.
- `production-bundles.test.ts` is unchanged in intent.
- Old-shape tests cover settings `PUT` and dictation meta.

clearance: full: `pnpm tf dev plan` and `apply` (each Acceptance 2 pair, then back to today's), the branch `dictate` swapped on dev for `pnpm e2e` and develop's build restored afterwards (check dev runs develop's build before the first apply), `pnpm tf prd plan` only. No prd apply, no evaluation runs.
- Before round 1 (om-reviewer, on the om-developer's question): the settings contract change reaches the `api` Lambda, so for the dev e2e runs all four api-bundle Lambdas (`dictate`, `api`, `authorizer`, `dictionary-usage`) are swapped to one branch build. Develop's build of all four is restored afterwards, and the restore is recorded in `verify.log`. Web code is not swapped.
- Before round 1 (om-reviewer): dev's state holds 0019's paused infra, so every dev apply here is `-target=module.app.module.dictate.aws_lambda_function.this`. That keeps 0019's key, route, integration and policy, and only drops `SEGMENT_RECEIPT_KEY` from dev's `dictate` env, which neither develop's code nor this branch reads. 0019 re-applies it on resume. prd's plan stays the untargeted Acceptance 6 check.

## om-developer notes

### Round 1

Done:
- `packages/shared/src/providers.ts` holds the registry ids, today's defaults, the provider key each id needs (`transcriberKeys`, `refinerKeys`, `keysOfPair`) and `providerPairSchema`.
  `transcriberIds`, `refinerIds` and the defaults left `dictations.ts`; `sttProvider` and `refineProvider` left the meta and `providers` left `settingsSchema`; zod strips the old fields, so old shapes parse and are ignored.
- `apps/api/src/dictation/providers/registry.ts` is the one adapter table for production and evaluation: entry data (adapter, model, effort, temperature, `prompted`) plus `transcriberOf` and `refinerOf`.
  Labels append `@<effort>` in the `openai` and chat adapters, so today's pair keeps `groq-whisper:whisper-large-v3-turbo` and `openai:gpt-5.4-nano`.
- `dictate` reads `TRANSCRIBER` and `REFINER` (defaults today's pair; `GROQ_WHISPER_MODEL` and `OPENAI_MODEL` removed) and selects at init with a top-level await in `handler.ts`: an unknown id or a missing key of the selected pair logs one `providers not selected` JSON line with both values and the reason, and throws before any request is served.
  `dictate.ts` changes only at the selection point (`deps.providers` is the selected pair).
- The providers secret is read with every key optional; only the selected pair's keys are required (`requiredKeys`).
- Settings: `GET` and `PUT /me/settings` answer the fixed `providers` released desktops require (`releasedDesktopProviders` in `settings/routes.ts`); the store writes with `UpdateCommand SET` of the four settings fields, so a stored `providers` stays untouched.
- Web Account page drops the Transcription and Refiner rows and their copy; desktop mirror drops `TranscriberId`, `RefinerId`, `SettingsProviders` and the meta fields, contract regenerated; no desktop UI changed.
- Eval: the contract names candidates by registry id; `src/eval/candidates.ts` and `src/eval/keys.ts` removed, the eval Lambda uses the production loader and registry; `together-whisper-large-v3` moved to `notRerun`, cited to 0018's report; `eval:e2e` paces with dev's configured transcriber.
- Deployment: `providers.{dev,prd}.{transcriber,refiner}` in `deployment.json` (schema and example), `pnpm tf` always passes `TF_VAR_transcriber` and `TF_VAR_refiner`, Terraform sets `TRANSCRIBER` and `REFINER` on `dictate`; self-host asks for and requires only the selected providers' keys and keeps every other stored key; self-host README and skill list ids and keys.
- Tests: one per registry entry pinning label, URL, key and body; today's pair pinned to develop's literals; selection (pairs, unknown ids, missing keys, one log line); old shapes of meta (shared, upload, handler) and settings (shared, routes, store); deployment config and Terraform variables per environment; self-host required keys.

Dev runs (all four api Lambdas swapped to the build of `b80c3c2`, whose `apps/api` and `packages` sources equal this commit's; every apply targeted at `module.app.module.dictate.aws_lambda_function.this`, each plan checked to change only dictate's environment):
- Before the first apply all four dev Lambdas ran develop's sources (sourcemaps identical to `origin/develop`); their zips are kept in the workspace's `.restore/` for the restore.
- Today's pair: `pnpm e2e` 38 of 38 (first verify run).
- `gpt-transcribe` + `gpt-5.4-nano`: 37 of 38; the labels matched, and the one failure is model quality on a prompted transcriber, twice in a row: with `Quelvarix` in the dictionary and in the prompt, raw was "Hablé con Kelvaric sobre el contrato de mantenimiento." (`.verify/api-e2e-gpt-transcribe.out`); counted as passed per Context & decisions, for the PR.
- Parakeet + `cerebras-qwen-3.8-27b@none`: 38 of 38; the raw dictionary check skipped (unprompted), the clean text still spelled the term.
- Dev logs show 18 `dictation done` lines under `openai-transcribe:gpt-transcribe` + `openai:gpt-5.4-nano` and 16 under `together-transcribe:nvidia/parakeet-tdt-0.6b-v3` + `cerebras-chat:qwen-3.8-27b@none`.
- Dev ends on today's pair; dev's `dictate` no longer has `SEGMENT_RECEIPT_KEY`, so 0019 must re-apply on resume.
- `pnpm tf prd plan`, untargeted: 1 to change, `dictate` gains only `REFINER = gpt-5.4-nano` and `TRANSCRIBER = whisper-large-v3-turbo`.

Decisions the plan did not record:
- The provider key each id needs lives in `packages/shared` with the ids, so the api, the deployment config and self-host read one table.
- Selection runs at init with a top-level await (the secret is read during init, not on the first dictation), and the adapters get the keys already loaded.
- The fixed `providers` answer is an api constant, not part of the shared contract; new clients never see it in their types, and the desktop test pins that serde ignores it.
- Settings `PUT` became an `UpdateCommand` setting the four fields instead of a `PutCommand` replacing the item, to keep stored `providers` untouched.
- Terraform's `transcriber` and `refiner` have no default; `pnpm tf` always passes them from the shared defaults, so the default lives in one place.
- The e2e reads the configured pair from `deployment.json`, choosing the environment whose API host is `API_URL`'s; the filler check on raw stays unconditional (it is not a prompt behavior).
- Eval candidates keep a `spec` field that is now the registry entry; their `setting` derives from whether the entry sets an effort.

Pending: none; develop's build of the four dev Lambdas is restored after the final verify run and recorded in `verify.log`.

Deferred:
- A desktop built from this task no longer sends `providers`, so a server older than this task (an un-updated self-host) answers its settings `PUT` with 400.
- `defaultGroqWhisperModel` and `defaultOpenaiModel` stay as adapter defaults used only by adapter tests.
- `infra/environments/dev/.terraform.lock.hcl` gained the `random` provider from 0019's state during these plans; it is left out of the commit.

### Round 2

Applied the four findings:
1. Settings `PUT` is again the `PutCommand` that replaces the item whole (`settings/dynamo.ts` equals develop's); a stored `providers` disappears on that user's next save. `settings/dynamo.test.ts` is deleted; `api/app.test.ts` still checks the stored item has no `providers` after a `PUT`. The round 1 decision on `UpdateCommand` is withdrawn.
2. The raw dictionary check in `features.e2e.ts` is `expect.soft`, so the clean-text check always runs and reports.
   Re-run on dev of that test under `gpt-transcribe` + `gpt-5.4-nano` (targeted apply, the four api Lambdas on the build of `3071b80`, then today's pair and develop's build restored): both fail on model quality.
   The saved dictation reads raw "Hablé con Kelvaric sobre el contrato de mantenimiento." and clean text "Hablé con Kelvarix sobre el contrato de mantenimiento.", so users would not get "Quelvarix" either; the dictation before the term was added read "Kelbaric" in both (`.verify/api-e2e-gpt-transcribe-rare-term.out`).
3. `deployment.json` refuses a `providers` entry for an environment outside `environments`, with a `config.test.ts` case; the JSON schema does not change.
4. `infra/environments/dev/.terraform.lock.hcl` restored with `git checkout` after this round's dev plans.

Decisions the plan did not record: none new.
Pending: none.
Deferred: none new; the desktop-against-older-server 400 goes to the desktop `ard.md` debt entry in `document-task`, as the om-reviewer asked.
