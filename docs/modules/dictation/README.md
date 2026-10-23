---
updated: 2026-10-23
source: 0015_user_context
---

# Dictation

Turns a short recording into clean text: transcribe, refine with the user's dictionary and style, return, keep the text 90 days.
Every surface uses it: desktop pastes the result, mobile copies or shares it, web shows the history.
`POST /dictations` runs since 0001, history and settings since 0003, the web history since 0009, the user's context and daily usage since 0015.

## Boundaries

- Owns: `POST /dictations`, history (`GET` and `DELETE /dictations`), user settings (`/me/settings`) with the user's context, daily usage (`/me/usage`), the Transcriber and Refiner ports and adapters, the daily quota, the silence guard, `DICTATION#ts`, `QUOTA#date` and `SETTINGS` items, the web history screen.
- Does not own: recording and paste (desktop, mobile), terms and ranking (dictionary), style prompts and app rules (styles), the authorizer (auth), Lambdas, table and secrets provisioning (infra).
- Code: `apps/api`, `packages/shared`, `apps/web`

## Documents

- [prd.md](prd.md): product behavior
- [trd.md](trd.md): structure and endpoints
- [ard.md](ard.md): decisions and debt
- [database.md](database.md): tables and invariants
- [flows.md](flows.md): diagrams
