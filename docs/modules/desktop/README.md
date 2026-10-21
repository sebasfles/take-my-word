---
updated: 2026-10-21
source: 0007_desktop_integration
---

# Desktop

The tray app where most dictation happens: hold a key, speak, release, and clean text is pasted into the focused app.
It records the audio, sends it to the API, pastes the result with the keystroke the app needs, and restores the clipboard.
Windows first; macOS and Linux follow.

## Boundaries

- Owns: the tray, the hotkey hook, recording, the overlay, active window detection, pasting and clipboard restore, the desktop sign-in, session and keychain storage, the first style pick, the dev and prd builds, installers and the updater.
- Does not own: transcription and cleanup (dictation), styles and app rules data (styles), terms (dictionary), the user pool and token rules (auth).
- Code: `apps/desktop`.

## Documents

- [prd.md](prd.md): product behavior
- [trd.md](trd.md): structure and endpoints
- [ard.md](ard.md): decisions and debt
- [database.md](database.md): tables and invariants
- [flows.md](flows.md): hold to talk with the session
