---
updated: 2026-10-20
source: setup
---

# Desktop: database

The item schema of `take-my-word-{env}` will live in `packages/shared` and `apps/api` once written; desktop never touches the table directly, only through the API.

## Tables owned

Desktop owns no table and no item kind.
On the machine it keeps the Cognito tokens in the OS keychain and its local settings (hotkey) in the app's data folder.

## Tables referenced

| Table | Owner module | Relationship |
|---|---|---|
| `take-my-word-{env}`, `APPRULE#appId` | styles | Read to map the focused app to a style and a paste keystroke. |
| `take-my-word-{env}`, `STYLE#id` | styles | Listed in settings to pick a style for an app rule. |
| `take-my-word-{env}`, `SETTINGS` | dictation | Settings read and written through `/me/settings`. |
| `take-my-word-{env}`, `DICTATION#ts` | dictation | Created on the server by each dictation the app sends. |

## Invariants kept in code

- The `appId` desktop sends is the same identifier it stores in app rules, so the server can resolve the rule.
- The refresh token in the keychain is overwritten on every renewal, never kept beside the old one.
- Audio is never written to disk outside the recording buffer.

## Migrations of note

- None; nothing is built.
