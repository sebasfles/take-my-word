---
updated: 2026-10-20
source: setup
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

## 2026-10-20: WAV 16 kHz mono, no client encoding

- Decision: desktop records with `cpal` to WAV, 16 kHz mono 16-bit, discards recordings under 0.5 s, and caps uploads at about 2.5 minutes to stay under the API's 5 MB limit.
- Alternatives rejected: encoding to Opus on the client, as the original proposal planned.
- Reason: the API accepts only WAV and m4a in v1, which keeps the pipeline simple; payload size does not matter yet.
- Debt created: uploads are larger than they would be with Opus, and long dictations hit the cap sooner.
- Revisit when: payload size shows up in measured latency or users hit the length cap.
- Source: setup

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
