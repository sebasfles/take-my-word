---
updated: 2026-10-20
source: setup
---

# Dictation

Turns a short recording into clean text: transcribe, refine with the user's dictionary and style, return, keep the text 90 days.
Every surface uses it: desktop pastes the result, mobile copies or shares it, web shows the history.
Planned; phase 1 builds it.

## Boundaries

- Owns: `POST /dictations`, `GET /dictations`, the Transcriber and Refiner ports and adapters, the daily quota, the silence guard, `DICTATION#ts` items, the web history screen.
- Does not own: recording and paste (desktop, mobile), terms and ranking (dictionary), style prompts and app rules (styles), the authorizer (auth), Lambdas, table and secrets provisioning (infra).
- Code: `apps/api`, `packages/shared`, `apps/web`

## Documents

- [prd.md](prd.md): product behavior
- [trd.md](trd.md): structure and endpoints
- [ard.md](ard.md): decisions and debt
- [database.md](database.md): tables and invariants
- [flows.md](flows.md): diagrams
