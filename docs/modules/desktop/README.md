---
updated: 2026-10-25
source: 0019_segmented_transcription
---

# Desktop

The tray app where most dictation happens: hold the shortcut or tap it twice, speak, and clean text is pasted into the focused app.
It records the audio, sends it to the API, pastes the result with the keystroke the app needs, and restores the clipboard.
Windows first; macOS and Linux follow.

## Boundaries

- Owns: the tray, the hotkey hook, recording and its segments, the overlay and its level, active window detection, pasting and clipboard restore, the desktop sign-in, session and keychain storage, the choice of server (official or the user's own, by discovery), onboarding, the settings editors and the app's Spanish and English, the dev and prd builds, installers and the updater.
- Does not own: transcription and cleanup (dictation), styles and app rules data (styles), terms (dictionary), the user pool and token rules (auth).
- Code: `apps/desktop`.

## Documents

- [prd.md](prd.md): product behavior
- [trd.md](trd.md): structure and endpoints
- [ard.md](ard.md): decisions and debt
- [database.md](database.md): tables and invariants
- [flows.md](flows.md): hold to talk and hands-free with the session
