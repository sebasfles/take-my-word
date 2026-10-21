---
updated: 2026-10-20
source: setup
---

# Styles: technical

Planned; no code yet, phase 3 builds it.

## Structure

| Path | What |
|---|---|
| `apps/api` | Styles and app rules routes in the `api` Lambda (Hono); style prompt lookup inside the `dictate` pipeline |
| `packages/shared` | zod contracts for styles and app rules, shared by api, web and desktop |
| `apps/web` | Settings screens to list, create, edit and delete custom styles and app rules |
| `apps/desktop` | Active window detection, matching to an app rule, applying its style and paste keystroke |
| `apps/mobile` | Manual style picker (phase 4) reading the style list |

Exact folders inside each app are decided when phase 3 starts.

## Endpoints owned

| Method | Route | Purpose | Spec |
|---|---|---|---|
| CRUD | `/styles` | List built-in and custom styles; create, update and delete custom ones | none yet |
| CRUD | `/app-rules` | Per-user mapping of a desktop app to a style and a paste keystroke | none yet |

Jobs, listeners or scheduled work: none.

## Depends on

- auth: the Lambda authorizer supplies the user id that partitions every style and app rule.
- infra: the `take-my-word-{env}` DynamoDB table and the `api` Lambda behind API Gateway.

## Depended on by

- dictation: `POST /dictations` accepts `styleId` and `appId`, resolves the style prompt and passes it to the refiner; without them it falls back to the user's settings.
- desktop: resolves the focused app to an app rule before sending audio, then pastes with the rule's keystroke.
- mobile: shows the style list in its manual picker.

## Configuration

- None planned.

## Testing

- Tests live next to the code in `apps/api`, `packages/shared`, `apps/web` and `apps/desktop`.
- Module-specific run: see TRD.
