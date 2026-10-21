---
id: "0008"
title: desktop_features
type: feature
crew: pair
clearance: full
branch: feat/0008_desktop_features
modules: [desktop, dictionary, styles, dictation]
repos: ["."]
phases: 0
depends_on: ["0003", "0007"]
ticket:
created: 2026-10-21
updated: 2026-10-21
---

# 0008 Desktop features: editors, history, Spanish UI, waveform

## Goal

From the tray app the user manages everything the PRD gives desktop: their dictionary, custom styles, per-app rules, default style and dictation history, in Spanish or English following Windows, and sees their voice move in the overlay while they speak.
This closes the Windows MVP.

## Scope

- Settings window gains sections next to the existing hotkey and account ones:
  - Dictionary: list terms with aliases, use count and last used date; add a term with aliases; edit aliases; delete; client-side validation matching the API limits (500 terms, 10 aliases, 64 chars) and the 409 duplicate message.
  - Styles: built-ins `plain`, `casual`, `formal` read-only with their description; custom styles listed, created, edited (name up to 40, prompt up to 2000) and deleted; up to 20.
  - Default style: picker over built-ins and custom styles, saved with `PUT /me/settings`; the onboarding picker from 0007 reuses the same component.
  - App rules: list rules (app, style or "default style", paste keystroke); add a rule by choosing a running app from a list of open windows' executables or typing the executable name; style picker; paste keystroke picker (`ctrl+v`, `ctrl+shift+v`, `shift+insert`); edit and delete; up to 100.
  - History: dictations newest first with text, collapsed raw transcript, style, date and audio seconds; "load more"; delete with confirmation; a "copy" action per dictation.
