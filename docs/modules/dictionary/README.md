---
updated: 2026-10-21
source: 0003_api_features
---

# Dictionary

The user's personal list of terms, each with optional "sounds like" aliases, that every dictation must spell right.
It steers transcription with the most used and most recent terms and gives the refiner the full list as a correction table.
Usage is counted from saved dictations, so priority follows what the user actually says.
The API and the usage counter run in dev since 0003; the desktop editor and the web view come with 0008 and 0009.

## Boundaries

- Owns: terms and aliases, their usage counters, the ranking, the two projections handed to dictation, the `dictionary-usage` Lambda, and the dictionary editors in desktop and mobile, and the read-only view on the web.
- Does not own: the dictation pipeline that consumes the projections (dictation), styles and app rules (styles), the table, stream and Lambda resources (infra), identity (auth).
- Code: `apps/api`, `packages/shared`, `apps/web`, `apps/desktop`

## Documents

- [prd.md](prd.md): product behavior
- [trd.md](trd.md): structure and endpoints
- [ard.md](ard.md): decisions and debt
- [database.md](database.md): items and invariants
- [flows.md](flows.md): usage and ranking flow
