---
updated: 2026-10-21
source: 0009_web_account
---

# Dictionary: technical

## Structure

| Path | What |
|---|---|
| `apps/api/src/dictionary` | Routes in the `api` Lambda, the store port and its DynamoDB adapter, term matching. |
| `apps/api/src/dictation/dictionary-projection.ts` | The two projections `dictate` builds (owned here, called by dictation). |
| `apps/api/src/dictionary-usage` | The `dictionary-usage` Lambda, consumer of the table stream. |
| `packages/shared/src/dictionary.ts` | Contracts, limits, `normalizeTerm` and the ranking (`decayedScore`, `rankTerms`, half-life 30), so the web orders terms exactly as `dictate` does. |
| `apps/web` | Read-only view, by relevance or by name. |
| `apps/desktop`, `apps/mobile` | Editors (0008, phase 4). |

## Endpoints owned

| Method | Route | Purpose | Spec |
|---|---|---|---|
| GET | `/dictionary` | The user's terms with aliases and usage. | zod in `packages/shared` |
| POST | `/dictionary` | Add a term; 409 when its folded form exists. | zod in `packages/shared` |
| PUT | `/dictionary/{id}` | Replace a term's aliases. | zod in `packages/shared` |
| DELETE | `/dictionary/{id}` | Remove a term. | zod in `packages/shared` |

`{id}` is the opaque `id` each listed term carries, never the raw term: API Gateway decodes the path once, so `/`, `#` and `%` would not survive.

Job: `dictionary-usage` reads inserts of `DICTATION#` from the table stream (filtered at the event source mapping) and adds one use to every term or alias found in the clean text, folded, on Unicode word boundaries.

## Depends on

- auth: the authorizer's `userId` scopes every term.
- dictation: its saved `DICTATION#` items feed usage through the stream.
- infra: the table, its stream, the `api` and `dictionary-usage` Lambdas and the mapping.

## Depended on by

- dictation: `dictate` ranks the terms and sends the top ones as Whisper's `prompt` and every term with aliases to the refiner.

## Configuration

- `DICTIONARY_HALF_LIFE_DAYS` (30) and `STT_PROMPT_TOKEN_BUDGET` (224) on `dictate`, set by `infra/stacks/app`.
- `TABLE_NAME` on `api` and `dictionary-usage`.

## Testing

- Unit tests next to the code: folding, matching, ranking and budget, routes against in-memory stores, the usage consumer.
- `pnpm e2e` in `apps/api` proves a rare term spelled right only with the dictionary and counted by the stream.
