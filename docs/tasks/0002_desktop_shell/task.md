---
id: "0002"
title: desktop_shell
type: feature
crew: pair
clearance: full
branch: feat/0002_desktop_shell
modules: [desktop]
repos: ["."]
phases: 0
depends_on: []
ticket:
created: 2026-10-20
updated: 2026-10-20
---

# 0002 Desktop shell on Windows

## Goal

A user installs Take My Word on Windows, holds Ctrl+Win, speaks, releases, and text is pasted where the cursor is, with the clipboard left as it was.
This task builds the whole desktop shell against a local stub of `POST /dictations` so it runs in parallel with 0001; 0003 replaces the stub with sign-in and the real API.

## Scope

- `apps/desktop`: Tauri 2 app in the pnpm workspace, Windows target first (code stays cross-platform, no `#[cfg]` shortcuts that close macOS or Linux).
- Rust shell (`src-tauri`): tray icon and menu (open settings, sign out, quit); low-level key hook with `rdev` for hold-to-talk on Ctrl+Win (down starts recording, up stops; presses under 0.5 s discarded; cap at 2 minutes stops and sends); recording with `cpal` to 16 kHz mono 16-bit WAV in memory; active window executable name (`appId`); clipboard save, set text, paste keystroke (Ctrl+V default) with `enigo`, restore clipboard; an API client behind a trait with one implementation in this task: a local stub (in-process or a tiny local HTTP server) that accepts the multipart request shaped like 0001's contract and answers canned text after a short delay, plus failure modes on demand (network error, 429, empty text); dev-only "dictate from WAV file" command for automated checks, compiled out of release builds.
- React UI (`src`): first-run screen explaining the hotkey and microphone permission, settings window (hotkey capture and change, API endpoint field for later, quit), floating overlay with listening, processing and error states (error dismisses after 4 s or on click). The sign-in form is 0003.
- Root monorepo files only if absent on the branch, identical to 0001's plan (root `package.json`, `pnpm-workspace.yaml` with `apps/*` and `packages/*`, `.nvmrc` Node 24, base tsconfig, eslint, prettier, vitest); whichever of 0001 and 0002 merges second rebases.
- Paste failure (elevated window, network drop after transcription): the text stays in the clipboard and a tray notification says so.
- Windows toolchain installed by the crew via `winget`: Rustup (MSVC), Visual Studio Build Tools with the C++ workload, Node 24, pnpm; checkout on `C:\dev\take-my-word` for Windows builds, synced from the WSL worktree.
- CI: `desktop-ci` job (cargo fmt, clippy, cargo test, UI lint, typecheck, vitest) path-filtered to `apps/desktop` and `packages/shared`, running on `windows-latest`; it uploads the NSIS installer as a workflow artifact on every PR so Sebastian can install and test. No release workflow yet (phase 5).
- Screenshots in the workspace: UI states at 390, 768 and 1280 px with mocked Tauri APIs, plus Windows smoke captures (overlay listening and processing, text pasted in Notepad) taken by the crew.
- Docs: TRD verification row for desktop; module docs via `document-task`.

## Out of scope

- Sign-in, tokens, keychain, real `POST /dictations`, 401 and 429 handling: 0003.
- Onboarding style picker and app rules: 0004 (no styles API yet).
- Dictionary, history, settings sync via `/me/settings`.
- Updater, GitHub Releases, code signing, macOS and Linux builds: phase 5.
- Toggle mode, custom overlay position, sounds.
- Deferred: a hotkey conflict check against other apps; Opus encoding.

## Acceptance

