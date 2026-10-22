---
updated: 2026-10-21
source: 0008_desktop_features
---

# Desktop: database

The item schema of `take-my-word-{env}` will live in `packages/shared` and `apps/api` once written; desktop never touches the table directly, only through the API.

## Tables owned

Desktop owns no table and no item kind.
On the machine it keeps the refresh token, `DeviceKey` and `DeviceGroupKey` in Windows Credential Manager (persisted per machine, never roaming), the access token only in memory, and its local settings in `settings.json` in the app's config folder.

## Tables referenced

| Table | Owner module | Relationship |
|---|---|---|
| `take-my-word-{env}`, `APPRULE#appId` | styles | Edited in settings; read to map the focused app to a paste keystroke. |
| `take-my-word-{env}`, `STYLE#id` | styles | Custom styles edited in settings. |
| `take-my-word-{env}`, `DICT#term` | dictionary | Terms edited in settings. |
| `take-my-word-{env}`, `SETTINGS` | dictation | Default style and dictation languages, read and replaced whole through `/me/settings`. |
| `take-my-word-{env}`, `DICTATION#ts` | dictation | Created by each dictation; paged and deleted from History. |

## Invariants kept in code

- The `appId` desktop sends is the same identifier it stores in app rules and lists as a running app, so the server can resolve the rule.
- The in-memory rules never take a load that started before the rules already applied or before the last sign-out.
- The refresh token in the keychain is overwritten on every renewal, before the new access token is used, never kept beside the old one.
- The three keychain entries live or die together: a partial set reads as signed out and is removed.
- Tokens, device keys and passwords never reach `settings.json`, the logs or the WebView.
- Audio is never written to disk; only debug builds can dump a recording, behind a flag.

## Migrations of note

- None.
