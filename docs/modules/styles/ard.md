---
updated: 2026-10-20
source: setup
---

# Styles: architecture and debt

## 2026-10-20: A style is one prompt that works in Spanish and English

- Decision: built-in and custom styles are stored as `STYLE#id` items in the single table, each holding one prompt the refiner applies regardless of the dictation's locale.
- Alternatives rejected: one prompt per locale.
- Reason: the product is Spanish first and English second, and the proposal requires styles to work in both; the refiner already receives the locale with the prompt.
- Debt created: none.
- Revisit when: a style produces visibly worse output in one of the two languages.
- Source: setup

## 2026-10-20: The app rule carries the paste keystroke

- Decision: an `APPRULE#appId` item maps a desktop app to a style and to the keystroke used to paste into it (Ctrl+V, Cmd+V on macOS, Ctrl+Shift+V in terminals).
- Alternatives rejected: one global paste keystroke per platform.
- Reason: terminals ignore Ctrl+V, and the app rule is already the per-app record, so the keystroke lives with the style choice.
- Debt created: elevated windows on Windows reject synthetic input (UIPI), so dictation cannot paste into them; accepted as a known limitation.
- Revisit when: Sebastian needs to dictate into elevated windows.
- Source: setup

## 2026-10-20: Mobile picks the style by hand

- Decision: mobile has a manual style picker and no app rules.
- Alternatives rejected: detecting the target app on mobile.
- Reason: iOS and Android expose no active app to a regular app.
- Debt created: none.
- Revisit when: the keyboard extension (v2) lands and can know which app hosts it.
- Source: setup