1. `pnpm --filter desktop lint|typecheck|test` and `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test` pass in `apps/desktop`, on WSL for the UI and on Windows for Rust.
2. The NSIS installer built on Windows installs on Windows 11 and the app starts in the tray with its menu (settings, quit).
3. First run shows the hotkey explanation and requests microphone access once.
4. With the cursor in Notepad, holding Ctrl+Win shows the listening overlay, releasing shows processing, and the stub's text appears in Notepad; the clipboard content from before the dictation is back afterwards; the Start menu does not open. Verified by the crew with the dev WAV command and screenshots, and by Sebastian from the PR installer (the stub answers whatever he says with canned text).
5. A press under 0.5 s does nothing; the stub's empty-text mode pastes nothing and the overlay closes; the stub's failure modes show the error overlay with a short message and paste nothing.
5b. The recorded WAV is 16 kHz mono 16-bit and its duration matches the hold time (checked by a Rust test over the recorder output and by the dev command writing the WAV to the workspace).
6. Holding the key past 2 minutes stops the recording and sends it.
7. Right Alt cannot be set as the hotkey; a changed hotkey works without restart and survives restart.
8. The app idles under 100 MB of RAM and the installer is under 20 MB.
9. `desktop-ci` is green on the PR and the installer artifact is attached.

## Approach

- Hook: `rdev` listen thread with key down and up events; modifier-only combination handled by tracking both keys; alternative rejected: Tauri global-shortcut plugin, which has no key-up event and cannot bind modifier-only chords.
- Audio: `cpal` default input device, resampled to 16 kHz mono if the device differs, WAV built in memory; alternative rejected: Opus (libopus build friction), per the ARD.
- Paste: clipboard roundtrip with `arboard` or the Tauri clipboard plugin plus `enigo` Ctrl+V; alternative rejected: typing characters, slow and layout-dependent.
- Active window: `GetForegroundWindow` plus process name on Windows behind a small trait so macOS and Linux implement it later.
- API client trait with a stub implementation now and the real one in 0003; alternative rejected: waiting for 0001, which serializes two independent weeks of work.
- Dev WAV command: a Tauri command available only in debug builds that runs the full path from a given file, so the crew exercises recording-independent behavior without a microphone.
- UI: React + TypeScript, Vite, minimal styling, no component library; screenshots with mocked `@tauri-apps/api`.
- Windows execution from WSL: `powershell.exe` invoking `pnpm tauri build`, `SendInput` for the hotkey, `System.Drawing` captures for screenshots; the Windows checkout at `C:\dev\take-my-word` mirrors the worktree branch.

## Database

None; desktop stores the hotkey in its local config file.

## Infra

- CI: `.github/workflows/desktop-ci.yml` on `windows-latest`, path-filtered, uploads the installer artifact; no AWS access.
- Windows machine: toolchain via `winget` (may prompt UAC once), checkout on `C:\dev\take-my-word`.

## Design

None; the UI is three small screens and an overlay, designed in code and reviewed from the screenshots.

## Risks

- `rdev` on Windows with modifier-only chords and Ctrl+Win (the Win key opens Start on release when pressed alone); needs swallowing or a Start-menu guard, to be proven early.
- Antivirus or SmartScreen flags an unsigned installer; Sebastian accepts the warning in v1, signing is phase 5.
- Root monorepo files may conflict with 0001 at merge; kept identical by plan, resolved by rebase.
- First Rust build on Windows is long; the Build Tools install may need a UAC click from Sebastian.

## Depends on

None. Runs in parallel with 0001; both create the root monorepo files identically and the second to merge rebases.

## Context & decisions

Consolidated 2026-10-20; answers by Sebastian through the om-manager unless marked (om-reviewer).

