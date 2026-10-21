---
updated: 2026-10-20
source: setup
---

# Dictionary: database

Attributes live in the zod contracts in `packages/shared` and the access code in `apps/api`, both still to be written; this file says what the module owns and what it must keep true.
All items share the single DynamoDB table `take-my-word-{env}`; there is no ORM and no migration tool.

## Items owned

| Item | Purpose |
|---|---|
| `DICT#term` | One term of one user's dictionary, with its aliases, `useCount` and `lastUsedAt`. |

## Items referenced

| Item | Owner module | Relationship |
|---|---|---|
| `DICTATION#ts` | dictation | Its insert events on the table stream feed usage counting. |
| `USER` | auth | Every `DICT#term` sits under the user's partition. |

## Invariants kept in code

- A term is unique per user, because the term is its key.
- A new term starts at `useCount = 1` and `lastUsedAt = createdAt`.
- Only the `dictionary-usage` Lambda changes `useCount` and `lastUsedAt`; the CRUD routes never do.
- No score is stored; it is always computed at read time from `useCount`, `lastUsedAt` and the half-life.
- Stream delivery is at least once, so a retried batch may count a use twice; tolerated as noise in a ranking.

## Migrations of note

- None; nothing is built yet.
