---
updated: 2026-10-20
source: setup
---

# Dictionary: technical

Planned; no code yet, phase 3 builds it.

## Structure

| Path | What |
|---|---|
| `apps/api` | Dictionary CRUD routes in the `api` Lambda (Hono), the ranking and the two projections read by `dictate`. |
| `apps/api` | The `dictionary-usage` Lambda, consumer of the table's DynamoDB Stream. |
| `packages/shared` | zod contracts for dictionary terms and aliases. |
| `apps/web` | Read-only dictionary view. |
| `apps/desktop` | Dictionary editor in the tray app settings. |
| `apps/mobile` | Dictionary editor in the app settings. |

Folder names inside each app follow the module name (`dictionary/`).

## Endpoints owned

| Method | Route | Purpose | Spec |
|---|---|---|---|
| GET | `/dictionary` | List the user's terms with aliases. | none yet |
| POST | `/dictionary` | Add a term with optional aliases. | none yet |
| PUT | `/dictionary/{term}` | Edit a term's aliases. | none yet |
| DELETE | `/dictionary/{term}` | Remove a term. | none yet |

The exact routes under CRUD `/dictionary` are; the contract in `packages/shared` will be the source.

Jobs: `dictionary-usage` Lambda on the DynamoDB Stream of `take-my-word-{env}`, filtered to new `DICTATION#ts` items, increments `useCount` and sets `lastUsedAt` on every term that appears in the saved text.
How a term counts as "appearing" (exact term, alias, case and accent folding) is.

## Depends on

- auth: the Lambda authorizer supplies the user id that scopes every term.
- dictation: its saved `DICTATION#ts` items are the stream events that feed usage.
- infra: the table, its stream, the `dictionary-usage` Lambda and its event source mapping.

## Depended on by

- dictation: `dictate` reads the user's terms and builds two projections.
  The top terms by score fill Whisper's 224-token `prompt`.
  The full list with aliases goes to the refiner as a correction table.

## Configuration

- Half-life for the score, default 30 days, configurable; env var name.
- Table name per environment, `take-my-word-{env}`, injected by Terraform.

## Testing

- No tests yet.
- Ranking and projection are pure functions and get unit tests next to them in `apps/api`.
- Module-specific run: see TRD.
