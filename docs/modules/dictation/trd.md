---
updated: 2026-10-21
source: 0001_platform_skeleton
---

# Dictation: technical

`POST /dictations` is built; the history route waits for phase 5.

## Structure

| Path | What |
|---|---|
| `apps/api/src/dictate` | The `dictate` Lambda: plain handler, configuration, wiring |
| `apps/api/src/dictation` | The pipeline (`dictate.ts`), upload reader, audio probes, quota, silence guard, prompts, stores |
| `apps/api/src/dictation/ports`, `providers` | Transcriber and Refiner ports; adapters `groq-whisper` and `openai` |
| `packages/shared/src/dictations.ts` | Request meta, response and limits shared by every client |
| `apps/web` | History screen (phase 5) |

## Endpoints owned

| Method | Route | Purpose | Spec |
|---|---|---|---|
| POST | `/dictations` | Multipart `audio` (WAV 16 kHz mono 16-bit or m4a, at most 4 MiB) plus JSON `meta`; raw and clean text out; served by `dictate` | zod in `packages/shared` |
| GET | `/dictations` | The user's history, last 90 days; served by `api` (phase 5) | none yet |

Above about 4.7 MB of audio the request no longer fits the 6 MiB Lambda payload once base64-encoded, and API Gateway answers 413 with its own body before `dictate` runs.
The HTTP API cuts every request at 30 s, so provider calls time out at 10 s (Groq) and 15 s (OpenAI).

## Pipeline

1. Probe: the container must parse as declared (else 400); the charged duration comes from the bytes (WAV) or the larger of the header and the payload at 320 kbps (m4a); under 0.5 s answers 400.
2. Level (WAV only): under `SILENCE_FLOOR_DBFS` the request answers empty text before any charge or provider call.
3. Quota: the duration is charged to the user's UTC day before any provider call; at or over the cap the request answers 429.
4. Transcribe with the chosen Transcriber (default `groq-whisper`).
5. Silence guard: empty transcripts and known hallucinations answer empty text; ambiguous phrases ("Gracias.") only when the WAV is under `SPEECH_LEVEL_DBFS`.
6. Refine with the chosen Refiner (default `openai`) and the `plain` prompt of the locale's language.
7. Save `DICTATION#ts` and respond with raw, text, providers and per-stage latency.

Each provider call emits one CloudWatch EMF record in `TakeMyWord/Dictation` per `Provider` (latency, errors, tokens); logs are JSON lines that never carry audio, raw or clean text.

## Depends on

- auth: the authorizer's `userId`.
- infra: HTTP API, the `dictate` Lambda, table `take-my-word-{env}`, secret `take-my-word-{env}/providers`.
- Groq and OpenAI over HTTP; dictionary and styles from phase 3.

## Depended on by

- desktop and mobile, which post audio; dictionary, which will read the table stream.

## Configuration

Lambda environment, set by `infra/stacks/app`: `TABLE_NAME`, `PROVIDERS_SECRET_ID`, `DAILY_QUOTA_MINUTES`, `DEBUG_BUCKET` (dev, only while `debug_audio` is on).
Optional, with code defaults: `GROQ_WHISPER_MODEL` (`whisper-large-v3-turbo`), `OPENAI_MODEL` (`gpt-5.4-nano`), `SILENCE_FLOOR_DBFS` (-55), `SPEECH_LEVEL_DBFS` (-40).

## Testing

- Unit tests next to the code with fake ports; `pnpm e2e` in `apps/api` runs the deployed path against `API_URL` (see TRD).
