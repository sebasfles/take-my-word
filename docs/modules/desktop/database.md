---
updated: 2026-10-21
source: 0002_desktop_shell
---

# Desktop: database

The item schema of `take-my-word-{env}` will live in `packages/shared` and `apps/api` once written; desktop never touches the table directly, only through the API.

## Tables owned

Desktop owns no table and no item kind.
On the machine it keeps the Cognito tokens in the OS keychain (0007) and its local settings (hotkey, first-run flag) in `settings.json` in the app's config folder.

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
- Audio is never written to disk; only debug builds can dump a recording, behind a flag.

## Migrations of note

- None.
