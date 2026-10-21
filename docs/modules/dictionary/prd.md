---
updated: 2026-10-20
source: setup
---

# Dictionary: product

## Purpose

The dictionary is the user's list of words that dictation must get right: names, brands, jargon, words in the other language.
Each term can carry "sounds like" aliases, the ways speech recognition tends to mishear it.
Every dictation uses the dictionary twice: first to steer the transcription toward the right spelling, then to correct what still came out wrong.
The user writes a term once and stops fixing it by hand.

## User flows

### Add a term

1. The user opens the dictionary in the desktop or mobile app; the web shows it read-only.
2. They type the term exactly as it must be written, and optionally one or more "sounds like" aliases.
3. The term appears in the list and applies from the next dictation.

### Edit or remove a term

1. The user picks a term in the list.
2. They change its aliases or remove it.
3. The change applies from the next dictation.

### Dictate with the dictionary

1. The user dictates as usual on desktop or mobile.
2. Terms they say come out spelled as in the dictionary, including when the recognizer heard an alias.
3. Each time a term shows up in a saved dictation, it rises in priority; terms not used for weeks slowly lose it.

Errors and empty states: with no terms, dictation works the same, only without corrections.
Adding a term that already exists is rejected with a message.

## Rules

- A dictionary belongs to one user and is private to them.
- Terms work in Spanish and English alike.
- The transcription stage can only take a limited number of terms; the ones used most and most recently go first, and a new term starts as if used once on the day it was added.
- The correction stage always sees every term with its aliases, so a low-priority term is still fixed after transcription.
- Priority halves after about a month without use; the period is configurable.
- Priority is not shown or edited by hand.

## Out of scope

- Shared or team dictionaries.
- Importing or exporting a dictionary.
- Suggesting terms automatically from past dictations.

## Open questions

- Maximum number of terms or aliases per user.
- None at setup time.
