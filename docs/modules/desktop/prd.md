---
updated: 2026-10-21
source: 0002_desktop_shell
---

# Desktop: product

## Purpose

Desktop is the primary way to use Take My Word.
The user holds a key, speaks, releases, and clean text appears in whatever app has focus, in Spanish or English.
It must feel like typing got faster: no window to open, no copy and paste, the user's clipboard left as it was.

## User flows

### First run

1. The user installs the app and it lives in the system tray, starting with Windows unless turned off.
2. The app explains which keys to hold (Ctrl+Win on Windows, Fn on macOS, Ctrl+Super on Linux) and that the microphone listens only during the hold.
3. The app shows a username and password form; after sign-in it never asks again until sign-out or revocation (0007).
4. On macOS the app asks the user to set "Press Fn key to" to do nothing and to grant Accessibility, and explains why.

Errors and empty states: if Windows blocks the microphone or none is found, first run says so and links to the privacy setting.

### Dictate

1. The user places the cursor where the text should go, in any app.
2. The user holds the hotkey; a small overlay shows that the app is listening.
3. The user speaks and releases the key; the overlay shows that the text is being processed.
4. The clean text is pasted at the cursor and the overlay disappears.
5. Whatever the user had in the clipboard before is back in the clipboard.

Errors and empty states: a press shorter than half a second does nothing; silence pastes nothing; a network, quota or microphone failure shows a short message in the overlay, which closes after 4 s or on click, and pastes nothing.

### Per-app style

1. In settings, the user maps an app (for example the mail client or a terminal) to a style and a paste keystroke.
2. From then on, dictating into that app uses that style and keystroke without the user choosing anything.

Errors and empty states: an app with no rule uses the user's default style and the OS's normal paste keystroke.

### Change the hotkey

1. The user opens settings from the tray, clicks Change and presses the new combination.
2. The app proposes it; Save applies it at once and keeps it across restarts.

Errors and empty states: a rejected combination is explained and the old hotkey stays.

### Update

1. When a new version is released the app asks before updating (phase 5).

## Rules

- Dictation is hold to talk: recording lasts exactly as long as the key is held, at most two minutes, after which it stops and is sent.
- Any other key pressed during the hold cancels the dictation.
- A hotkey is two or three keys with at least one modifier; Right Alt is never accepted, because it is AltGr on Spanish keyboards.
- Holding the hotkey while the previous dictation is processing starts a new recording; the earlier text is pasted once the new hold ends, and its failure, if any, arrives as a notification.
- The paste goes only to the window that had focus when the hold began.
- When the paste cannot land (an administrator window, the window changed, the target never read it), the text stays in the clipboard and a notification says so; when the earlier clipboard cannot be put back, a notification says that too.
- Audio leaves the machine only to be transcribed and is never stored.
- The dictated text stays out of Windows clipboard history and the cloud clipboard.
- History, dictionary, styles and app rules are all editable from the app settings.
- Windows comes first; macOS and Linux follow in phase 5.

## Out of scope

- Live transcript while speaking.
- Voice editing commands ("delete that", "new line").
- Choosing the style by hand per dictation; app rules and the default style, picked during onboarding, decide.

## Open questions

- Whether the hotkey setting follows the user across machines or stays per machine.
