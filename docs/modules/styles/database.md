---
updated: 2026-10-21
source: 0003_api_features
---

# Styles: database

Everything sits in the single DynamoDB table `take-my-word-{env}`; attributes live in `packages/shared` and `apps/api`.

## Items owned

| Item | Purpose |
|---|---|
| `STYLE#{id}` under `USER#{sub}` | A custom style: name, directions, creation time; no TTL. |
| `APPRULE#{appId}` under `USER#{sub}` | A desktop app (lowercased) mapped to an optional style and a paste keystroke; no TTL. |

Built-in styles are not items; they live in code and are the same for everyone.

## Items referenced

| Item | Owner module | Relationship |
|---|---|---|
| `SETTINGS` | dictation | Holds the default style; reset to `plain` when that style is deleted. |
| `DICTATION#ts` | dictation | Records the `styleId` the dictation used. |

## Invariants kept in code

- Every style works in both locales; there is never one item per language.
- Built-in styles cannot be changed; custom style ids are random and never collide with them.
- A rule or a default is written only with a style that exists; deleting a style then removes `styleId` from the rules that held it and resets the default, best effort, so a dangling id can remain and resolution skips it.
- At most 20 custom styles and 100 rules per user; the count check is not transactional.

## Migrations of note

- None; 0003 added the item kinds.
