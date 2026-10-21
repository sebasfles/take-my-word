---
updated: 2026-10-20
source: setup
---

# Styles: database

Attributes live in the code to be written (zod contracts in `packages/shared` and the repositories in `apps/api`); this file says what the module owns and what it must keep true.
Everything sits in the single DynamoDB table `take-my-word-{env}`, with no ORM and no migrations.

## Items owned

| Item | Purpose |
|---|---|
| `STYLE#id` | A built-in or custom style: name and the prompt the refiner applies |
| `APPRULE#appId` | A desktop app mapped to a style and a paste keystroke |

## Items referenced

| Item | Owner module | Relationship |
|---|---|---|
| `USER` | auth | Custom styles and app rules belong to one user |
| `DICTATION#ts` | dictation | A dictation is cleaned with one style; whether it records the style id is not decided |

## Invariants kept in code

- Every style works in both locales; there is never one item per language.
- Built-in styles are read-only for users.
- An app rule points to a style that exists; deleting a custom style resets the rules that pointed to it to the default style.
- Whether built-in styles are stored once for everyone or seeded per user is not decided.

## Migrations of note

- None; the table is schemaless and nothing is built yet.
