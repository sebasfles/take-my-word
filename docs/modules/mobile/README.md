---
updated: 2026-10-20
source: setup
---

# Mobile

The Expo app for iOS and Android: hold the talk button, speak, release, then copy or share the clean text.
It serves the same invited users as the desktop, with the same account, dictionary and styles, when they are away from a computer.
Phones expose no active app, so style choice is manual and there is no paste.

## Boundaries

- Owns: the mobile app shell, recording m4a, the hold-to-talk screen with transcript, copy, share sheet and style picker, and its EAS build, submit and update setup.
- Does not own: the login logic and token rules (auth), transcription and cleanup (dictation), the style list (styles), the dictionary (dictionary), the API and AWS resources (infra).
- Code: `apps/mobile` (planned; phase 4 builds it).

## Documents

- [prd.md](prd.md): product behavior
- [trd.md](trd.md): structure and endpoints
- [ard.md](ard.md): decisions and debt
- [database.md](database.md): tables and invariants
