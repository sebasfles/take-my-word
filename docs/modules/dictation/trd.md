---
updated: 2026-10-24
source: 0018_fast_providers_eval
---

# Dictation: technical

## Structure

| Path | What |
|---|---|
| `apps/api/src/dictate` | The `dictate` Lambda: plain handler, configuration, wiring |
| `apps/api/src/dictation` | The pipeline (`dictate.ts`), the language choice (`language-selection.ts`), upload reader, audio probes, quota, silence guard, prompts, the profile read, refiner instructions, stores |
| `apps/api/src/history`, `apps/api/src/settings`, `apps/api/src/usage` | History, settings and usage routes in the `api` Lambda, with their stores |
| `apps/api/src/dictation/ports`, `providers` | Transcriber and Refiner ports; registered adapters `groq-whisper` and `openai`; `openai-transcribe`, `together-transcribe`, `groq-chat` and `cerebras-chat` (the last two on one chat-completions helper) exist for the evaluation and are not registered |
| `apps/api/src/eval` | The dev-only eval Lambda: calls one adapter, or production's `dictate()` with candidate adapters and fake quota, store and profile, per invocation and returns timings, new connections, rate-limit headers and usage; reads its four provider keys through its own loader; never in a production bundle |
| `apps/api/evaluation` | The evaluation harness: suites, fixtures, checks, pacing and reports |
| `packages/shared/src/dictations.ts`, `history.ts`, `settings.ts`, `usage.ts` | Request meta, response, history page, settings with the user context's pick ids, usage and limits shared by every client |
| `apps/web` | Account (settings read-only, dictation languages as a localized list, context picks as badges, today's usage) and history pages; `DELETE /api/dictations/[id]` forwards a delete with the session's token |

## Endpoints owned

| Method | Route | Purpose | Spec |
|---|---|---|---|
| POST | `/dictations` | Multipart `audio` (WAV 16 kHz mono 16-bit or m4a, at most 4 MiB) plus JSON `meta`; raw and clean text out; served by `dictate` | zod in `packages/shared` |
| GET | `/dictations` | The user's history, newest first, `limit` and opaque `cursor`; expired items are hidden before TTL removes them; served by `api` | zod in `packages/shared` |
| DELETE | `/dictations/{id}` | Remove one dictation by its opaque `id`; served by `api` | zod in `packages/shared` |
| GET | `/me/settings` | The user's settings, created with defaults on the first read, with `locale` derived from the first dictation language; served by `api` | zod in `packages/shared` |
| PUT | `/me/settings` | Replace the settings; the default style must exist; leaving out `dictationLanguages` or `context` keeps the stored ones and `locale` is ignored; served by `api` | zod in `packages/shared` |
| GET | `/me/usage` | Today's charged seconds, the cap and the next UTC midnight; served by `api` | zod in `packages/shared` |

Above about 4.7 MB of audio the request no longer fits the 6 MiB Lambda payload once base64-encoded, and API Gateway answers 413 with its own body before `dictate` runs.
The HTTP API cuts every request at 30 s, so provider calls time out at 10 s (Groq) and 15 s (OpenAI).

## Pipeline

1. Probe: the container must parse as declared (else 400); the charged duration comes from the bytes (WAV) or the larger of the header and the payload at 320 kbps (m4a); under 0.5 s answers 400.
2. Level (WAV only): under `SILENCE_FLOOR_DBFS` the request answers empty text before any charge or provider call.
3. Quota and profile, concurrently: the duration is charged to the user's UTC day before any provider call (at or over the cap the request answers 429), while one round trip reads settings, the app rule, custom styles and the dictionary.
4. Transcribe with the request's Transcriber, else the settings', else `groq-whisper`, prompted with the top dictionary terms: in the one dictation language, or with detection among several, and again in the first language when the detected one is neither.
5. Silence guard: empty transcripts and known hallucinations answer empty text; ambiguous phrases ("Gracias.") only when the WAV is under `SPEECH_LEVEL_DBFS`.
6. Refine with the request's Refiner, else the settings', else `openai`: the `plain` editing rules of the language used, the resolved style and the full dictionary (see styles and dictionary).
7. Save `DICTATION#ts` with the `styleId` and language used and respond with raw, text, `styleId`, providers and per-stage latency (`profile` included).

Each provider call emits one CloudWatch EMF record in `TakeMyWord/Dictation` per `Provider` (latency, errors, tokens); logs are JSON lines that never carry audio, raw or clean text.

## Depends on

- auth: the authorizer's `userId`.
- infra: HTTP API, the `dictate` Lambda, table `take-my-word-{env}`, secret `take-my-word-{env}/providers`.
- Groq and OpenAI over HTTP; dictionary (terms and ranking) and styles (prompts and resolution).

## Depended on by

- desktop and mobile, which post audio; dictionary, which reads the table stream; styles, whose default lives in settings.

## Configuration

Lambda environment, set by `infra/stacks/app`: `TABLE_NAME`, `PROVIDERS_SECRET_ID`, `DAILY_QUOTA_MINUTES`, `DEBUG_BUCKET` (dev, only while `debug_audio` is on); the `api` Lambda also requires `DAILY_QUOTA_MINUTES` at cold start, for `/me/usage`.
Optional, with code defaults: `GROQ_WHISPER_MODEL` (`whisper-large-v3-turbo`), `OPENAI_MODEL` (`gpt-5.4-nano`), `SILENCE_FLOOR_DBFS` (-55), `SPEECH_LEVEL_DBFS` (-40), `DICTIONARY_HALF_LIFE_DAYS` (30), `STT_PROMPT_TOKEN_BUDGET` (224); Terraform sets the last two.

## Testing

- Unit tests next to the code with fake ports; `pnpm e2e` in `apps/api` runs the deployed path against `API_URL` (see TRD), including English and Spanish recordings under each set of dictation languages.
- The desktop's serde mirror of the dictation, error, settings, style and app rule contracts is checked against JSON Schema generated from `packages/shared`, so changing a contract fails `ci` until `pnpm contract` in `apps/desktop` and the mirror follow.
- `apps/web` `pnpm e2e` seeds a throwaway user through the API, pages history with `?limit=1`, and deletes a dictation through CloudFront.
- A unit test pins the Whisper prompt and the refiner instructions to literals of 0014's output, with a context set or not.
- The evaluation harness in `apps/api` (0017, 0018) runs from the repository root with `pnpm --filter @take-my-word/api <command>`: `eval:transcription` and `eval:cleanup` measure candidates through the dev eval Lambda on the frozen `evaluation/*.fixtures.json` (samples of 30 to 120 s are their own bucket), `eval:chain` turns suite 1's raws into chained cleanup cases with hand-written `chained-checks.json`, `eval:dictate` runs production's `dictate()` in the eval Lambda per combination, `eval:summary` ranks the passing combinations by release to text, `eval:e2e` dictates through the dev API with a throwaway user, `eval:reproduce` compares two transcription runs and `eval:capture` lists wrong raws.
  Each needs `evalFunction` on in `deployment.json` and the deployment's profile, prints an estimated cost and refuses above 3 USD per run with speech synthesis included, refuses a call that would take a prepaid balance under its floor, keeps production's share of every free plan (fixed floors of each reported allowance on paid plans), and resumes a paused run only with the same requests and eval bundle; reports live in `docs/tasks/0017_eval_harness/` and `docs/tasks/0018_fast_providers_eval/`.
- `pnpm eval:context <report.md>` (0015) dictates `evaluation/user-context.samples.json` with and without the user's context; its round 2 found no gain (domain-term errors 35 and 34 under one language, 34 and 34 under both), which is why dictation ignores the context.
