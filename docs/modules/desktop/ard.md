---
updated: 2026-10-21
source: 0002_desktop_shell
---

# Desktop: architecture and debt

## 2026-10-20: Tauri 2 with a thin Rust shell and a React UI

- Decision: the desktop app is Tauri 2; the OS layer (key hook, recording, active window, paste keystroke, keychain) is a thin Rust module and the UI is React and TypeScript.
- Alternatives rejected: Electron.
- Reason: native tray, clipboard and updater support, a binary around 10 MB, and the OS layer in a few hundred lines of Rust; Electron needs native addons for the same and ships around 150 MB.
- Debt created: Rust joins a TypeScript monorepo as a second language with its own toolchain.
- Revisit when: the Rust layer grows past the OS glue it was chosen for.
- Source: setup

## 2026-10-20: Low-level key hook for hold to talk

- Decision: `rdev` listens to raw key down and key up; defaults are Ctrl+Win on Windows, Fn on macOS, Ctrl+Super on Linux, all configurable, Right Alt never.
- Alternatives rejected: a registered global shortcut; Right Alt as the default.
- Reason: hold to talk needs both key down and key up, and modifier-only combinations and Fn cannot be registered as normal global shortcuts; Right Alt is AltGr on Spanish keyboards.
- Debt created: on macOS the user must set "Press Fn key to" to do nothing and grant Accessibility on first run.
- Revisit when: an OS update breaks the hook, or users ask for toggle mode instead of hold.
- Source: setup
- Superseded by 2026-10-21: Native Windows key hook instead of rdev

## 2026-10-20: WAV 16 kHz mono, no client encoding

- Decision: desktop records with `cpal` to WAV, 16 kHz mono 16-bit, discards recordings under 0.5 s, and caps uploads at about 2.5 minutes to stay under the API's 5 MB limit.
- Alternatives rejected: encoding to Opus on the client, as the original proposal planned.
- Reason: the API accepts only WAV and m4a in v1, which keeps the pipeline simple; payload size does not matter yet.
- Debt created: uploads are larger than they would be with Opus, and long dictations hit the cap sooner.
- Revisit when: payload size shows up in measured latency or users hit the length cap.
- Source: setup
- Superseded by 2026-10-21: Recordings capped at two minutes

## 2026-10-20: Paste through the clipboard with a per-app keystroke

- Decision: the text goes into the clipboard, `enigo` sends the paste keystroke from the app rule (Ctrl+V, Cmd+V on macOS, Ctrl+Shift+V in terminals), then the previous clipboard is restored.
- Alternatives rejected: typing the text character by character.
- Reason: one keystroke is instant for any length of text and works in almost every app.
- Debt created: elevated windows on Windows reject synthetic input (UIPI), a known limitation shared with other dictation tools; clipboard managers see the text briefly.
- Revisit when: users report missed pastes in a specific app class.
- Source: setup

## 2026-10-20: Updates through GitHub Releases

- Decision: the release workflow runs `tauri-action` on `desktop-v*` tags, publishing installers and `latest.json` to GitHub Releases in the public monorepo; the app's updater reads that manifest.
- Alternatives rejected: hosting installers in the project's AWS account.
- Reason: the repo is public, GitHub Releases is free and `tauri-action` produces the manifest the updater expects.
- Debt created: none.
- Revisit when: phase 5 builds it.
- Source: setup

## 2026-10-21: Native Windows key hook instead of rdev

- Decision: Windows hold to talk uses a `WH_KEYBOARD_LL` hook written with the `windows` crate behind `KeyHook`; the callback only forwards events, a key-events thread detects the chord at event time, an injected unassigned key (0xE8) keeps Start closed while Win is down in the chord, and the app's own injections carry a `dwExtraInfo` tag so they are ignored while other injected input still counts.
- Alternatives rejected: `rdev`, as the setup entry planned.
- Reason: rdev 0.5 calls `ToUnicodeEx` and `AttachThreadInput` inside the hook, which breaks Spanish dead keys and risks Windows dropping the hook, always adds a mouse hook, and hides the injected flag.
- Debt created: macOS and Linux have no hook yet; their builds compile with an unsupported implementation.
- Revisit when: phase 5 builds macOS and Linux.
- Source: 0002_desktop_shell

## 2026-10-21: Microphone stream prepared ahead of the hold

