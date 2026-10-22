---
updated: 2026-10-21
source: 0008_desktop_features
---

# Dictation: database

Attributes live in `apps/api` and `packages/shared`; this file says what the module owns and what it must keep true.
Everything lives in the single DynamoDB table `take-my-word-{env}`, no ORM, no migrations.

## Tables owned

| Table | Purpose |
|---|---|
| `take-my-word-{env}`, `DICTATION#ts` | One saved dictation per user: raw and clean text, the style used, providers, latency per stage, tokens; TTL 90 days |
| `take-my-word-{env}`, `QUOTA#date` | Audio seconds charged to a user on one UTC day; TTL two days after the day starts |
| `take-my-word-{env}`, `SETTINGS` | The user's default style, dictation languages and default providers; created on the first `GET /me/settings`; no TTL |

## Tables referenced

| Table | Owner module | Relationship |
|---|---|---|
| `take-my-word-{env}`, `DICT#term` | dictionary | Read to build the Whisper prompt and the refiner's correction table |
| `take-my-word-{env}`, `STYLE#id` | styles | Style prompt for the refiner |
| `take-my-word-{env}`, `APPRULE#appId` | styles | Maps the desktop's active app to a style |

## Invariants kept in code

- Audio is never written to the table, nor to S3 outside the dev debug bucket.
- Every `DICTATION#ts` item carries its 90-day TTL.
- Dictations are written once and never updated, so the stream that `dictionary-usage` reads sees each one once.
- A user reads only items under their own key; the key comes from the authorizer, and a history cursor or id carries only the sort key.
- History never shows an item past its `expiresAt`, even before TTL deletes it.
- `SETTINGS` always names a style that existed when written; a later deletion resets it to `plain`, and `dictate` falls back to `plain` if that reset was missed.
- The quota is charged with one atomic conditional update on `QUOTA#date` before any provider is called; the condition allows it while the day is under the cap.
- Dictations skipped as silence are not saved.
- A `SETTINGS` item written before dictation languages reads as the language of its `locale`; `locale` is always derived from the first dictation language.
- A `DICTATION#ts` item's `locale` is the language the audio was transcribed in, not the device's.
- The stream also carries `QUOTA#date` writes and every TTL removal, so its consumers filter on the `DICTATION#` sort key prefix and on inserts.

## Migrations of note

- None; 0001 created the table and 0003 added `SETTINGS`.