- Renumbered: the desktop integration task is 0007 (`docs/tasks/_drafts/0007_desktop_integration.md`); every "0003" in this file reads as 0007.
- Contract: Rust owns the `POST /dictations` call; its serde types mirror `packages/shared/src/dictations.ts` and `errors.ts` from `feat/0001_platform_skeleton`, field by field, as an exception that `document-task` records in `docs/modules/desktop/ard.md`; 0007 adds a contract test fed by JSON Schema from `packages/shared`.
- Stub (om-reviewer): a 127.0.0.1 HTTP server inside the app that the real multipart client calls; it checks `audio` (WAV 16 kHz mono 16-bit) and `meta` (`locale` required) and answers the contract's shapes. Modes (normal, empty with `skipped: "silence"`, 429 `quota_exceeded`, network error) are picked from a tray submenu in every 0002 build, release included.
- `locale` comes from the Windows user language, mapped to `es` or `en` with region, falling back to `es` (om-reviewer).
- Clipboard: on Windows, every memory-based format is saved and restored behind the clipboard trait; the dictated text carries the formats that keep it out of Win+V history and the cloud clipboard.
- Paste failure (om-reviewer): an elevated foreground window (integrity level checked before pasting) or a failed injection leaves the text in the clipboard and shows a tray notification. A network failure follows Acceptance 5, because the client never had the text.
- Acceptance 3 adjusted: first run explains the hotkey and microphone use and is not shown again. If Windows denies the microphone, first run and the error overlay say so and link to `ms-settings:privacy-microphone`. Unpackaged apps get no per-app prompt; the crew confirms this on build 26200.
- Acceptance 8 adjusted: RAM is Task Manager's group total (app plus WebView2), idle in the tray, settings window destroyed on close. 100 MB is a target, not a hard line; the PR reports the measured figure. A lazily created overlay is accepted only if it shows within 150 ms of key down (om-reviewer).
- Acceptance 5b: duration within 100 ms of the hold; the Rust test drives the encoder and resampler with synthetic frames, since CI has no audio device (om-reviewer).
- Scope trimmed: no tray "Sign out" and no API endpoint field until 0007 (the base URL is build-time per `docs/modules/desktop/trd.md`).
- Scope added: autostart at login, on by default, toggle in settings; single instance (om-reviewer).
- Hold semantics (om-reviewer): the listening overlay shows on key down. A short press hides it and sends nothing. Any other key during the hold cancels the dictation (Ctrl+Win+arrows).
- Dev command (om-reviewer): a debug-only CLI argument reaching the running instance runs the full path from a WAV; a debug-only directory dump writes recorder output. Release builds contain neither: audio is never written to disk in release.
- Root files (om-reviewer): copied byte-identical from the head of `feat/0001_platform_skeleton`. Desktop-only configuration lives under `apps/desktop` (own `eslint.config.js` extending the root, `tsconfig.json` with DOM, `src-tauri/.gitignore`). 0001 merges first; 0002 rebases on `develop` before its PR opens and regenerates the lockfile.
- Toolchain: installed first thing, user scope where possible (rustup, Node via a per-user manager, pnpm); only Build Tools raises UAC, and Sebastian is told to accept it. If it stalls, continue with what does not need it and record it.
- Delivery (om-reviewer): one branch, three review milestones: (1) toolchain, Tauri builds on Windows, tray, hook with the Start-menu guard, recorder with tests; (2) stub client, paste and restore, active window, overlay, first run, settings, hotkey change, dev command; (3) `desktop-ci` with the installer artifact, screenshots, Windows smoke captures, sizes, TRD row.

Constraints:

- `apps/desktop` package scripts `lint`, `typecheck`, `test` and `build` are UI only and pass on Linux, so the root `pnpm -r` keeps working; the Tauri build is its own script.
- TRD verification: the desktop Rust checks are runnable from the WSL worktree as written. They run on `C:\dev\take-my-word` at the round's commit (sha in `verify.log`), and powershell.exe propagates cargo's exit code. Tests run serially.
- No `#[cfg]` that closes macOS or Linux; Windows code sits behind the hook, active window and clipboard traits.
- Rule from the root `CLAUDE.md`: audio is never persisted.

Review focus beyond the Pipeline:
- The hook callback only forwards events, so Windows does not drop the hook.
- No stuck Win or Ctrl after a dictation.
- The app's own Ctrl+V never re-triggers the chord, and the paste waits until the chord keys are released.
- The overlay never takes focus.
- The clipboard restore waits long enough for the target to read the clipboard.
- Resampling is filtered, not sample dropping.
- Right Alt (AltGr arrives as LCtrl+RAlt) is rejected.

clearance: full: the Windows host through powershell.exe (winget installs, `C:\dev\take-my-word`, running the app, SendInput, screen captures) and GitHub `sebasfles/take-my-word` for the PR and the `desktop-ci` artifact; no AWS.

## om-developer notes
