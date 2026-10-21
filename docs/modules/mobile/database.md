---
updated: 2026-10-20
source: setup
---

# Mobile: database

Attributes live in the code to be written (zod contracts in `packages/shared` and the repositories in `apps/api`); this file says what the module touches and what it must keep true.
The server data sits in the single DynamoDB table `take-my-word-{env}`; the app never talks to it directly, only through the API.

## Items owned

- None in the table.
- On the device: the Cognito tokens in `expo-secure-store`, and the picked style kept between launches.

## Items referenced

| Item | Owner module | Relationship |
|---|---|---|
| `USER` | auth | The signed-in user; default style and locale come from its settings |
| `STYLE#id` | styles | Read to fill the manual style picker |
| `DICTATION#ts` | dictation | Created by each `POST /dictations` from the app; mobile only shows the returned text |

## Invariants kept in code

- Audio is never stored on the device after the request finishes.
- Tokens live only in `expo-secure-store`, never in plain storage.
- The stored refresh token is overwritten on every renewal, because Cognito rotates it.

## Migrations of note

- None; nothing is built yet.
