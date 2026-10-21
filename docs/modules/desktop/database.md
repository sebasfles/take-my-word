---
updated: 2026-10-21
source: 0007_desktop_integration
---

# Desktop: database

The item schema of `take-my-word-{env}` will live in `packages/shared` and `apps/api` once written; desktop never touches the table directly, only through the API.

## Tables owned

Desktop owns no table and no item kind.
On the machine it keeps the refresh token, `DeviceKey` and `DeviceGroupKey` in Windows Credential Manager (persisted per machine, never roaming), the access token only in memory, and its local settings in `settings.json` in the app's config folder.

## Tables referenced

| Table | Owner module | Relationship |
|---|---|---|
| `take-my-word-{env}`, `APPRULE#appId` | styles | Read to map the focused app to a style and a paste keystroke. |
| `take-my-word-{env}`, `STYLE#id` | styles | Listed in settings to pick a style for an app rule. |
| `take-my-word-{env}`, `SETTINGS` | dictation | Settings read and written through `/me/settings`. |
| `take-my-word-{env}`, `DICTATION#ts` | dictation | Created on the server by each dictation the app sends. |

## Invariants kept in code

- The `appId` desktop sends is the same identifier it stores in app rules, so the server can resolve the rule.
- The refresh token in the keychain is overwritten on every renewal, before the new access token is used, never kept beside the old one.
- The three keychain entries live or die together: a partial set reads as signed out and is removed.
- Tokens, device keys and passwords never reach `settings.json`, the logs or the WebView.
- Audio is never written to disk; only debug builds can dump a recording, behind a flag.

## Migrations of note

- None.
