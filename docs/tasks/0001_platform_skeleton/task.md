---
id: "0001"
title: platform_skeleton
type: feature
crew: pair
clearance: full
branch: feat/0001_platform_skeleton
modules: [dictation, auth, infra]
repos: ["."]
phases: 0
depends_on: []
ticket:
created: 2026-10-20
updated: 2026-10-20
---

# 0001 Platform skeleton with POST /dictations

## Goal

An invited user with a Cognito account can send a short recording to `POST /dictations` in dev and get clean text back, produced by Groq Whisper and an OpenAI model (default `gpt-5.4-nano`), within their daily quota.
This is the first vertical slice of Take My Word: the monorepo, the infrastructure, the gate and the pipeline, verified with a curl.
Every later phase (desktop, dictionary, styles, mobile) builds on it.

## Scope

- Monorepo skeleton: root `package.json`, `pnpm-workspace.yaml`, `.nvmrc` (Node 24), base `tsconfig`, eslint, prettier, vitest; `packages/shared` and `apps/api` only.
- `packages/shared`: zod contracts for `POST /dictations` (request fields, response `{ raw, text, providers, latencyMs }`, error shapes).
- `apps/api`: two Lambdas bundled with esbuild for Node 24 ARM64:
  - `authorizer`: Lambda authorizer validating the Cognito access token (JWKS cached per execution environment), result cached 5 minutes, passes the user id.
  - `dictate`: `POST /dictations`. Quota check, Transcriber port with adapter `groq-whisper` (`whisper-large-v3-turbo`), silence guard, Refiner port with adapter `openai` (default model `gpt-5.4-nano`, configurable) using a fixed `plain` prompt and the locale, save `DICTATION#ts` (text, providers, per-stage latency, tokens, TTL 90 days), structured log and CloudWatch metrics per provider.
- `infra`: `environments/{core,dev,prd}`, `stacks/app`, `modules/aws/{lambda,http_api,cognito,dynamodb,secrets,acm}`.
  - core: GitHub OIDC provider, GitHub App wiring, Actions environments `dev` and `prd`, branch rulesets (`develop` requires `ci`, `main` requires `ci`).
  - stacks/app: HTTP API with custom domain `api.{env host}` (ACM in us-east-1, Route 53 record), authorizer attached, `dictate` Lambda (1024 MB, 60 s), table `take-my-word-{env}` (PK `USER#id`, SK item kind, TTL attribute, stream NEW_IMAGE enabled, on-demand), Cognito user pool (Essentials, username/password, no self sign-up, access 1 h, refresh 10 years with rotation, device tracking) with one app client for native apps (SRP, no secret), Secrets Manager secret `take-my-word-{env}/providers` with empty placeholders, deploy role per env scoped to the repo's Actions environment with `UpdateFunctionCode` on `dictate` and `authorizer`; dev only: debug bucket with one-day lifecycle, off by default.
  - Applied by the crew: `core` and `dev`. `prd` is written and planned but not applied in this task.
- `.github/workflows`: `ci.yml` (lint, typecheck, unit, `terraform fmt -check` and `validate`), `deploy-dev.yml` on `develop` and `deploy-prd.yml` on `main` calling `reusable-deploy.yml` (build, `update-function-code`, `wait function-updated-v2`), path-filtered to `apps/api`, `packages/shared`, workflows; the dev deploy opens the promotion PR `develop -> main`.
- A Cognito user for Sebastian in dev, created by the crew with a temporary password.
- Docs: `docs/TRD.md` verification table filled with the real commands; module docs updated by `document-task`.

## Out of scope

- `api` Lambda and every CRUD route (`GET /dictations`, dictionary, styles, settings): phases 3 and 5.
- Dictionary projections and style prompts: phase 3; the refiner uses the fixed `plain` prompt now.
- `apps/web`, `apps/desktop`, `apps/mobile` and their infra (OpenNext, CloudFront): later phases.
- `x-api-key` service credential, Google sign-in, managed login.
- Applying `prd`: deferred until desktop is usable (end of phase 2).
- Warm pings, provisioned concurrency: `_drafts/latency.md`.
- Deferred: Opus input; the `dictionary-usage` stream consumer (phase 3) although the stream is enabled now.

## Acceptance

