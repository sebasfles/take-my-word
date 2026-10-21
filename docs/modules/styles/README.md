---
updated: 2026-10-20
source: setup
---

# Styles

Styles decide how cleaned dictation reads: built-in and custom prompts that the refiner applies, each working in Spanish and English.
App rules map a desktop app to a style and a paste keystroke, so dictating into a chat, an email client or a terminal gets the right tone and pastes correctly without the user choosing.
Mobile offers the same styles through a manual picker.

## Boundaries

- Owns: styles (built-in and custom), app rules, their settings screens on web, and the desktop logic that resolves the focused app to a rule.
- Does not own: the refiner call and the pipeline (dictation), terms and aliases (dictionary), active window capture and the paste itself (desktop), the default style setting (dictation, through `/me/settings`).
- Code: `apps/api`, `packages/shared`, `apps/web`, `apps/desktop` (planned; phase 3 builds it).

## Documents

- [prd.md](prd.md): product behavior
- [trd.md](trd.md): structure and endpoints
- [ard.md](ard.md): decisions and debt
- [database.md](database.md): tables and invariants
