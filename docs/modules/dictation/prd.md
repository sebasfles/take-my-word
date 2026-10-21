---
updated: 2026-10-21
source: 0001_platform_skeleton
---

# Dictation: product

## Purpose

The user speaks and gets clean, ready-to-use text: fillers removed, punctuation added, personal dictionary and chosen style applied.
It is the core of Take My Word ("Your Word, Our Command."): hold a key, speak, release, and the text lands where the user is typing.
Spanish first, English second.

## User flows

### Dictate

1. The user holds the hotkey on desktop, or the talk button on mobile, and speaks.
2. The user releases; the recording is sent.
3. Desktop pastes the clean text into the focused app; mobile shows it with copy and share.

Errors and empty states: recordings under half a second are dropped by the client and refused by the server.
Silence produces empty text and nothing is pasted; a short reply such as "Gracias." spoken at a normal level is kept.
Over the daily quota the dictation is refused and the user is told the daily limit is reached.
If a provider fails the user sees an error and nothing is pasted.

### Review history

1. In the web account the user opens history (phase 5).
2. The user sees past dictations as text, newest first, from the last 90 days.

Errors and empty states: with no dictations, the list is empty.

## Rules

- The user can delete a dictation from the history at any time.
- The daily quota resets at UTC midnight.
- History is shown on desktop, mobile and web.

- Each user has a daily allowance of 60 minutes of audio, the same for everyone until per-user limits arrive; a recording that starts under the limit finishes, even if it ends past it.
- Silence that never reaches a provider does not count against the allowance; anything transcribed does, even if it turns out empty.
- A single recording is at most 4 MB, about 2 minutes from desktop and about 8 from mobile.
- Audio is never kept; only the text, deleted after 90 days.
- A user only ever sees their own dictations.
- The style comes from the user's pick, else the active app's rule on desktop, else the user's default.
- The transcription and cleanup providers follow the user's settings; a dictation may override them.
- The result is the cleaned text and nothing else.

## Out of scope

- Live transcript while speaking.
- Voice editing commands.
- A custom mobile keyboard (v2).
- Teams or shared dictations.
- A latency target; v1 only measures each stage.
- Comparing providers on a golden set: future evaluation harness (phase 7).

## Open questions

- None at setup time.
