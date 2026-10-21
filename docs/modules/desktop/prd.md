---
updated: 2026-10-20
source: setup
---

# Desktop: product

## Purpose

Desktop is the primary way to use Take My Word.
The user holds a key, speaks, releases, and clean text appears in whatever app has focus, in Spanish or English.
It must feel like typing got faster: no window to open, no copy and paste, the user's clipboard left as it was.

## User flows

### First run

1. The user installs the app and it lives in the system tray.
2. The app shows a username and password form; after sign-in it never asks again until sign-out or revocation.
3. On macOS the app asks the user to set "Press Fn key to" to do nothing and to grant Accessibility, and explains why.
4. The app tells the user which key to hold: Ctrl+Win on Windows, Fn on macOS, Ctrl+Super on Linux.

Errors and empty states: if a permission is denied the app explains that dictation cannot paste or hear the key, and links to the system setting.

### Dictate

1. The user places the cursor where the text should go, in any app.
2. The user holds the hotkey; a small overlay shows that the app is listening.
3. The user speaks and releases the key; the overlay shows that the text is being processed.
4. The clean text is pasted at the cursor and the overlay disappears.
5. Whatever the user had in the clipboard before is back in the clipboard.

Errors and empty states: a press shorter than half a second does nothing; silence pastes nothing; a network or quota failure shows a short message in the overlay and pastes nothing.

### Per-app style

1. In settings, the user maps an app (for example the mail client or a terminal) to a style and a paste keystroke.
2. From then on, dictating into that app uses that style and keystroke without the user choosing anything.

Errors and empty states: an app with no rule uses the user's default style and the OS's normal paste keystroke.

### Change the hotkey

1. The user opens settings from the tray and records a new key or combination.
2. The new hotkey works immediately.

### Update

1. When a new version is released the app asks before updating (phase 5).

## Rules

- Reaching the maximum recording length while the key is still held stops the recording and sends it.
- History, dictionary, styles and app rules are all editable from the app settings.

- Dictation is hold to talk: recording lasts exactly as long as the key is held.
- Right Alt is never offered as a hotkey, because it is AltGr on Spanish keyboards.
- One recording lasts at most about two and a half minutes.
- Audio leaves the machine only to be transcribed and is never stored.
- The clipboard is always restored after pasting.
- Windows comes first; macOS and Linux follow in phase 5.
- Apps running as administrator on Windows do not accept the paste; this is a known limitation, as in other dictation tools.

## Out of scope

- Live transcript while speaking.
- Voice editing commands ("delete that", "new line").
- Choosing the style by hand per dictation; app rules and the default style, picked during onboarding, decide.

## Open questions

- What the user can do with the text when paste fails (administrator windows, network drop after transcription): keep it in the clipboard or offer it from the tray.

- Whether the hotkey setting follows the user across machines or stays per machine.