1. `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test` pass at the root; `terraform fmt -check -recursive` and `terraform validate` pass for core, dev and prd.
2. `terraform apply` of `core` and `dev` succeeds from a fresh init against the state bucket in the account; `prd` plans cleanly.
3. A curl to `https://api.dev.takemyword.fless.dev/dictations` without a token answers 401; with an expired or foreign token answers 401 or 403.
4. With Sebastian's dev user token and a 5 to 10 s Spanish WAV (16 kHz mono 16-bit), the response is 200 with `raw`, `text`, `providers` (`groq-whisper`, `openai:gpt-5.4-nano`), per-stage `latencyMs`, and `text` has no fillers and correct punctuation; the same with an m4a.
5. A near-silent 2 s recording answers 200 with empty `text` and the refiner is not called (visible in the structured log).
6. A WAV over 4 MB or an unsupported content type answers 413 or 415; a malformed body answers 400.
7. After 60 minutes of audio in a UTC day the next request answers 429 with a message naming the daily limit; the counter resets at UTC midnight.
8. The saved `DICTATION#ts` item holds text, providers, latency and tokens, no audio, and a TTL 90 days out; no bucket holds audio unless the dev debug flag is on.
9. Merging to `develop` runs `ci` and `deploy-dev`, which updates both functions' code via OIDC with no AWS key in GitHub, and opens the promotion PR.
10. Unit tests cover the ports with fake adapters: quota arithmetic, silence guard, response mapping, authorizer token checks.

## Approach

- Layout: pnpm workspace, `workspaceConcurrency: 1`, root scripts fan out with `pnpm -r`; esbuild bundles each Lambda from `apps/api/src/{dictate,authorizer}/handler.ts` into `dist/{name}.zip`.
- Ports and adapters: `Transcriber` and `Refiner` interfaces in `apps/api/src/dictation/ports`, adapters under `providers/`, selected by a registry from `sttProvider` and `refineProvider` in the request, defaulting to `groq-whisper` and `openai`; unknown provider answers 400. Alternative rejected: direct provider calls; reason: the ports are the product's seam for later providers.
- Request transport: API Gateway HTTP API with binary bodies base64-encoded to Lambda; the synchronous Lambda payload limit is 6 MB, so raw audio is capped at 4 MB (about 2 minutes of WAV, about 8 minutes of m4a). Alternative rejected: presigned S3 upload; reason: audio must not be persisted, and one request keeps the clients simple. Supersedes the 5 MB figure in the docs.
- Body: `multipart/form-data` with `audio` plus a JSON `meta` part `{ locale, sttProvider?, refineProvider? }`; `styleId` and `appId` are accepted by the contract and ignored until phase 3. Alternative rejected: raw audio body with query parameters; reason: one contract for every client with room for fields.
- Quota: item `QUOTA#YYYY-MM-DD` under the user's partition, atomic `ADD seconds` with a condition on the cap, TTL 2 days; the audio duration is read from the WAV header or the m4a container before any provider call. Alternative rejected: counting dictations; reason: minutes are what the providers bill.
- Silence guard: discard transcripts that are empty, whitespace or match a configured list of Whisper silence hallucinations (Spanish and English); return 200 with empty `text` and `skipped: "silence"`.
- Refiner prompt: one `plain` system prompt per locale pair, in `apps/api/src/dictation/prompts`, versioned by file; it strips fillers, fixes punctuation and casing, keeps meaning, outputs text only.
- Secrets: one JSON secret with `GROQ_API_KEY` and `OPENAI_API_KEY`, fetched once per execution environment; Sebastian writes the values after the first apply.
- Metrics: `TakeMyWord/Dictation` namespace, per provider: latency, input tokens, output tokens, errors; structured JSON logs with request id, user id, stage timings.
- Authorizer: `aws-jwt-verify` against the pool's JWKS, access token with the app client id; response caches 5 minutes on the token. Alternative rejected: the HTTP API's built-in JWT authorizer; reason: the `x-api-key` credential will join the same gate later.

## Database

- Owns `DICTATION#ts` and `QUOTA#date` under `USER#{sub}` in `take-my-word-{env}`; creates the table with TTL and stream.
- References `USER` (no item written yet; the Cognito `sub` is the partition key).
- Invariants: dictations are written once; audio never stored; TTL set on every dictation and quota item.

## Infra

- Account `takemyword` 115891590483, profile `fless-takemyword`, us-east-1.
- State bucket `takemyword-terraform-state-115891590483`, created by hand by the crew (versioned, encrypted, public access blocked), outside Terraform.
- core: OIDC provider, GitHub App provider wiring (app id, installation id as locals; pem as `github_app_pem` tfvar), Actions environments with branch policies, rulesets.
- dev (applied) and prd (planned only): HTTP API + custom domain + ACM + Route 53, `dictate` and `authorizer` Lambdas, table, Cognito pool and client, secret, deploy role, Actions variables (`AWS_ROLE_ARN`, function names) written by Terraform; dev debug bucket.
- Env vars for `dictate`: `TABLE_NAME`, `PROVIDERS_SECRET_ID`, `DAILY_QUOTA_MINUTES=60`, `DEBUG_BUCKET` (dev, optional), `SILENCE_PHRASES` file bundled.
- IAM: `dictate` reads the secret and writes the table; `authorizer` nothing beyond logs; deploy role `lambda:UpdateFunctionCode` and `GetFunction` on the two functions.
- CI: `ci.yml`, `deploy-dev.yml`, `deploy-prd.yml`, `reusable-deploy.yml`.
- Cost: inside the free tier plus provider usage.