- Decision: the `cpal` input stream is built at startup and after every dictation and only started on key down; WASAPI's `E_ACCESSDENIED` maps to the blocked state, and a capture of exact zeros is reported as a silent microphone instead of being sent.
- Alternatives rejected: building the stream on key down, which took about 210 ms and cut the first syllable.
- Reason: recordings now match the hold within 40 ms, and the prepared stream's session stays inactive, so Windows shows no microphone in use while idle.
- Debt created: a prepared stream on a Bluetooth headset may switch it to the hands-free profile or hold the device; untested.
- Revisit when: someone uses a Bluetooth headset with the app, or audio quality drops on one.
- Source: 0002_desktop_shell

## 2026-10-21: Rust mirrors the shared contract by hand

- Decision: the shell owns the `POST /dictations` call, and its serde types mirror `packages/shared/src/dictations.ts` and `errors.ts` field by field, as the one recorded exception to importing contracts from `packages/shared`.
- Alternatives rejected: calling the API from the WebView with the zod types.
- Reason: the audio is captured in Rust and the call must work with no window open.
- Debt created: the mirror can drift from the zod schemas without any check.
- Revisit when: 0007 adds the contract test fed by JSON Schema from `packages/shared`.
- Source: 0002_desktop_shell

## 2026-10-21: Paste through a delayed-rendered clipboard

- Decision: the paste offers the text with delayed rendering, marked with `ExcludeClipboardContentFromMonitorProcessing`, `CanIncludeInClipboardHistory` 0 and `CanUploadToCloudClipboard` 0, after saving every memory-based format; it pastes only into the window focused at key down, after every modifier is up and when the target is not elevated, restores 150 ms after the target reads (500 ms if something read before the keystroke), retries a busy clipboard for 3 s, and leaves the text with a notification when nothing reads it within 1.5 s.
- Alternatives rejected: a fixed wait before restoring.
- Reason: delayed rendering tells when the target actually read the text, and the missing read doubles as the paste-failure signal.
- Debt created: any reader after the keystroke counts as the target, and a clipboard monitor that ignores the exclusion format still sees the text.
- Revisit when: a paste reported as done does not land in a real app.
- Source: 0002_desktop_shell

## 2026-10-21: Shortcut capture in the settings page

- Decision: the settings page records `KeyboardEvent.code` while the foreground window belongs to the app, proposes the keys held at the first release, and Rust validates and saves them only on Save; chord detection pauses during a capture and resumes on Save, Cancel, the foreground leaving the app, and a 15 s timeout.
- Alternatives rejected: capturing through the hook, and Tauri's `is_focused` and `Focused(false)` as the focus signal.
- Reason: with one of the app's WebView windows in the foreground no low-level hook (not even an unrelated process's) saw injected keys, and Tauri reports a blur whenever the WebView child takes focus.
- Debt created: none.
- Revisit when: physical keys turn out to reach the hook in the app's own windows.
- Source: 0002_desktop_shell

## 2026-10-21: In-process API stub until 0007

- Decision: a `127.0.0.1` server inside the app answers `POST /dictations` with the contract's shapes and validations, behind the real multipart client, with Normal, Silence, Quota exceeded and Network error modes in a tray submenu of every build.
- Alternatives rejected: waiting for the real API, and a stub replacing the client.
- Reason: 0002 ran in parallel with 0001, and the real client path gets exercised end to end.
- Debt created: release builds ship the stub and its tray menu until the real API replaces them.
- Revisit when: 0007 wires sign-in and the real API.
- Source: 0002_desktop_shell

## 2026-10-21: Overlay window kept warm and gated by the hold

- Decision: the non-focusable overlay window is created hidden at startup with WebView2 `MemoryUsageTargetLevel` Low while hidden, and while a hold is open worker updates cannot replace Listening; an error held back that way becomes a notification.
- Alternatives rejected: creating the overlay on key down.
- Reason: the overlay shows within the hold's first frames, idle memory stays at 75.5 MB, and a finishing dictation never hides the overlay of the next one.
- Debt created: none.
- Revisit when: idle memory passes 100 MB.
- Source: 0002_desktop_shell

## 2026-10-21: Recordings capped at two minutes

- Decision: a recording stops and is sent at 120 s, and the capture buffer holds at most 120 s.
- Alternatives rejected: about two and a half minutes, as the setup entry estimated.
- Reason: two minutes of 16 kHz mono 16-bit WAV is 3.84 MB, under the API's 4 MiB audio limit.
- Debt created: none beyond the WAV entry's.
- Revisit when: the API limit or the audio format changes.
- Source: 0002_desktop_shell

