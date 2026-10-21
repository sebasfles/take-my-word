---
updated: 2026-10-20
source: setup
---

# Dictation: database

Attributes live in the code to be written in `apps/api` and `packages/shared`; this file says what the module owns and what it must keep true.
Everything lives in the single DynamoDB table `take-my-word-{env}`, no ORM, no migrations.

## Tables owned

| Table | Purpose |
|---|---|
| `take-my-word-{env}`, `DICTATION#ts` | One saved dictation per user: text, providers, latency per stage, tokens; TTL 90 days |

## Tables referenced

| Table | Owner module | Relationship |
|---|---|---|
| `take-my-word-{env}`, `USER` | auth | Default providers and style read from the user's settings |
| `take-my-word-{env}`, `DICT#term` | dictionary | Read to build the Whisper prompt and the refiner's correction table |
| `take-my-word-{env}`, `STYLE#id` | styles | Style prompt for the refiner |
| `take-my-word-{env}`, `APPRULE#appId` | styles | Maps the desktop's active app to a style |

## Invariants kept in code

- Audio is never written to the table, nor to S3 outside the dev debug bucket.
- Every `DICTATION#ts` item carries its 90-day TTL.
- Dictations are written once and never updated, so the stream that `dictionary-usage` reads sees each one once.
- A user reads only items under their own key.
- The quota is checked before any provider is called; where the daily counter lives is set in phase 1.
- Whether the raw transcript is stored next to the clean text is set in phase 1.

## Migrations of note

- None; the table is created in phase 1.
