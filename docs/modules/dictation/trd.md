---
updated: 2026-10-20
source: setup
---

# Dictation: technical

Planned; no code yet, phase 1 builds `POST /dictations` and phase 5 the history screen.

## Structure

| Path | What |
|---|---|
| `apps/api` | The `dictate` Lambda (the pipeline) and the history route in the `api` Lambda (Hono) |
| `apps/api`, Transcriber port | Speech to text strategy; v1 adapter `groq-whisper` (whisper-large-v3-turbo) |
| `apps/api`, Refiner port | Cleanup strategy; v1 adapter `openai` with `gpt-6-luna` |
| `packages/shared` | zod contracts for the dictation request and response, shared by api and every client |
| `apps/web` | History screen (phase 5) |

Folder names inside each app are fixed when phase 1 creates the skeleton.

## Endpoints owned

| Method | Route | Purpose | Spec |
|---|---|---|---|
| POST | `/dictations` | Audio in (WAV 16 kHz mono 16-bit or m4a, up to 5 MB), raw and clean text out; served by `dictate` | none yet |
| GET | `/dictations` | The user's history, text only, last 90 days; served by `api` | none yet |

Jobs, listeners or scheduled work: none owned.
Saved dictations feed the DynamoDB Stream that the `dictionary-usage` Lambda (dictionary module) consumes.

## Pipeline

1. Quota check: per-user daily cap of 60 audio minutes, configurable, before any provider call.
2. Transcribe with the chosen Transcriber, passing the top dictionary terms as Whisper's prompt (224 tokens max).
3. Silence guard: an empty transcript or a known silence hallucination returns empty text and skips the refiner.
4. Refine with the chosen Refiner: raw transcript, style prompt, full dictionary with aliases, locale; output is the clean text only.
5. Save `DICTATION#ts` (text, providers, latency per stage, tokens; TTL 90 days) and respond.

Strategies are chosen per request and default to the user's settings.
Audio stays in memory; dev may keep it in a debug bucket with a one-day lifecycle.

## Depends on

- auth: the Lambda authorizer validates the Cognito JWT and gives the user id.
- dictionary: top terms for the transcriber, full list with aliases for the refiner (phase 3).
- styles: the style prompt, from `styleId` or the `APPRULE#appId` sent by desktop (phase 3).
- infra: API Gateway HTTP API, the `dictate` Lambda (60 s timeout, more memory), table `take-my-word-{env}`, the Secrets Manager blob with provider keys (cached per execution environment), CloudWatch metrics per provider.
- Groq (STT) and OpenAI (refiner), over their HTTP APIs.

## Depended on by

- desktop: posts WAV on hotkey release and pastes the result.
- mobile: posts m4a and shows, copies or shares the result.
- dictionary: counts term usage from the stream of saved dictations.

## Configuration

- Table name, provider secret id, daily quota minutes and the dev debug bucket arrive as Lambda environment variables; names are set in phase 1.

## Testing

- Tests live next to the code in `apps/api`.
- Module-specific run: see TRD.
- Phase 1 acceptance is a curl to `POST /dictations` with a Cognito token.