## Design

None.

## Risks

- The GitHub App used by the other project's Terraform is installed on this repo (Sebastian, 2026-10-20); the crew takes app id, installation id and the pem from that project's `infra/environments/core` locals and tfvars. Groq and OpenAI (service account in an OpenAI project `take-my-word`) keys live in the root `.env`; the crew writes the secret from it without printing the values.
- The GPT-6 Luna and Groq Whisper APIs may differ from what the docs assume; the adapters isolate it.
- ACM validation and the HTTP API custom domain add minutes to the first apply.
- Node 24 Lambda runtime and `aws-jwt-verify` versions must be checked at implementation.

## Depends on

None.

## Context & decisions

Consolidated 2026-10-20; answers by Sebastian through the om-manager unless marked (om-reviewer).

- Secrets: `.env` at the worktree root (gitignored) holds `OPENAI_API_KEY`, `GROQ_API_KEY`, `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PEM`; never commit, print or log a value.
  Adjusts Risks: the crew writes the provider secret from `.env` (`put-secret-value` fed by stdin), Sebastian no longer does; Terraform keeps the placeholder version and ignores `secret_string` changes.
  The pem reaches Terraform only as `TF_VAR_github_app_pem` from `.env`, no tfvars copy; app and installation ids stay as locals (om-reviewer).
- Scope added: `docs/TRD.md` declares `.env` under Workspace files.
- Scope added: dev user `crew-e2e` with a generated permanent password stored in `.env`, plus an SRP token script in `apps/api/scripts`; Sebastian's user keeps its temporary password and he completes first sign-in himself; the app client stays SRP and refresh only.
- Scope added: the crew pushes `main` at `origin/develop` before applying core; both rulesets give the admin role bypass `always` so the om-manager's docs commits on `develop` still land.
- `DICTATION#ts` also stores `raw`; silence-skipped dictations are not saved (om-reviewer); SK sortable by time, unique, written with `attribute_not_exists`.
- Quota: allowed while used is under the cap, so the last request may overshoot by one recording; charged the real duration before transcription, no Groq 10 s minimum, no refund on provider failure, silence charged (om-reviewer).
- Scope deferred: the per-user quota override in `docs/modules/dictation/prd.md` waits for the task that writes `USER`; `DAILY_QUOTA_MINUTES` is the only knob.
- Auth debt accepted: a revoked session keeps working until its access token expires (up to 1 h plus the 5 min authorizer cache); `document-task` records it in `docs/modules/auth/ard.md` and corrects `prd.md` Stay signed in.
- Acceptance 9 is proven after merge: the om-manager checks the first `deploy-dev` run and the promotion PR, a failure becomes a fix task; the promotion PR is not merged until `prd` is applied.
- Pre-merge e2e (om-reviewer): first apply creates the Lambdas from a stub zip; the crew then pushes dev code from this machine with the same `update-function-code` and `wait function-updated-v2` commands as `reusable-deploy.yml`.
- Test audio: Polly-generated Spanish samples with written fillers (WAV 16 kHz mono 16-bit and m4a), a near-silent 2 s file and a file just over 4 MB, all in the workspace, never committed; Acceptance 7 is tested by seeding the `QUOTA` item for `crew-e2e`.
- Scope and Acceptance 4 adjusted: the `openai` refiner defaults to `gpt-5.4-nano` (Sebastian has OpenAI credits), so `providers` reads `openai:gpt-5.4-nano`; the model is adapter configuration, `gpt-6-luna` one setting away; Goal still names GPT-6 Luna and is unchanged.
- The `groq-whisper` model `whisper-large-v3-turbo` is adapter configuration too, so `whisper-large-v3` is one setting away.
- Delivery (om-reviewer): one branch, no phases, three review milestones: (1) monorepo, shared, api with unit tests; (2) infra, state bucket, core and dev apply, prd plan, e2e for Acceptance 2 to 8; (3) workflows and the TRD verification table.

Constraints:

- `docs/modules/infra/trd.md`: the Lambda module ignores `filename`, `source_code_hash` and `publish`; deploy role only `UpdateFunctionCode` and `GetFunction` on the two functions; OIDC trust pinned to `repo:sebasfles/take-my-word:environment:{env}` and `aud` `sts.amazonaws.com` (public repo).
- `docs/modules/infra/database.md`: one table, secret and pool per env, all names env-suffixed (dev and prd share the account); TTL on one attribute for every item; stream NEW_IMAGE stays on; only `dictate` reads the secret; prd has no debug bucket.
- Debug bucket: dev only, public access blocked, one-day lifecycle; `DEBUG_BUCKET` is set on `dictate` only when a `debug_audio` variable, default false, is on.
- `ci.yml`: job named `ci`, no path filter, runs on PRs to `develop` and `main` and on push to `develop`, so the GITHUB_TOKEN promotion PR finds `ci` on its head, as in my-napkin.
- `docs/modules/auth/database.md`: the user id comes only from the authorizer context; the authorizer checks `token_use` access and the client id.
- Metrics through CloudWatch Embedded Metric Format; logs never carry audio, `raw` or `text`; log groups have a set retention.
- 415 is decided by the request or audio part content type; content that does not parse as its declared container answers 400; the 4 MB cap applies to the audio part; record what API Gateway answers above about 4.4 MB.
- `dictate` is a plain handler; Hono stays for the future `api` Lambda (om-reviewer).
- Tests run serially (vitest without file parallelism), per the root `CLAUDE.md`.

