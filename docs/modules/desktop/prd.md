---
updated: 2026-10-23
source: 0016_self_hosting
---

# Desktop: product

## Purpose

Desktop is the primary way to use Take My Word.
The user holds a shortcut, speaks and releases, or taps it twice and talks hands-free, and clean text appears in whatever app has focus, in Spanish or English.
It must feel like typing got faster: no window to open, no copy and paste, the user's clipboard left as it was.

## User flows

### First run

1. The user downloads the installer from the landing, installs it, and the app opens its main window maximized; it lives in the system tray afterwards and starts with Windows unless turned off.
2. One flow in the main window walks through what Take My Word does, sign-in (a temporary password is replaced by the user's own), a microphone check with a live level that records and sends nothing, the shortcut with both gestures and a box to practice in, the dictation languages (Windows' language preselected), what the user does (up to three fields and an optional detail, skippable, kept with the settings), the default style chosen by seeing the same sentence in each built-in style, and where the app lives afterwards.
3. Signing in again later asks only for what is missing on this machine: a known user goes straight in, a new user picks languages, what they do and style.
4. The flow can be run again from Settings; a user who set up 0.2.0 sees no flow and gets one dismissible note about hands-free and what they do in General.
5. On macOS the app asks the user to set "Press Fn key to" to do nothing and to grant Accessibility, and explains why.

Errors and empty states: Windows SmartScreen warns on the first install because the installer is not code-signed; a wrong username or password gets one generic message; an unreachable service says so; if Windows blocks the microphone or none is found, the microphone step says so and links to the privacy setting; the microphone check records and sends nothing.

### Dictate

1. The user places the cursor where the text should go, in any app, the app's own windows included.
2. To hold to talk, the user holds the shortcut, speaks and releases; to dictate hands-free, the user taps the shortcut twice, speaks, and taps it once to finish, or presses Esc to cancel.
3. While listening the overlay shows only the moving waveform, with a small stop button when hands-free; while cleaning up it shows only a spinner.
4. The clean text is pasted at the cursor and the overlay disappears.
5. Whatever the user had in the clipboard before is back in the clipboard.

Errors and empty states: a single short tap does nothing; silence pastes nothing; a network, daily limit, too long, unsupported format or microphone failure shows a short message in the overlay, which closes after 4 s or on click, and pastes nothing; an ended session opens sign-in in the main window.

### Settings

1. Settings has sections for General (shortcut with both gestures, autostart, theme, app language, dictation languages, what the user does, today's minutes against the daily allowance, how to dictate, the setup guide to run again, and About with the version), Dictionary, Styles (default and custom), App rules, History and Account; the tray's "Add a word" opens Dictionary with the word field ready.
2. The layout fills the window: content is centered at a readable width, with a second column where it helps (General's how-to and About, an editor's form beside its list), and nothing grows with the window.
3. An app rule maps an app, picked from the open windows or typed as its executable, to a style and a paste keystroke (Ctrl+V, Ctrl+Shift+V or Shift+Insert); dictating into that app then uses both without the user choosing anything.
4. History shows the last dictations with "load more", the raw transcript collapsed, copy and delete.

Errors and empty states: an app with no rule uses the user's default style and Ctrl+V; limits and duplicates are explained next to the form; every delete asks first; an empty section says what it is for.

### Open the app

1. Opening Take My Word from Start, a shortcut or its executable while it runs in the tray brings its main window to the front, restored if minimized.
2. At sign-in to Windows it starts in the tray without opening a window, unless sign-in or setup is needed.

### Change the hotkey

1. The user opens settings from the tray, clicks Change and presses the new combination.
2. The app proposes it; Save applies it at once and keeps it across restarts.

Errors and empty states: a rejected combination is explained and the old hotkey stays.

### Sign out

1. The user signs out from the tray or from settings.
2. The device is forgotten, its session revoked and the keychain cleared, even when the service cannot be reached; the sign-in window opens.

### Use your own server

1. On the sign-in step, a small "Use your own server" link under the sign-in button asks for a domain.
2. The app reads that domain's Take My Word configuration, checks it, and shows the domain on the sign-in step with "Use the official server" next to it; sign-in then goes to that server.
3. Settings, Account shows the server in use; signing out keeps the choice and offers the way back to the official server.

Errors and empty states: a malformed domain, an unreachable host, a site that is not Take My Word, a newer server version than the app knows, or a change attempted while signed in each get their own message, and the current server stays.

### Update

1. At start and every 6 hours the app looks for a new version.
2. When there is one, a small window shows the version and its notes, without taking focus from the app the user is typing in.
3. Updates always come from the official releases, whichever server the user signs in to.
4. "Install and restart" downloads it, installs it once no dictation is in progress, and the app comes back on the new version; "Later" hides it until the next check.

Errors and empty states: a failed download or install says so and offers to try again; the current version keeps running.

## Rules

- Signed out, the shortcut records nothing; it says "sign in" and opens sign-in in the main window.
- Dev and prd are separate apps, "Take My Word Dev" and "Take My Word", with their own sign-in, settings and autostart, so both can sit on one machine.
- Hold to talk records while the shortcut is held; hands-free starts with two taps (the second within 300 ms of the first release, each under half a second) and stops at the release of the next tap; either way a dictation lasts at most two minutes, after which it stops and is sent.
- Any other key pressed during a hold cancels it; during hands-free other keys are left alone, the shortcut pressed together with another key is a shortcut and keeps listening, and Esc cancels without reaching the app.
- A hotkey is two or three keys with at least one modifier; Right Alt is never accepted, because it is AltGr on Spanish keyboards.
- The dev app defaults to Ctrl+Alt+Win so it can sit beside the prd app on Ctrl+Win; a hotkey the user saved is kept.
- Starting a dictation while the previous one is processing starts a new recording; the earlier text is pasted once the new dictation ends, and its failure, if any, arrives as a notification.
- The paste goes only to the window that had focus when the dictation began; in the app's own window the text is inserted at the cursor of the focused field.
- Terminals need no app rule: Windows Terminal (WSL, tmux, Claude Code, PowerShell) and the classic console take the dictation with Ctrl+V, and multi-line text keeps its line breaks and arrives as one block where the shell supports it.
- In a Windows Terminal tab running Windows PowerShell 5.1, a multi-line dictation brings up the terminal's own warning, and confirming it runs every line but the last, because PSReadLine 2.0 has no bracketed paste; that is the terminal's behavior, not the app's, which never adds a line break or an Enter.
- When the paste cannot land (an administrator window, a terminal run as administrator included, since Windows blocks typed input there; the window changed; the target never read it), the text stays in the clipboard and a notification says why; when the earlier clipboard cannot be put back, a notification says that too.
- Audio leaves the machine only to be transcribed and is never stored.
- The dictated text stays out of Windows clipboard history and the cloud clipboard, and only the target app is given it.
- The app speaks Spanish when Windows does, English otherwise, and follows Windows' light or dark theme; a choice of either in General applies to every open window at once and is kept, and the overlay looks the same in both themes.
- The tray icon tells the state at a glance: ready, listening during a dictation, or needing attention while signed out or with the microphone blocked or missing; its tooltip names the state.
- The desktop app animates its overlay and views even with Windows' animation effects off.
- Windows comes first; macOS and Linux follow in phase 5.

## Out of scope

- Live transcript while speaking.
- Voice editing commands ("delete that", "new line").
- Choosing the style by hand per dictation; app rules and the default style, picked during onboarding, decide.

## Open questions

- Whether the hotkey setting follows the user across machines or stays per machine.
