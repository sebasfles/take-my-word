---
updated: 2026-10-20
source: setup
---

# Infra: database

The table is defined in `infra/modules/aws/dynamodb` and instantiated by `infra/stacks/app` (planned); item attributes live in `apps/api` and `packages/shared`.
Infra owns the table as a resource, not the items in it.

## Tables owned

| Table | Purpose |
|---|---|
| `take-my-word-{env}` | The single table per env: keys, TTL, stream, capacity mode; on-demand capacity. |
| Secrets Manager blob per env | Groq and OpenAI keys. |
| S3 debug bucket, dev only | Optional raw audio, deleted after one day. |

Infra owns no item kind.

## Tables referenced

| Table | Owner module | Relationship |
|---|---|---|
| `take-my-word-{env}`, `USER` | dictation | User settings under each user's partition. |
| `take-my-word-{env}`, `DICTATION#ts` | dictation | Relies on the table's TTL; its inserts feed the stream. |
| `take-my-word-{env}`, `DICT#term` | dictionary | Updated by `dictionary-usage` from the stream. |
| `take-my-word-{env}`, `STYLE#id`, `APPRULE#appId` | styles | Plain CRUD through `api`. |

## Invariants kept in code

- One table per env; dev and prd never share a table, a secret or a user pool.
- TTL stays enabled on the attribute `DICTATION#ts` items use, or history outlives its 90 days.
- The stream stays enabled with new images, or dictionary ranking stops.
- prd has no debug bucket; no audio is persisted outside dev.
- Only `api`, `dictate` and `dictionary-usage` get access to the table, and only `dictate` to the secret.

## Migrations of note

- None; the table is created in phase 1.