Review focus beyond the Pipeline: secret values never reach git, logs, plan output or messages; quota condition under concurrent requests; the size limit at the edges.

clearance: full: AWS account 115891590483 (profile `fless-takemyword`) for the state bucket, core and dev apply, prd plan, Cognito users, secret value and dev code pushes; GitHub `sebasfles/take-my-word` for `main`, rulesets, environments and variables through the App, and the PR.

## om-developer notes

### Round 1 (milestone 1: monorepo, shared, api with unit tests)

Done:

- Root pnpm workspace (`workspaceConcurrency: 1`, `onlyBuiltDependencies: esbuild`), `.nvmrc` 24, `tsconfig.base.json` (strict, bundler resolution, no emit), flat eslint (`strictTypeChecked` plus prettier), prettier, vitest with `fileParallelism: false` and `--no-file-parallelism`.
- `packages/shared`: request meta, response, error and audio constants in `src/dictations.ts` and `src/errors.ts`.
- `apps/api`: `authorizer` and `dictate` handlers, the pipeline in `src/dictation/dictate.ts`, ports, `groq-whisper` and `openai` adapters, WAV and m4a duration probes, multipart reader, quota and dictation stores on DynamoDB, silence guard, `plain` v1 prompt, EMF metrics, JSON logs, provider secret cache, dev debug audio sink, esbuild build to `dist/{dictate,authorizer}.zip`.
- 96 unit tests: shared meta contract; probes; upload limits and content types; quota window; DynamoDB adapters with a fake client; secret cache; both adapters with a fake fetch; the whole handler with fake ports (200 WAV and m4a, silence, quota overshoot, 429, UTC reset, 400, 413, 415, 502, 500, metrics, no text in logs); the authorizer with real `aws-jwt-verify` against locally signed RS256 tokens.
- Checked by hand, not committed: the built bundles load on Node 24 and answer 415 and 400; the probes read real ffmpeg WAV and m4a files (mdat first and faststart) to the exact duration.
- `docs/TRD.md`: api and shared rows of the verification table, so `verify-task` has commands; the rest of the table waits for milestone 3.

Decisions the plan did not record:

- TypeScript 6.0.3, not 7.0: `typescript-eslint` 8.72 supports TypeScript below 6.1 only.
- pnpm 10.34.7 pinned in `packageManager` (installed and current on the 10 line).
- `packages/shared` ships TypeScript source (`exports` to `src/index.ts`) with no build step; esbuild and vitest consume it directly.
- Response: `providers` is `{ transcriber, refiner? }`, `latencyMs` is `{ quota, transcribe, refine?, save?, total }`; on silence `refiner`, `refine` and `save` are absent.
- Errors: `{ error: { code, message } }` with codes `bad_request` 400, `payload_too_large` 413, `unsupported_media_type` 415, `quota_exceeded` 429, `provider_failed` 502, `internal` 500; 401 and 403 come from API Gateway with its own body.
- Provider labels: the transcriber reports `groq-whisper` without its model (Acceptance 4), the refiner `openai:{model}`; models come from `GROQ_WHISPER_MODEL` and `OPENAI_MODEL`, defaulting to `whisper-large-v3-turbo` and `gpt-5.4-nano`.
- Locale is `es` or `en` with an optional region (`es-CO`); the prompt and Whisper's `language` follow the language, so "one prompt per locale pair" reads as one per language.
- The refiner uses the Responses API with `instructions` plus the transcript as `input`, `store: false`, no reasoning setting (the model default is `none`); a response that is not `completed` is a provider failure, never partial text.
- The 4 MB cap is 4 MiB (4,194,304 bytes) on the audio part; a body over 4 MiB plus 64 KiB answers 413 before parsing.
- `meta` is accepted as a plain field or as a JSON file part, so React Native's `FormData` can send it.
- Audio types: `audio/wav`, `audio/wave`, `audio/x-wav`, `audio/vnd.wave` are WAV; `audio/mp4`, `audio/m4a`, `audio/x-m4a` are m4a.
- WAV duration is the data chunk over the byte rate, for any PCM layout, capped by the bytes present; m4a duration is `mvhd`, falling back to `mehd` for fragmented files.
- Table attributes: keys `PK` and `SK`, TTL attribute `expiresAt` (epoch seconds) on every item, quota counter `seconds`; dictation SK is `DICTATION#{ISO time}#{Lambda request id}`. Infra must enable TTL on `expiresAt`.
- The silence list holds common Whisper hallucinations in both languages, compared without case, punctuation or brackets; a recording that is only "Gracias." or "Thank you." is treated as silence.
- Each provider call times out at 25 s; failures log the provider and HTTP status only, never the provider's body; unhandled errors log their name only.
- Provider keys load on the first request, not at init, and a failed read is not cached; the empty placeholders answer 500.
- Debug audio goes to `{userId}/{ISO time}-{request id}.{ext}` after the quota charge, and a failed write is logged, not fatal.
- Authorizer env is `USER_POOL_ID` and `USER_POOL_CLIENT_ID`; it returns HTTP API simple responses with `context.userId`, so the API needs payload format 2.0, simple responses and identity source `$request.header.Authorization`.
- Bundles are ESM `index.mjs` (handler `index.handler`), minified with names kept, with source maps and a `createRequire` banner for CommonJS dependencies; the AWS SDK is bundled, not taken from the runtime.

