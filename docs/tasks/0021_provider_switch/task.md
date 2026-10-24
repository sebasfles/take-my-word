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

## om-developer notes