- A tray shortcut "Add a word" opens the dictionary section with the add form focused.
- Overlay waveform: the shell sends the input level about 20 times per second while listening; the overlay draws a small animated bar or wave from it; no cost when the overlay is hidden.
- Desktop UI localization: every view (first run, sign-in, choose password, onboarding, settings and its sections, overlay messages, tray menu, notifications, and 0005's update window if it is on develop) in Spanish and English, following the Windows display language, Spanish fallback; strings in two small dictionaries, no i18n framework, consistent with the update window's approach.
- API access stays in Rust (tokens never reach the WebView, `docs/modules/desktop/ard.md` 2026-10-21): Rust commands for every CRUD route the views need; serde mirrors extended for dictionary, styles, app rules, settings and history, all covered by the JSON Schema contract test from 0007. The analyze step decides whether that mirror is still the right trade at this size or a different boundary is warranted (the ARD entry names 0008 as the revisit point); the decision goes to `docs/modules/desktop/ard.md`.
- Screenshots of every new view and state (lists, empty states, forms with validation errors, history, overlay with waveform) at 390, 768 and 1280 px with the mocked bridge, in both languages, under `.workspaces/0008_desktop_features/screenshots/` and listed in the PR.
- Windows smoke with the dev app against dev on a throwaway user: create a term, a custom style, a rule for `notepad.exe` with that style, dictate into Notepad and see the style applied, see the dictation in history, delete it; announced with computer busy/free.
- Docs: desktop, dictionary, styles and dictation module docs via `document-task`.

## Out of scope

- macOS and Linux implementations of the active-window list and keychain (phase after the MVP).
- Import or export of dictionary or history; search and filters.
- Choosing a style per dictation from the overlay.
- The quota display (`GET /me/usage` is its own draft).
- Deferred: a per-app rule suggestion when the user dictates into an app without a rule.

## Acceptance

1. Root `pnpm lint`, `typecheck`, `test`, the desktop `cargo` checks and the contract test pass; `ci`, `desktop-ci windows` and `linux-check` green on the PR.
2. Every CRUD in the dictionary, styles, default style and app rules sections works against dev with a throwaway user, and the API limits and the 409 duplicate show as inline messages, not raw errors.
3. A rule for `notepad.exe` pointing to a custom style makes a dictation into Notepad come back in that style (evidence in the PR from the dev API response and the pasted text); deleting the style leaves the rule on "default style".
4. History shows the user's dictations newest first with "load more", the raw transcript collapsed, copy and delete with confirmation; a deleted dictation is gone from `GET /dictations`.
5. With Windows in Spanish every visible string is Spanish; with English, English; any other language falls back to Spanish (verified by unit tests over the dictionaries for missing keys and by screenshots in both languages).
6. While holding the hotkey and speaking, the overlay shows a level animation that follows the voice and stays flat on silence; idle CPU with the overlay hidden does not rise compared to 0007 (measured).
7. Tokens never reach the WebView (no token in IPC payloads, logs or screenshots); every new route goes through Rust.
8. Screenshots for every new view at the three widths in both languages are in the workspace and listed in the PR; no horizontal scroll at 390 px.
9. RAM idle in the tray stays within 10 MB of 0007's measurement after opening and closing settings.

## Approach

- Sections inside the existing settings window with a left navigation; alternative rejected: separate windows per editor, more WebViews and memory.
- Level metering in the audio thread (RMS over 50 ms) emitted as a Tauri event only while the overlay is visible; alternative rejected: streaming samples to the WebView.
- Localization through two dictionaries keyed by message id, chosen once from the Windows UI language at startup; the Rust side sends message ids, never English strings, for overlay messages and notifications.
- Running apps list from top-level visible windows' process executables, lowercased like the API's `appId`.

## Database

None new; reads and writes `DICT#`, `STYLE#`, `APPRULE#`, `SETTINGS`, `DICTATION#` through the API from 0003.

## Infra

- None in AWS.
- Windows machine rules (from 0002): the toolchain is installed; this task keeps its own mirror checkout at `C:\dev\tmw-0008` and scratch under `C:\dev\tmw-0008-*`, removed at clean-task. Injected runs need Sebastian away: start only after 2 minutes of Windows idle, abort and restore on real input, and announce each run to the om-manager with `computer busy: <what, how long>` before and `computer free` after, restoring the dev app install, hotkey, autostart, microphone setting and clipboard. 0005 may run in parallel: never touch its mirror, and never start an injected run while the om-manager has not relayed 0005's `computer free`.
- Disk: C: has about 12 GB free; keep one Rust target, delete intermediate build folders between rounds when space drops under 8 GB, and tell the om-manager.

## Design

None; sections designed in code and reviewed from the screenshots.

## Risks

- The serde mirror grows to most of the API surface; the analyze decision on the boundary matters.
- Waveform event rate on a slow machine; throttle and drop frames rather than queue.
- Localization touches every view from 0002 and 0007; screenshots in both languages are the safety net.

## Depends on

0003 (PR #3) and 0007 (PR #10), both merged. Runs alongside 0005.

## Context & decisions

Consolidated 2026-10-21; answers by Sebastian through the om-manager unless marked (om-reviewer).

- Scope adjusted, paste keystroke: today every paste is Ctrl+V (`src-tauri/src/paste.rs`, `EnigoKeystroke`), so the rule's keystroke would be dead UI. Rust keeps the user's app rules in memory (loaded at startup and sign-in, reloaded after every rule change, refreshed in the background at hotkey down when older than 5 min, never awaited by the hotkey) and pastes with the target's rule keystroke, Ctrl+V otherwise; `cmd+v` on Windows reads as Ctrl+V. Rejected: the keystroke in `POST /dictations`, an API change that reaches dev only after merge.
- Acceptance 3 adjusted: the `notepad.exe` rule uses `shift+insert` and the styled text lands in Notepad.
- Boundary (om-reviewer, accepted by Sebastian): one Rust command forwards a closed enum of named routes (ids and query as parameters, percent-encoded by Rust, never a raw path or URL, `POST /dictations` excluded), attaches the token, renews once on a bare 401/403 as `authed.rs` does, and returns the JSON body or a typed failure `{kind, status, code}` with no English text. The WebView validates requests and responses with the zod schemas and limits of `packages/shared`. Rust mirrors only what it reads itself (dictation, error, settings, style list, app rule list), all in the contract test. `document-task` records it in `docs/modules/desktop/ard.md`, superseding the mirror-per-route part of "Tokens never reach the WebView" for the editors.
- Acceptance 6 adjusted: the meter is a pure function tested on a speech WAV and on silence; a real hold in the silent room on Windows shows a flat line; "follows the voice" is Sebastian's check from the PR installer.
- History copy: through a Rust command with the paste's exclusion flags (out of Win+V history and the cloud clipboard, `desktop/prd.md` Rules), no restore.
- Acceptance 6 and 9 adjusted (om-reviewer, accepted): 0007 measured neither RAM nor CPU, so the crew first measures the base commit's dev release build, then 0008's, both with 0002's method (Task Manager private working set of the app plus WebView2, idle in the tray, after opening and closing settings; CPU seconds of the same processes over 5 idle minutes with the overlay hidden).
- Localization (om-reviewer): two JSON dictionaries `es` and `en` keyed by message id, imported by the views and embedded in Rust with `include_str!` for the tray, notifications and window titles; language picked once at startup from `locale.rs` (es fallback), sent to the views like 0005's `UpdateView.language`. Overlay errors, notifications, `Problem` and every command error cross IPC as ids, never English. The debug-only stub menu stays English. Vitest fails on a key missing in either file; a Rust test resolves every id Rust uses.
- Built-in styles (om-reviewer): named and described from the dictionaries with the web's wording (`apps/web/src/lib/i18n.ts`, `styles/ard.md` 2026-10-21), never their prompt; a dangling `styleId` reads "deleted style", no `styleId` reads "default style", as on the web.
- Settings window (om-reviewer): resizable with a larger default and a minimum size; the left nav collapses on top at narrow widths; "Add a word" opens or navigates the existing window to the dictionary with the add form focused. Onboarding reuses the default-style picker component.
- Limits (om-reviewer): views pre-check counts and lengths with the shared limits; a create's 400 (a race past a count limit) and the 409 map to localized inline messages.
- Running apps (om-reviewer): top-level visible windows, the same executable and `ApplicationFrameHost` mapping as `foreground/win32.rs`, lowercased, deduplicated, without this app, so the stored `appId` matches what dictation sends (`desktop/database.md` invariant).
- Waveform (om-reviewer): the cpal callback only updates an atomic level; a 50 ms emitter runs only while Listening and sends the latest value (drop, never queue); no thread, timer or event while idle.
- 0005: whichever merges second reconciles `locale.rs`, `bridge.ts`, `windows.rs` and the tray; if 0005 is on `develop`, its update window moves into the dictionaries.
- Delivery (om-reviewer): one branch, three review milestones, one PR: (1) boundary, dictionaries across the existing views, tray, notifications and overlay, nav layout; (2) editors, history, "Add a word", keystroke, screenshots in both languages; (3) waveform, Windows smoke, measurements, `desktop-ci`, docs.

Constraints: `docs/modules/desktop/ard.md` (tokens, overlay kept warm, delayed-rendered paste), `styles/ard.md` (release on delete), `dictation/ard.md` (settings replaced whole: read before `PUT`); Rust checks from WSL with `TMW_WINDOWS_CHECKOUT='C:\dev\tmw-0008'`; Windows idle and `computer busy`/`computer free` rules from Infra; never touch 0005's mirror.

Review focus beyond the Pipeline: no token, refresh token or dictation text in IPC payloads, logs (the forwarder logs route name and status only), screenshots or the PR; the route enum cannot reach an arbitrary path; no English string reaches a view from Rust; no work in the audio callback beyond the atomic; the keystroke used for the target is the cached rule's.

clearance: full: AWS profile `fless-takemyword` on dev (throwaway users created and deleted, Polly speech), the Windows host under the machine rules with mirror `C:\dev\tmw-0008`, GitHub as sebasfles with `GH_TOKEN="$(gh auth token --user sebasfles)"`; no Terraform, no prd.

## om-developer notes

### Round 1 (milestone 1)

Did:
- Boundary: `api_request` forwards a closed `Route` enum (`api/routes.rs`, serde `deny_unknown_fields`, no dictation route); ids are one percent-encoded path segment, empty or dot-only ids are refused before sending; the history cursor is encoded into the query; 204 reads as `null`; failures cross as `{kind, status, code}`; the forwarder logs route name, kind and status only, never bodies or network error text.
  Renewal reuses `AuthedApi::authorized`.
- `src/api.ts`: one typed client per route, requests validated and normalized with the `packages/shared` input schemas before reaching Rust, responses parsed with the shared schemas, failures as `ApiError`.
- Localization: `src/i18n/es.json` and `en.json`, flat ids, `{name}` placeholders like the web; Rust embeds them (`i18n.rs`) for the tray, notifications and the first-run title; overlay errors, `Problem` and every command error (hotkey, autostart, microphone settings) cross IPC as ids.
  `Language` in `locale.rs` copies 0005's shape to ease the merge.
- Views localized (sign-in, choose password, onboarding, first run, settings, overlay); built-in style names from the dictionaries (`styleNames.ts`), custom names as stored; Shift shows as "Mayús" in Spanish.
- Settings window: 880x640, resizable, minimum 380x480; left nav (General, Account) that wraps on top under 640 px; `section=` in the URL picks the opening section (for "Add a word" in milestone 2).
- Screenshots: `pnpm screenshots` renders every state in es and en and fails when a page scrolls sideways; 192 files in the workspace `screenshots/`.

Decisions not in the plan:
- The language reaches the views as `lang=` in each window URL set by Rust, read once in `main.tsx`, instead of a field in a command response: the first frame is already in the right language and the overlay needs no extra call.
- Notifications take a sentence of message ids (`Notifier::notify(&[Message])`), so "the previous dictation was not pasted" is composed from two ids instead of English text.
- Hotkey limits (2 and 3 keys) are written into the dictionary text, not interpolated, since `Problem` carries no values.
- `api_request` lives in a new `editors.rs`; `blocking` moved to `commands.rs` for reuse.

Pending (milestones 2 and 3): editors, history, "Add a word", keystroke cache and its app rule mirror, running apps, copy, default-style picker shared with onboarding, waveform, Windows smoke, measurements, docs.

Deferred: none.

### Round 2

Did:
- Finding 1: `ShortcutRow` cancels the Rust capture on unmount when it is listening or proposed, so switching sections mid-capture never leaves the hotkey dead; tests for leaving mid-capture (one cancel, no confirm) and leaving idle (no cancel).
- Finding 2: verify.log blocks now name the round commit, stating which code commit they ran on.

Pending and deferred: unchanged from round 1.
