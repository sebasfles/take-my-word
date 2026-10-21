---
updated: 2026-10-21
source: 0009_web_account
---

# Dictation: technical

## Structure

| Path | What |
|---|---|
| `apps/api/src/dictate` | The `dictate` Lambda: plain handler, configuration, wiring |
| `apps/api/src/dictation` | The pipeline (`dictate.ts`), upload reader, audio probes, quota, silence guard, prompts, the profile read, refiner instructions, stores |
| `apps/api/src/history`, `apps/api/src/settings` | History and settings routes in the `api` Lambda, with their stores |
| `apps/api/src/dictation/ports`, `providers` | Transcriber and Refiner ports; adapters `groq-whisper` and `openai` |
| `packages/shared/src/dictations.ts`, `history.ts`, `settings.ts` | Request meta, response, history page, settings and limits shared by every client |
| `apps/web` | Account and history pages; `DELETE /api/dictations/[id]` forwards a delete with the session's token |

## Endpoints owned

| Method | Route | Purpose | Spec |
|---|---|---|---|
| POST | `/dictations` | Multipart `audio` (WAV 16 kHz mono 16-bit or m4a, at most 4 MiB) plus JSON `meta`; raw and clean text out; served by `dictate` | zod in `packages/shared` |
| GET | `/dictations` | The user's history, newest first, `limit` and opaque `cursor`; expired items are hidden before TTL removes them; served by `api` | zod in `packages/shared` |
| DELETE | `/dictations/{id}` | Remove one dictation by its opaque `id`; served by `api` | zod in `packages/shared` |
| GET | `/me/settings` | The user's settings, created with defaults on the first read; served by `api` | zod in `packages/shared` |
| PUT | `/me/settings` | Replace the settings; the default style must exist; served by `api` | zod in `packages/shared` |

Above about 4.7 MB of audio the request no longer fits the 6 MiB Lambda payload once base64-encoded, and API Gateway answers 413 with its own body before `dictate` runs.
The HTTP API cuts every request at 30 s, so provider calls time out at 10 s (Groq) and 15 s (OpenAI).

## Pipeline

1. Probe: the container must parse as declared (else 400); the charged duration comes from the bytes (WAV) or the larger of the header and the payload at 320 kbps (m4a); under 0.5 s answers 400.
2. Level (WAV only): under `SILENCE_FLOOR_DBFS` the request answers empty text before any charge or provider call.
3. Quota and profile, concurrently: the duration is charged to the user's UTC day before any provider call (at or over the cap the request answers 429), while one round trip reads settings, the app rule, custom styles and the dictionary.
4. Transcribe with the request's Transcriber, else the settings', else `groq-whisper`, prompted with the top dictionary terms.
5. Silence guard: empty transcripts and known hallucinations answer empty text; ambiguous phrases ("Gracias.") only when the WAV is under `SPEECH_LEVEL_DBFS`.
6. Refine with the request's Refiner, else the settings', else `openai`: the `plain` editing rules of the locale's language, the resolved style and the full dictionary (see styles and dictionary).
7. Save `DICTATION#ts` with the `styleId` used and respond with raw, text, `styleId`, providers and per-stage latency (`profile` included).

Each provider call emits one CloudWatch EMF record in `TakeMyWord/Dictation` per `Provider` (latency, errors, tokens); logs are JSON lines that never carry audio, raw or clean text.

## Depends on

- auth: the authorizer's `userId`.
- infra: HTTP API, the `dictate` Lambda, table `take-my-word-{env}`, secret `take-my-word-{env}/providers`.
- Groq and OpenAI over HTTP; dictionary (terms and ranking) and styles (prompts and resolution).

## Depended on by

- desktop and mobile, which post audio; dictionary, which reads the table stream; styles, whose default lives in settings.

## Configuration

Lambda environment, set by `infra/stacks/app`: `TABLE_NAME`, `PROVIDERS_SECRET_ID`, `DAILY_QUOTA_MINUTES`, `DEBUG_BUCKET` (dev, only while `debug_audio` is on).
Optional, with code defaults: `GROQ_WHISPER_MODEL` (`whisper-large-v3-turbo`), `OPENAI_MODEL` (`gpt-5.4-nano`), `SILENCE_FLOOR_DBFS` (-55), `SPEECH_LEVEL_DBFS` (-40), `DICTIONARY_HALF_LIFE_DAYS` (30), `STT_PROMPT_TOKEN_BUDGET` (224); Terraform sets the last two.

## Testing

- Unit tests next to the code with fake ports; `pnpm e2e` in `apps/api` runs the deployed path against `API_URL` (see TRD).
- `apps/web` `pnpm e2e` seeds a throwaway user through the API, pages history with `?limit=1`, and deletes a dictation through CloudFront.
