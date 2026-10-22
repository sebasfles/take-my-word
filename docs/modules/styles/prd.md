---
updated: 2026-10-21
source: 0008_desktop_features
---

# Styles: product

## Purpose

A style tells Take My Word how the cleaned text should read: the same spoken words become a casual chat message, a formal email or a terminal command depending on where they land.
Three built-in styles ship first: `plain` (clean only), `casual` (chat) and `formal` (email); the user writes custom ones for the rest.
On desktop, app rules pick the style automatically from the app that has focus, so the user never chooses by hand while dictating.

## User flows

### Dictate with the right style on desktop

1. The user holds the hotkey in some app, speaks and releases.
2. Take My Word recognizes the focused app, finds its app rule and cleans the text with that rule's style.
3. The text is pasted with the rule's paste keystroke (Ctrl+V, Ctrl+Shift+V or Shift+Insert; Cmd+V on macOS).

Errors and empty states: an app without a rule uses the user's default style and Ctrl+V; a rule whose style was deleted uses the default style.

### Pick a style on mobile

1. The user chooses a style in the picker on the dictation screen.
2. Every dictation uses it until the user changes it.

Errors and empty states: mobile cannot see other apps, so there are no app rules there; with no choice made, the default style applies.

### Manage styles and app rules

1. In settings on desktop or mobile, the user sees the built-in styles and their own custom ones; the web shows them read-only.
2. The user creates a custom style by naming it and writing how the text should read.
3. The user adds an app rule: an app, the style to use in it and the paste keystroke.
4. The user edits or deletes custom styles and app rules at any time.

Errors and empty states: a new user sees only the built-in styles and no app rules.
On desktop a rule's app is picked from the apps with an open window or typed as its executable.

## Rules

- Every style works in Spanish and English; the user does not keep one copy per language.
- Built-in styles are the same for every user and cannot be edited or deleted.
- The default style is picked during onboarding and can be changed later in settings.
- Deleting a custom style that app rules point to makes those rules fall back to the default style; if it was the default style, the default becomes `plain`.
- A user keeps up to 20 custom styles (name up to 40 characters, directions up to 2000) and up to 100 app rules.
- A custom style changes tone and register only; the cleanup rules (no fillers, keep the meaning, add nothing) always hold.
- Custom styles and app rules belong to one user and nobody else sees them.
- A style shapes tone and format only; the dictionary still corrects terms whatever the style.

## Out of scope

- Sharing styles between users or teams.
- Detecting the active app on mobile.
- Choosing a style by voice.

## Open questions

- None at setup time.