Pending for milestone 2: infra modules and stacks, the state bucket, `core` and `dev` apply, `prd` plan, `crew-e2e` and the SRP token script in `apps/api/scripts`, Lambda `NODE_OPTIONS=--enable-source-maps`, e2e for Acceptance 2 to 8, and the api e2e row of the TRD.
Pending for milestone 3: workflows, the rest of the TRD verification table, `.env` under Workspace files.

Deferred: an integration test of the quota condition against DynamoDB Local; the unit tests cover the adapter's mapping and the pipeline's arithmetic, and Acceptance 7 covers the real condition.

### Round 2 (round 1 findings, 4 of 4 applied)

1. Charged duration no longer trusts the header alone.
   - WAV must be 16 kHz mono 16-bit PCM, the documented desktop contract, or it answers 400; that fixes the byte rate, so the charge is the bytes after the data chunk header over 32,000 B/s, whatever data size the header declares.
   - m4a is charged the larger of the declared duration and the payload at 320 kbps (40,000 B/s), the plausible AAC maximum; I picked charging the floor over answering 400, so a legitimate high-bitrate file never fails.
   - Anything under `minAudioSeconds` (0.5 s, now in `packages/shared` so clients drop the same recordings) answers 400 before the charge.
   - Tests: data size 0 and 2 charged by bytes, 48 kHz, stereo and 8-bit rejected, 0 and 0.4 s too short, a 1-unit `mvhd` on 400 KB and 800 KB payloads charged the floor, plus the handler's 400 without charge.
