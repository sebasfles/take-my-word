---
updated: 2026-10-22
source: 0011_desktop_rebrand
---

# Desktop: product

## Purpose

Desktop is the primary way to use Take My Word.
The user holds a key, speaks, releases, and clean text appears in whatever app has focus, in Spanish or English.
It must feel like typing got faster: no window to open, no copy and paste, the user's clipboard left as it was.

## User flows

### First run

1. The user downloads the installer from the landing, installs it, and the app lives in the system tray, starting with Windows unless turned off.
2. The app asks for username and password; a temporary password must be replaced by the user's own before going on.
3. The first time a user signs in on this machine, the app asks for the dictation languages, with Windows' language preselected, and for a default style, with the current one preselected; dictating already works while the choice is pending.
4. The app explains which keys to hold (Ctrl+Win on Windows, Ctrl+Alt+Win in the dev app, Fn on macOS, Ctrl+Super on Linux) and that the microphone listens only during the hold.
5. On macOS the app asks the user to set "Press Fn key to" to do nothing and to grant Accessibility, and explains why.

Errors and empty states: Windows SmartScreen warns on the first install because the installer is not code-signed; a wrong username or password gets one generic message; an unreachable service says so; if Windows blocks the microphone or none is found, first run says so and links to the privacy setting.

### Dictate

1. The user places the cursor where the text should go, in any app.
2. The user holds the hotkey; a small overlay shows that the app is listening, with bars that follow the voice and stay flat in silence.
3. The user speaks and releases the key; the overlay shows that the text is being cleaned up.
4. The clean text is pasted at the cursor and the overlay disappears.
5. Whatever the user had in the clipboard before is back in the clipboard.

Errors and empty states: a press shorter than half a second does nothing; silence pastes nothing; a network, daily limit, too long, unsupported format or microphone failure shows a short message in the overlay, which closes after 4 s or on click, and pastes nothing; an ended session says "sign in" and opens the sign-in window.

### Settings

1. Settings has sections for General (shortcut, autostart, theme, app language, dictation languages, and About with the version), Dictionary, Styles (default and custom), App rules, History and Account; the tray's "Add a word" opens Dictionary with the term field ready.
2. An app rule maps an app, picked from the open windows or typed as its executable, to a style and a paste keystroke (Ctrl+V, Ctrl+Shift+V or Shift+Insert); dictating into that app then uses both without the user choosing anything.
3. History shows the last dictations with "load more", the raw transcript collapsed, copy and delete.

Errors and empty states: an app with no rule uses the user's default style and Ctrl+V; limits and duplicates are explained next to the form; every delete asks first; an empty section says what it is for.

### Change the hotkey

1. The user opens settings from the tray, clicks Change and presses the new combination.
2. The app proposes it; Save applies it at once and keeps it across restarts.

Errors and empty states: a rejected combination is explained and the old hotkey stays.

### Sign out

1. The user signs out from the tray or from settings.
2. The device is forgotten, its session revoked and the keychain cleared, even when the service cannot be reached; the sign-in window opens.

### Update

1. At start and every 6 hours the app looks for a new version.
2. When there is one, a small window shows the version and its notes, without taking focus from the app the user is typing in.
3. "Install and restart" downloads it, installs it once no dictation is in progress, and the app comes back on the new version; "Later" hides it until the next check.

Errors and empty states: a failed download or install says so and offers to try again; the current version keeps running.

## Rules

- Signed out, holding the hotkey records nothing; it says "sign in" and opens the sign-in window.
- Dev and prd are separate apps, "Take My Word Dev" and "Take My Word", with their own sign-in, settings and autostart, so both can sit on one machine.
- Dictation is hold to talk: recording lasts exactly as long as the key is held, at most two minutes, after which it stops and is sent.
- Any other key pressed during the hold cancels the dictation.
- A hotkey is two or three keys with at least one modifier; Right Alt is never accepted, because it is AltGr on Spanish keyboards.
- The dev app defaults to Ctrl+Alt+Win so it can sit beside the prd app on Ctrl+Win; a hotkey the user saved is kept.
- Holding the hotkey while the previous dictation is processing starts a new recording; the earlier text is pasted once the new hold ends, and its failure, if any, arrives as a notification.
- The paste goes only to the window that had focus when the hold began.
- When the paste cannot land (an administrator window, the window changed, the target never read it), the text stays in the clipboard and a notification says so; when the earlier clipboard cannot be put back, a notification says that too.
- Audio leaves the machine only to be transcribed and is never stored.
- The dictated text stays out of Windows clipboard history and the cloud clipboard, and only the target app is given it.
- The app speaks Spanish when Windows does, English otherwise, and follows Windows' light or dark theme; a choice of either in General applies to every open window at once and is kept, and the overlay looks the same in both themes.
- The tray icon tells the state at a glance: ready, listening during a hold, or needing attention while signed out or with the microphone blocked or missing; its tooltip names the state.
- Windows comes first; macOS and Linux follow in phase 5.

## Out of scope

- Live transcript while speaking.
- Voice editing commands ("delete that", "new line").
- Choosing the style by hand per dictation; app rules and the default style, picked during onboarding, decide.

## Open questions

- Whether the hotkey setting follows the user across machines or stays per machine.
