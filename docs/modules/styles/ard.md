---
updated: 2026-10-21
source: 0003_api_features
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

## 2026-10-21: Built-in prompts are written once, in English, and keep the dictation's language

- Decision: `casual` and `formal` are English directions that tell the model to answer in the dictation's language and name the Spanish and English forms of address (tú or usted, contractions or not); `plain` has no directions.
- Alternatives rejected: Spanish directions; one copy per language.
- Reason: one prompt serves both locales as the styles decision requires, and naming the forms of address gives the model a concrete register in each language; in dev the same Spanish recording came out with tú under casual and usted under formal.
- Debt created: none.
- Revisit when: a built-in produces visibly worse text in Spanish than in English.
- Source: 0003_api_features

## 2026-10-21: Deleting a style releases its references after the delete, best effort

- Decision: `DELETE /styles/{id}` deletes the style, then conditionally removes `styleId` from every rule still holding it and resets the default to `plain` if it was that style; a failure there is logged and the request still answers 204.
- Alternatives rejected: a transaction over the style, every rule and the settings.
- Reason: resolution already skips unknown ids, so a missed cleanup costs nothing at dictation time, and a transaction would cap the number of rules it can touch.
- Debt created: after a failed cleanup, `GET /app-rules` can show a `styleId` that no longer exists until the rule is edited.
- Revisit when: a client shows a dangling style to a user.
- Source: 0003_api_features