2. The silence list is split into `hallucinations` (always silence) and `ambiguous` (`Gracias.`, `Thank you.`, `Chao.` and the like), which are silence only when the transcriber reports no speech.
   - The Transcriber port returns an optional `noSpeechProbability`; `groq-whisper` asks for `verbose_json` and reports the lowest `no_speech_prob` across segments, so one spoken segment counts as speech; no segments means no signal, and an ambiguous phrase without a signal is refined.
   - Threshold `SILENCE_NO_SPEECH_THRESHOLD`, default 0.6 (Whisper's own `no_speech_threshold`), inclusive.
   - Tests prove both directions in `silence.test.ts` and `app.test.ts`.
3. The Groq label is `groq-whisper:{model}`, so saved items and metrics carry `groq-whisper:whisper-large-v3-turbo`.
4. The quota store test asserts the Key (`USER#u1`, `QUOTA#2026-10-20`) and resolves the update and condition placeholders to `seconds` 12, cap 3600 and `expiresAt`; the real condition semantics stay with the Acceptance 7 e2e in milestone 2.

Pending and deferred: unchanged from round 1.

### Round 3 (milestone 2: infra, applies, e2e)

Done:

- `infra/modules/aws/{lambda,http_api,cognito,dynamodb,secrets,acm}`, `infra/stacks/app`, `infra/environments/{core,dev,prd}`, and `infra/scripts/tf <env> <args>`, which sets `TF_VAR_github_app_pem` from `.env` and the `fless-takemyword` profile.
- `apps/api/scripts/srp.ts` and `sign-in.ts` (Cognito SRP on the AWS SDK), `pnpm token` (prints a `crew-e2e` access token), and the e2e suite `apps/api/e2e/dictations.e2e.ts` run by `pnpm e2e`, with Polly speech generated per run.
- Silence by measured level, per the om-reviewer's approval: the WAV probe reports a sustained level, `dictate` skips WAV under `SILENCE_FLOOR_DBFS` before the quota charge and any provider call, and ambiguous phrases are silence only on WAV under `SPEECH_LEVEL_DBFS`; `noSpeechProbability` and `verbose_json` are gone.
- `docs/TRD.md`: api e2e row.

External actions (clearance `full`, account 115891590483, profile `fless-takemyword`, us-east-1):

| Command | Target | Env | Result |
|---|---|---|---|
| `s3api create-bucket`, `put-public-access-block`, `put-bucket-versioning`, `put-bucket-encryption`, `put-bucket-ownership-controls` | `takemyword-terraform-state-115891590483` | account | created: versioned, AES256, public access blocked, bucket owner enforced |
| `git push origin origin/develop:refs/heads/main` | `sebasfles/take-my-word` | GitHub | run by the om-reviewer; `main` at 8114686 |
| `infra/scripts/tf core apply` | OIDC provider, Actions environments `dev` and `prd` with branch policies, rulesets `protect-develop` and `protect-main`, workflow permissions | core | 8 added |
| `infra/scripts/tf dev apply` | the app stack | dev | 37 added; re-plan afterwards: no changes |
| `infra/scripts/tf dev apply -var debug_audio=true`, then without it | `dictate` env and policy, debug bucket | dev | 2 changed each way; the one object written was removed with `s3 rm` |
| `infra/scripts/tf prd plan` | the app stack | prd | 34 to add, 0 to change, 0 to destroy; not applied |
| `cognito-idp admin-create-user`, `admin-set-user-password --permanent` | `crew-e2e` | dev pool `us-east-1_9g4xiMUfJ` | CONFIRMED |
| `cognito-idp admin-create-user` | `sebastian`, temporary password | dev pool | FORCE_CHANGE_PASSWORD |
| `secretsmanager put-secret-value` from `.env` through a 0600 temp file | `take-my-word-dev/providers` | dev | AWSCURRENT holds both keys; the placeholder is AWSPREVIOUS |
| `lambda update-function-code` plus `wait function-updated-v2` | `take-my-word-dev-dictate`, `take-my-word-dev-authorizer` | dev | updated several times; last at the code of 5d3d955 |
| `polly synthesize-speech` (Lupe es-US, Mia es-MX) | test audio in `.workspaces/0001_platform_skeleton/e2e/` | account | WAV 7.0 s, m4a 6.7 s; never committed |
| `dynamodb update-item` | `QUOTA#2026-10-21` of `crew-e2e` | dev | seeded 3595, 3590, then reset to 0 |
| Direct Groq `audio/transcriptions` calls (6) | near-silent, digital silence and speech samples | Groq | `no_speech_prob` is 0 on turbo for everything and 0.25 to 0.70 on v3; led to the level design |

Secret values were never printed, logged or committed; plan and apply outputs were scanned for key and pem patterns (0 hits), and `.env` gained `USER_POOL_ID`, `USER_POOL_CLIENT_ID`, `CREW_E2E_USERNAME`, `CREW_E2E_PASSWORD`, `SEBASTIAN_DEV_USERNAME`, `SEBASTIAN_DEV_TEMP_PASSWORD`, `API_URL`.

Evidence per acceptance criterion (dev, 2026-10-21 UTC):

1. `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test` at the root: exit 0 (7 and 112 tests); `terraform fmt -check -recursive` and `terraform validate` for core, dev and prd: exit 0 (verify.log).
2. `core` and `dev` applied from a fresh `init` against the state bucket (8 and 37 added); `prd` plans 34 to add, 0 to change, 0 to destroy.
3. `curl -X POST https://api.dev.takemyword.fless.dev/dictations` with the WAV sample: no header 401 `{"message":"Unauthorized"}`; `Bearer not.a.jwt` 403; an expired token signed by a foreign key with the pool's issuer and client id 403; `crew-e2e`'s real token with a rewritten `sub` 403 (all `{"message":"Forbidden"}`).
4. `pnpm token` plus `curl -F 'meta={"locale":"es-CO"}' -F "audio=@sample-es.wav;type=audio/wav"`: 200, `providers` `groq-whisper:whisper-large-v3-turbo` and `openai:gpt-5.4-nano`, `latencyMs` `{ quota 157, transcribe 1304, refine 1111, save 10, total 2587 }`.
   - WAV raw: "Eh, bueno, este, quería decirte que, mañana nos vemos a las 3 en la oficina, o sea, después del almuerzo."
   - WAV text: "Quería decirte que mañana nos vemos a las 3 en la oficina, después del almuerzo."
   - m4a (`audio/mp4`, `es-MX`): 200, same providers, `latencyMs` `{ quota 7, transcribe 383, refine 1765, save 6, total 2162 }`.
   - m4a raw: "Pues, eh, necesito que me mandes el informe, este, antes del viernes, porque, mmm, lo tengo que revisar con calma."
   - m4a text: "Necesito que me mandes el informe antes del viernes porque lo tengo que revisar con calma."
   - The first run kept "o sea"; the `plain` v1 prompt now names the common fillers per language, and the runs above are with it.
5. Near-silent 2 s WAV: 200 `{"raw":"","text":"","skipped":"silence","providers":{},"latencyMs":{"total":29}}`; log `dictation skipped`, `stage: level`, `sustainedLevelDbfs: -71`, no transcriber or refiner field and no provider metric; 2 s of digital silence the same (`total` 2). Before the level design the same file answered 200 with text "Gracias.", refined.
6. 4,224,078 B WAV 413 `payload_too_large`; 4,608,078 B WAV 413 from the handler; audio parts of 5, 6, 8 and 10.5 MiB 413 `{"message":"Request Entity Too Large"}` from API Gateway, so above about 4.7 MB of audio (the 6 MiB Lambda payload after base64) the gateway answers before the Lambda; exactly 4,194,304 B 200; `audio/ogg` part 415; raw `audio/wav` body 415; meta not JSON, no audio part, a truncated multipart body, an m4a declared as WAV and an unknown `refineProvider` 400.
7. `QUOTA#2026-10-21` of `crew-e2e` seeded to 3595 s: the next 7 s WAV 200, the one after 429 `{"error":{"code":"quota_exceeded","message":"Daily limit of 60 minutes of audio reached; it resets at 00:00 UTC."}}`, counter 3601.99, `expiresAt` 2026-10-23T00:00:00Z; the counter key is the UTC date, so the next UTC day starts a new item (unit test "allows the user again after UTC midnight"). Concurrency: seeded 3590, six parallel 7 s requests gave two 200 and four 429, counter 3603.98, so the cap is overshot by at most one recording.
8. Latest `DICTATION#2026-10-21T03:16:39.717Z#c181390e-...` holds `raw`, `text`, `locale`, `audioSeconds`, `providers`, `latencyMs`, `tokens` (214 in, 25 out), `createdAt`, `expiresAt` 90 days out, and no audio attribute; TTL is enabled on `expiresAt`; the debug bucket held nothing with `debug_audio` off, one `{userId}/{time}-{request}.m4a` with it on, and `DEBUG_BUCKET` is absent from `dictate` when off.

Decisions the plan did not record:

- Apply order: state bucket, core, dev (dev's deploy role federates with core's OIDC provider and writes variables into core's `dev` environment).
- Actions variables per environment, written by `stacks/app`: `AWS_ROLE_ARN`, `AWS_REGION`, `DICTATE_FUNCTION_NAME`, `AUTHORIZER_FUNCTION_NAME`; the deploy role trusts exactly `repo:sebasfles/take-my-word:environment:{env}` with `aud` `sts.amazonaws.com`.
- API: `api.dev.takemyword.fless.dev` and `api.takemyword.fless.dev`, execute-api endpoint disabled, stage throttling 10 requests per second with a burst of 20, JSON access logs without bodies, 30-day retention on every log group.
- HTTP API integrations time out at 30 s whatever the Lambda's timeout, so the provider timeouts are 10 s (Groq) and 15 s (OpenAI); `dictate` keeps 60 s per Scope.
- Lambda log format Text, so the raw JSON and EMF lines from stdout stay intact; `NODE_OPTIONS=--enable-source-maps` on both functions.
- Cognito: Essentials, passwords of 12 or more with upper, lower and number, recovery by admin only, devices always remembered without a device challenge; the client allows `ALLOW_USER_SRP_AUTH` only, because refresh token rotation (accepted at apply) renews through `GetTokensFromRefreshToken`, not `ALLOW_REFRESH_TOKEN_AUTH`; user existence errors hidden, token revocation on.
- SRP is implemented in `apps/api/scripts/srp.ts` (the 3072-bit group was checked as a safe prime) because `amazon-cognito-identity-js` is deprecated (Amplify v5 maintenance mode) and lint rejects it.
- Secret placeholder ignores `secret_string` and `version_stages`; recovery window 0 days in dev, 7 in prd; prd has point-in-time recovery and deletion protection on the table and the pool.
- Silence level: the probe reports the RMS of the fifth-loudest 30 ms frame, the level at least 150 ms of the recording reaches. This deviates from "no frame's RMS reaches the floor" because one full-scale click alone lifts its 30 ms frame to about -27 dBFS; four clicks in near-silence still measure -70 (unit test).
- Defaults from the dev samples, measured with the shipped probe: near-silent -70.6 dBFS, digital silence -inf, Polly speech -17.9, the same speech 20 dB down -37.9 and 30 dB down -47.9 (the quietest spoken sample, which Groq still transcribed correctly). So `SILENCE_FLOOR_DBFS` defaults to -55 (7 dB under the quietest speech, 15 dB over near-silence) and `SPEECH_LEVEL_DBFS` to -40, below which ambiguous phrases count as silence.
- Response contract: `providers.transcriber`, `latencyMs.quota` and `latencyMs.transcribe` are optional, because a level skip runs no provider; `dictation done` and transcript skips log `sustainedLevelDbfs` (rounded) for tuning.
- `.prettierignore` ignores `infra/`, so a root `prettier --write .` never walks provider binaries.

Debt for `document-task`:

- dictation: on m4a the level is not measured, so ambiguous phrases are always refined and only the unambiguous hallucinations drop; revisit in phase 4, when mobile drops silent recordings with expo-audio metering.
- dictation: loud non-speech noise can make Whisper loop on hallucination phrases mixed with fragments (4 MiB of pink noise gave "¡Suscríbete al canal! ¡Suscríbete al canal! al canal ¡Suscríbete al canal! Gracias por ver el video."), which the whole-transcript guard does not match and the refiner turns into text; revisit if it shows in real use.

Pending for milestone 3: workflows, the rest of the TRD verification table, `.env` under Workspace files.

### Round 4 (round 3 finding applied, milestone 3)

Finding 1, refresh with rotation, proven in dev for `crew-e2e` (statuses only, no token recorded):

- First attempt, with the client as applied: `GetTokensFromRefreshToken` without `DeviceKey` answered `NotAuthorizedException: Invalid Refresh Token.`, and the same with the unconfirmed `DeviceKey` that sign-in returns in `NewDeviceMetadata`.
- Cause: device remembering binds the refresh token to a confirmed device, not a missing auth flow; after `ConfirmDevice` (device SRP verifier in `apps/api/scripts/srp.ts`), refresh with that `DeviceKey` succeeds, so `ALLOW_USER_SRP_AUTH` alone stays and nothing was re-applied.
- (a) Refresh with the confirmed `DeviceKey` returns a new access token and a new refresh token (both differ from the originals).
- (b) The refreshed access token answers 200 on `POST /dictations` with the Polly WAV.
- (c) After 12 s the old refresh token answers `NotAuthorizedException: Refresh token reuse detected`, and the rotated token keeps refreshing (a third pair is issued).
- All three run in `pnpm e2e` ("refreshes a confirmed device's session with rotation..."), which forgets the device at the end; `crew-e2e` holds 0 devices after the run.
- Other observations for phase 2: inside the 10 s grace the old refresh token still refreshes, and doing so revokes the access token issued by the previous rotation.
- Device key on refresh: yes. With device remembering on, every client must call `ConfirmDevice` after its first sign-in, store `DeviceKey` (and `DeviceGroupKey`) with the refresh token, and pass `DeviceKey` on every refresh. Once confirmed, a refresh without it answers `Invalid Refresh Token.`, and an unconfirmed key is rejected too.

Milestone 3:

- `.github/workflows/ci.yml`: job `ci`, no path filter, on pull requests to `develop` and `main` and on push to `develop`; install, `pnpm lint` (which now ends with `pnpm lint:workflows`, actionlint), `pnpm typecheck`, `pnpm test`, `terraform fmt -check -recursive infra`, and `init -backend=false` plus `validate` for every environment.
- `reusable-deploy.yml`: environment from the caller, OIDC through `aws-actions/configure-aws-credentials` with `vars.AWS_ROLE_ARN` and `vars.AWS_REGION`, `pnpm --filter @take-my-word/api build`, then `update-function-code` and `wait function-updated-v2` for the authorizer and then `dictate`.
- `deploy-dev.yml` on `develop` and `deploy-prd.yml` on `main`, path-filtered to `apps/api/**`, `packages/shared/**`, `.github/workflows/**`, `package.json` and `pnpm-lock.yaml`; the dev deploy then opens the promotion pull request `develop -> main` when `develop` is ahead and none is open.
- `iam simulate-principal-policy` on `take-my-word-dev-deploy`: `UpdateFunctionCode` and `GetFunction` allowed on both dev functions; `UpdateFunctionConfiguration` and `DeleteFunction` denied on them, and every action denied on a prd function; trust is `StringEquals` on `sub` `repo:sebasfles/take-my-word:environment:dev` and `aud` `sts.amazonaws.com`.
- `docs/TRD.md`: the infra commands exact, a `workflows` row, `.env` keys under the api's Workspace files; web, desktop and mobile stay `unknown` until their first task.

Decisions the plan did not record:

- Clients must confirm their device and send `DeviceKey` on refresh (above); `scripts/sign-in.ts` now returns the refresh token and the device keys, and has `confirmDevice`, `refresh` and `forgetDevice`.
- The deploy path filter also covers `package.json` and `pnpm-lock.yaml`, because a dependency bump changes the bundle.
- Action majors: `actions/checkout@v7`, `actions/setup-node@v7`, `pnpm/action-setup@v6` (reads `packageManager`), `aws-actions/configure-aws-credentials@v6`, `hashicorp/setup-terraform@v4`.
- `github-actionlint` 1.7.12 at the root, run by `pnpm lint`.
- `deploy-prd` fails until `prd` is applied, since the `prd` environment has no variables yet; the promotion pull request is not merged before then, per Context & decisions.

Pending: Acceptance 9 after merge (the om-manager checks the first `deploy-dev` run and the promotion pull request).
