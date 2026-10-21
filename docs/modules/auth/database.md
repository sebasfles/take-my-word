---
updated: 2026-10-21
source: 0001_platform_skeleton
---

# Auth: database

Identities live in the Cognito user pool, not in DynamoDB; the item schema of `take-my-word-{env}` will live in `packages/shared` and `apps/api` once written.

## Tables owned

| Table | Purpose |
|---|---|
| Cognito user pool per env | Users, passwords, devices and refresh tokens; managed by AWS. |

Auth owns no item kind in `take-my-word-{env}`.

## Tables referenced

| Table | Owner module | Relationship |
|---|---|---|
| `take-my-word-{env}`, `USER` | dictation | Keyed by the Cognito user id the authorizer emits. |
| `take-my-word-{env}`, `DICT#term`, `STYLE#id`, `APPRULE#appId`, `DICTATION#ts` | dictionary, styles, dictation | Every item sits under the same user key. |

## Invariants kept in code

- The user id comes only from the authorizer context, never from a path, query or body; the authorizer accepts only access tokens of the pool's native client.
- Deleting a Cognito user does not delete their items; that cleanup has no owner yet.

## Migrations of note

- None; 0001 created the dev pool, with `crew-e2e` for end-to-end runs and Sebastian's user.
