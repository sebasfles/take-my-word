---
updated: 2026-10-21
source: 0003_api_features
---

# Dictionary: database

All items share the single DynamoDB table `take-my-word-{env}`; attributes live in `packages/shared` and `apps/api/src/dictionary`.

## Items owned

| Item | Purpose |
|---|---|
| `DICT#{folded term}` under `USER#{sub}` | One term with its display form, aliases, `useCount`, `lastUsedAt` and `createdAt`; no TTL. |

## Items referenced

| Item | Owner module | Relationship |
|---|---|---|
| `DICTATION#ts` | dictation | Its insert events on the table stream feed usage counting. |

## Invariants kept in code

- A term is unique per user by its folded form (lowercase, accents and spacing removed), which is its key.
- A new term starts at `useCount = 1` and `lastUsedAt = createdAt`.
- Only `dictionary-usage` changes `useCount` and `lastUsedAt`, and only while `lastUsedAt` is older than the dictation: a deleted term is never recreated and a redelivered record counts nothing.
- No score is stored; it is computed at read time from `useCount`, `lastUsedAt` and the half-life.
- At most 500 terms, 10 aliases each, 64 characters per term or alias; the count check is not transactional, so two concurrent adds may pass 500 by one.

## Migrations of note

- None; 0003 added the item kind.
