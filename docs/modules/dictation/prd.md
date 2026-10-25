---
updated: 2026-10-25
source: 0019_segmented_transcription
---

# Dictation: product

## Purpose

The user speaks and gets clean, ready-to-use text: fillers removed, punctuation added, personal dictionary and chosen style applied.
It is the core of Take My Word ("Your Word, Our Command."): hold a key, speak, release, and the text lands where the user is typing.
Spanish and English; each user says which of the two they speak.

## User flows

### Dictate

1. The user holds the hotkey on desktop, or the talk button on mobile, and speaks.
2. The user releases; the recording is sent.
3. Desktop pastes the clean text into the focused app; mobile shows it with copy and share.

Errors and empty states: recordings under half a second are dropped by the client and refused by the server.
Silence produces empty text and nothing is pasted; a short reply such as "Gracias." spoken at a normal level is kept.
Over the daily quota the dictation is refused and the user is told the daily limit is reached.
If a provider fails the user sees an error and nothing is pasted.

### Choose dictation languages

1. The user picks one or both of English and Spanish, during the desktop's onboarding or later in its settings.
2. With one, every dictation is transcribed in it; with both, each dictation is recognized as one or the other.

Errors and empty states: at least one language stays chosen.

### Say what you do

1. During the desktop's onboarding, or later in its General settings, the user picks up to three fields from a fixed list (software development, biology and life sciences, law...) and may add a short detail in their own words.
2. The context is kept with the user's settings and shown on the web account; dictations do not use it yet.

Errors and empty states: the step can be skipped and the context changed or cleared at any time.

### See today's allowance

1. The user opens General on desktop or the account page on the web.
2. They see the minutes of audio used today against the daily allowance and the local time it resets.

Errors and empty states: a server that does not report usage shows no allowance at all.

### Review history

1. The user opens history on the web or in the desktop settings.
2. The user sees past dictations as text, newest first, from the last 90 days, with the date, the style used, the seconds of audio and the raw transcript collapsed under the text, a page at a time.
3. The user deletes a dictation after confirming; it leaves the list at once.

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
- The style comes from the user's pick, else the active app's rule on desktop, else the user's default, else `plain`; a style that no longer exists never makes a dictation fail.
- A new user's settings start with the `plain` style and English; users who existed before dictation languages keep the language they had.
- With both languages chosen, a dictation recognized as neither is transcribed in the first one; the allowance is charged once.
- A long recording the desktop sends in parts while the user speaks is still one dictation, cleaned and saved once, in one language; a part that fails or answers late goes again with the rest, so no words are lost, and only that part's seconds may count twice.
- The language comes from the user's settings, never from the device; older clients that still send one are ignored.
- Users have no provider choice: each environment runs one transcriber and one refiner, picked by the operator.
- The result is the cleaned text and nothing else.
- The user's context never changes a dictation until a follow-up proves it helps.
- Used minutes are shown rounded up and never above the allowance.

## Out of scope

- Live transcript while speaking.
- Voice editing commands.
- A custom mobile keyboard (v2).
- Teams or shared dictations.
- A latency target; v1 only measures each stage.
- Comparing providers on a golden set: future evaluation harness (phase 7).

## Open questions

- None at setup time.
