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
- Hook (om-reviewer, 2026-10-20, from the om-developer): a native `WH_KEYBOARD_LL` hook with the `windows` crate behind the `KeyHook` trait replaces `rdev`, which mishandles dead keys and hides `LLKHF_INJECTED`. The Start menu is guarded with the 0xE8 mask key. Only the app's own injections, tagged through `dwExtraInfo`, are ignored, so SendInput tests still drive the hook. Non-Windows builds compile and return unsupported until phase 5. `document-task` amends `docs/modules/desktop/ard.md`.
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

### Round 1 (milestone 1: toolchain, Windows build, tray, hook, recorder)

Done:

- Windows toolchain: Visual Studio Build Tools 2022 17.14 with the C++ workload and the Windows 11 SDK through `winget` (one UAC prompt); rustup with stable MSVC 1.99.1 per user through `rustup-init`, because the `winget` Rustup package has no user-scope installer; fnm 1.39 per user through `winget`, Node 24.22.0 as default, its alias folder added to the user `Path`; pnpm 10.34.7 through `npm -g`.
- Root files: copied from `feat/0001_platform_skeleton` at first; 0001 merged during the round, so the branch is rebased on `develop` (`49193e4`), takes `develop`'s root files unchanged and regenerates `pnpm-lock.yaml`.
- `apps/desktop` as `@take-my-word/desktop` (`pnpm --filter desktop` resolves it): Vite and React UI with one view (a settings placeholder until milestone 2), own `eslint.config.js` extending the root plus react-hooks, `tsconfig.json` with DOM, `.prettierignore` for `src-tauri/target` and `gen`.
- `src-tauri`: tray with Settings and Quit, no window at startup, exit prevented when the last window closes, settings window destroyed on close; single instance (a second launch opens settings); log plugin; `hotkey` (key model, hotkey validation, chord tracker, `KeyHook` trait, Win32 `WH_KEYBOARD_LL` hook, unsupported stub elsewhere); `audio` (cpal microphone, capture buffer capped at 120 s, rubato FFT resampler, hound WAV); `session` (hold, 0.5 s minimum, cancel on another key, 2 minute cap through `recv_timeout`); `config` (hotkey load); debug-only `--dump-dir`.
- `apps/desktop/scripts/windows.sh` mirrors the worktree to `C:\dev\take-my-word` and runs a command there through `powershell.exe` with its exit code; `rust:lint`, `rust:test`, `windows:prepare`, `windows:build` scripts; TRD desktop verification row.
- 30 Rust tests (hotkey, chord, Win32 translation, WAV format, duration, filtering, buffer cap, session) and 2 UI tests.

Decisions the plan did not record (ARD material for `document-task`):

- Microphone pre-armed: building the WASAPI stream takes about 210 ms on this machine (measured), so the first samples arrived 265 ms after key down, the WAV came out about 200 ms shorter than the hold and the first syllable was lost. The input stream is now built at startup and again after each dictation and only `play()`ed on key down; WAVs land within 40 ms of the hold (1990/2024, 680/717, 3500/3530 ms). An armed stream's audio session reports Inactive (`IAudioSessionControl2::GetState`) and Active only during the hold, so the microphone is not in use while idle.
- Missed key-ups: Win+L, Ctrl+Alt+Del and the secure desktop swallow key-ups, which would leave keys stuck in the tracker and silently disable the hotkey until they were pressed again. Before every key down the session forgets tracked keys the OS no longer reports held (`KeyHook::is_held`, `GetAsyncKeyState` on Windows); only while no chord is active.
- Chord semantics: the chord fires only when exactly the hotkey keys are down (Ctrl+Shift+Win does not fire Ctrl+Win); Ctrl, Shift and Win match either side; `alt` means Left Alt only, so Right Alt cannot be stored; a hotkey has one to three keys and at least one modifier.
- Start-menu guard: the 0xE8 mask key is injected when the chord is pressed and the hotkey contains Win, decided from the tracker's physical state rather than `GetAsyncKeyState` to avoid racing the event that just passed the hook.
- AltGr's synthetic Left Ctrl (scan code 0x21D) is dropped during translation, so it never counts as Ctrl.
- A dictation is also discarded when the captured audio is under 0.5 s although the hold was longer, matching the API's `minAudioSeconds`.
- Resampling is rubato's synchronous FFT resampler (band-limited); a test shows a 12 kHz tone at 48 kHz drops under 1% of its level instead of aliasing to 4 kHz.
- `windows.sh` sets `CARGO_BUILD_JOBS=2`: the first build with 12 parallel rustc processes ran out of memory on the 15.7 GB host shared with WSL. It copies `Cargo.lock` back from Windows, the only place cargo runs.
- Release profile: LTO, one codegen unit, `opt-level = "s"`, `strip`, `panic = "abort"`. Tauri identifier `dev.fless.takemyword`, NSIS `currentUser` install mode.

Windows smoke (Windows 11 26200; debug exe with `--dump-dir`, then the release exe; input injected from PowerShell with real scan codes):

- Ctrl then Win held 2 s, and Win then Ctrl with Ctrl released first: both recorded 16 kHz mono 16-bit WAVs; Start did not open; no Ctrl or Win left down.
- 300 ms press discarded; Right arrow during the hold cancelled; release exe records the same way.
- Without the app, Ctrl+Win press and release does not open Start on this build in either order, so the guard is a safety net here; injecting Win then Ctrl with scan code 0 opened Quick Assist, an artifact of scan-0 injection.
- Wispr Flow runs on this machine and injects its own Ctrl down and Win up (`dwExtraInfo` 0x5746434B) after Win is released; the tracker tolerates them. Its hotkey is Ctrl+Shift, but the smoke presses also reach it.
- Installer 1.44 MiB, release exe 4.4 MB; release idle in the tray 18 MB working set, 7 MB private, no WebView2 processes once settings is closed (the 100 MB target with WebView is measured in milestone 3).
- Recorded WAVs were deleted after measuring.

Pending (milestones 2 and 3): stub server and tray modes, paste and clipboard restore, active window, locale, overlay, first run, settings with hotkey capture (Right Alt rejected at capture), autostart, dev WAV command through the second instance; `desktop-ci`, screenshots, Notepad smoke captures, installer install test, RAM with WebView.

Deferred or open:

- Non-Windows `cargo check` cannot run here (no sudo in WSL for the GTK, WebKit and ALSA headers); I will propose a cheap Ubuntu `cargo check` step in `desktop-ci` in milestone 3 to keep condition 4 verified.
