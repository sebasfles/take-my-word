---
updated: 2026-10-20
source: setup
---

# Mobile: product

## Purpose

Take My Word on the phone: hold a button, speak, release, and get clean text ready to copy or share into any app.
Phones do not let a regular app type into other apps, so mobile hands the text over through the clipboard and the share sheet instead of pasting it.
It uses the same account, dictionary and styles as the desktop, so a term taught once is spelled right everywhere.

## User flows

### Sign in

1. On first launch the user sees a username and password form (see [auth](../auth/prd.md)).
2. After signing in the app opens on the dictation screen and stays signed in across restarts until sign-out or revocation.

Errors and empty states: wrong credentials show an error on the form; a revoked session sends the user back to the form.

### Dictate

1. The user holds the talk button and speaks; the screen shows that it is listening.
2. On release the screen shows that it is processing, then the clean text.
3. The user taps copy, or opens the share sheet to send the text to another app.

Errors and empty states: the first recording asks for microphone permission, and a denied permission shows how to enable it.
A tap shorter than half a second records nothing.
Silence returns no text and the screen says nothing was heard.
Reaching the daily quota or losing the connection shows an error and keeps nothing.

### Pick a style

1. The user chooses a style from the picker on the dictation screen.
2. Every dictation uses it until the user changes it; with no choice made, the default style applies.

Errors and empty states: a new user sees only the built-in styles.

## Rules

- iOS and Android ship together in phase 4, distributed through TestFlight and Play internal testing.
- Dictionary, styles and history are editable in the app, like on desktop; app rules do not exist on mobile.

- Spanish first, English second; the dictated language follows the user's settings.
- The style is always picked by hand; there are no app rules on the phone.
- Each user has 60 minutes of audio per day across all their devices.
- Audio never leaves the request; only the text is kept, for 90 days.
- Only invited users can sign in; there is no sign-up in the app.

## Out of scope

- A custom keyboard that dictates inside other apps (v2).
- Pasting into other apps automatically.
- A live transcript while speaking, and editing text by voice.

- Google sign-in until phase 6.

## Open questions

- None at setup time.
- Whether the user can switch the dictation language on the dictation screen.
