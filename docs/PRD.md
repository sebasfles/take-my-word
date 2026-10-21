---
updated: 2026-10-20
source: setup
---

# Product Requirements Document

## Product

Take My Word ("Your Word, Our Command.") is a personal voice-to-text dictation tool.
Hold a key, speak, release: the recording is transcribed, cleaned (fillers removed, punctuation, the user's own terms spelled right, a chosen style) and pasted into the app that has focus.
It works in Spanish first and English second, on desktop, phone and web.
In v1 it serves Sebastian and the people he invites; there is no public sign-up and no pricing.

## Users

- Invited user: dictates on desktop and phone, where they also keep their dictionary, styles and history; the web shows the same account read-only.
- Sebastian: the same, plus creating accounts and operating the service.

## Capabilities

### Sign in and stay signed in

The user signs in once per device with username and password and stays signed in until they sign out.
Accounts are created by Sebastian.
Details: [modules/auth/prd.md](modules/auth/prd.md)

### Dictate on desktop

From the tray app, the user holds the hotkey, speaks, releases, and clean text lands in the focused app with the keystroke that app needs.
An overlay shows listening and processing.
Windows first, then macOS and Linux.
Details: [modules/desktop/prd.md](modules/desktop/prd.md)

### Turn speech into clean text

Every dictation is transcribed, refined with the user's dictionary and style, returned and kept as text for 90 days.
Silence produces nothing; each user has a daily allowance of audio minutes.
Details: [modules/dictation/prd.md](modules/dictation/prd.md)

### Keep a personal dictionary

The user lists terms and how they sound so dictation spells them right; the most used and most recent terms steer transcription and the full list corrects the result.
Details: [modules/dictionary/prd.md](modules/dictionary/prd.md)

### Choose how text reads

Built-in and custom styles decide the tone; on desktop a rule per app picks the style and the paste keystroke automatically.
Details: [modules/styles/prd.md](modules/styles/prd.md)

### Dictate on the phone

The user holds a button, speaks, releases, then copies or shares the text, picking the style by hand.
Details: [modules/mobile/prd.md](modules/mobile/prd.md)

### See the account on the web

The web is informative: it shows the account, dictionary, styles, app rules and history read-only, and the landing page offers the downloads.
Editing happens in the desktop and mobile apps.
Details: spread across the module files above; the landing is phase 5.

### Run the service

One AWS account, dev and prd environments, deploys on merge.
Details: [modules/infra/prd.md](modules/infra/prd.md)

## Cross-cutting rules

- One account works on every surface: the same dictionary, styles and history everywhere.
- Password recovery is done by Sebastian by hand in v1.
- Audio is never stored; only the resulting text, for 90 days.
- Spanish and English are both first-class in transcription and styles.
- A dictation never pastes or shows invented text: on silence or failure the user gets nothing plus a short message.

## Not in the product

- Live streaming transcript while speaking.
- Voice editing commands ("delete that", "new paragraph").
- A custom mobile keyboard (v2).
- Teams, sharing or collaboration.
- Google sign-in and public sign-up (later phases).
- Comparing providers side by side: a later capability, after v1 works.

- Desktop and mobile offer the same features; the web only shows them.
- During onboarding the user picks a default style and can change it later in settings.

## Open questions

- None at setup time.
