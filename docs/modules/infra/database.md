---
updated: 2026-10-24
source: 0021_provider_switch
---

# Infra: database

The table is defined in `infra/modules/aws/dynamodb` and instantiated by `infra/stacks/app`; item attributes live in `apps/api` and `packages/shared`.
Infra owns the table as a resource, not the items in it.

## Tables owned

| Table | Purpose |
|---|---|
| `<deployment>-{env}` | The single table per env: keys, TTL, stream, capacity mode; on-demand capacity. |
| Secrets Manager blob per env | Groq, OpenAI, Together and Cerebras keys; each environment needs its pair's. |
| S3 debug bucket, dev only | Optional raw audio, deleted after one day. |

Infra owns no item kind.

## Tables referenced

| Table | Owner module | Relationship |
|---|---|---|
| `<deployment>-{env}`, `SETTINGS`, `QUOTA#date` | dictation | User settings and the daily quota under each user's partition. |
| `<deployment>-{env}`, `DICTATION#ts` | dictation | Relies on the table's TTL; its inserts feed the stream. |
| `<deployment>-{env}`, `DICT#term` | dictionary | Counted by `dictionary-usage` from the stream. |
| `<deployment>-{env}`, `STYLE#id`, `APPRULE#appId` | styles | Plain CRUD through `api`. |

## Invariants kept in code

- One table per env; dev and prd never share a table, a secret or a user pool.
- TTL stays enabled on `expiresAt`, which `DICTATION#ts` and `QUOTA#date` set; settings, terms, styles and rules carry none and live until deleted.
- The stream stays enabled with new images, or dictionary ranking stops.
- prd has no debug bucket; no audio is persisted outside dev.
- Only `api`, `dictate` and `dictionary-usage` get access to the table, each with its own action list, and only `dictate` to the secret; `dictionary-usage` may update only `PK`, `SK`, `useCount` and `lastUsedAt`, and per-user scoping is enforced in code from the authorizer's `userId`.

## Migrations of note

- None; 0001 created the dev table, 0006 the prd table, empty, with point-in-time recovery and deletion protection.
