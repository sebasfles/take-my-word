---
updated: 2026-10-23
source: 0016_self_hosting
---

# Auth: database

Identities live in the Cognito user pool, not in DynamoDB; the item schema of `<deployment>-{env}` will live in `packages/shared` and `apps/api` once written.

## Tables owned

| Table | Purpose |
|---|---|
| Cognito user pool per env | Users, passwords, devices and refresh tokens; managed by AWS. |

Auth owns no item kind in `<deployment>-{env}`.

## Tables referenced

| Table | Owner module | Relationship |
|---|---|---|
| `<deployment>-{env}`, `SETTINGS`, `QUOTA#date`, `DICT#term`, `STYLE#id`, `APPRULE#appId`, `DICTATION#ts` | dictation, dictionary, styles | Every item sits under `USER#{sub}`, the Cognito user id the authorizer emits; there is no `USER` item. |

## Invariants kept in code

- The user id comes only from the authorizer context, never from a path, query, body, cursor or id; the authorizer accepts only access tokens of the pool's native client.
- Deleting a Cognito user does not delete their items; that cleanup has no owner yet.

## Migrations of note

- None; 0001 created the dev pool with `crew-e2e` and Sebastian's user, 0003 added `crew-e2e-b` for cross-user checks.
