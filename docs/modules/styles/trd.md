---
updated: 2026-10-21
source: 0003_api_features
---

# Styles: technical

## Structure

| Path | What |
|---|---|
| `apps/api/src/styles` | Style routes in the `api` Lambda, the store port and its DynamoDB adapter, the style-exists check. |
| `apps/api/src/styles/builtin` | `plain`, `casual` and `formal` as code, one versioned file each (`casual.v1.ts`). |
| `apps/api/src/app-rules` | App rule routes, store port and DynamoDB adapter. |
| `apps/api/src/dictation/style-resolution.ts` | Which style a dictation uses (owned here, called by `dictate`). |
| `packages/shared/src/styles.ts`, `app-rules.ts` | Contracts, limits, built-in ids and the paste keystroke enum. |
| `apps/web`, `apps/desktop`, `apps/mobile` | Settings screens, app matching and paste (0009, 0008, phase 4). |

## Endpoints owned

| Method | Route | Purpose | Spec |
|---|---|---|---|
| GET | `/styles` | Built-ins first, then the user's custom styles. | zod in `packages/shared` |
| POST | `/styles` | Create a custom style. | zod in `packages/shared` |
| PUT | `/styles/{id}` | Edit a custom style; 403 `forbidden` for a built-in. | zod in `packages/shared` |
| DELETE | `/styles/{id}` | Delete a custom style and release what pointed to it; 403 for a built-in. | zod in `packages/shared` |
| GET | `/app-rules` | The user's app rules. | zod in `packages/shared` |
| POST | `/app-rules` | Create a rule; 409 when the app already has one. | zod in `packages/shared` |
| PUT | `/app-rules/{id}` | Replace a rule's style and keystroke. | zod in `packages/shared` |
| DELETE | `/app-rules/{id}` | Remove a rule. | zod in `packages/shared` |

`{id}` of a rule is the opaque `id` it is listed with, as for dictionary terms.

## Style resolution

`dictate` uses the request's `styleId`, else the rule of the request's `appId`, else the user's `defaultStyleId`, else `plain`; an unknown or deleted id falls through to the next one and never fails a dictation.
The refiner gets the editing contract first, then the style's directions under a heading that limits them to tone and register.

## Depends on

- auth: the authorizer's `userId` partitions every style and rule.
- dictation: owns the settings that hold the default style.
- infra: the table and the `api` Lambda.

## Depended on by

- dictation: resolves the style of every dictation.
- desktop: matches the focused app to a rule and pastes with its keystroke (0008).
- mobile: lists the styles in its picker (phase 4).

## Configuration

- None.

## Testing

- Unit tests next to the code: resolution order and fall-through, built-ins read-only, release on delete, limits, routes against in-memory stores.
- `pnpm e2e` in `apps/api` shows casual and formal text for one recording and a rule falling back after its style is deleted.
