---
updated: 2026-10-21
source: 0002_desktop_shell
---

# Desktop: technical

Built on Windows by 0002 against an in-process API stub; 0007 adds sign-in and the real API, phase 3 app rules, phase 5 the updater, macOS and Linux.

## Structure

| Path | What |
|---|---|
| `apps/desktop/src-tauri/src/hotkey` | Native `WH_KEYBOARD_LL` hook behind `KeyHook`, chord tracking, Start-menu guard, hotkey model |
| `apps/desktop/src-tauri/src/audio` | `cpal` capture with a pre-armed stream, filtered resampling to 16 kHz mono 16-bit WAV |
| `apps/desktop/src-tauri/src/session.rs`, `dictation.rs` | Hold, cancel and cap on the session thread; encode, send, paste and report on a worker |
| `apps/desktop/src-tauri/src/paste.rs`, `clipboard`, `foreground` | Paste through a delayed-rendered clipboard, restore, focus and integrity checks, `appId` |
| `apps/desktop/src-tauri/src/api` | Serde mirror of the `packages/shared` contract, the multipart client, and the stub server |
| `apps/desktop/src` | React views: first run, settings (shortcut capture, start with Windows), overlay |
| `apps/desktop/screenshots` | Mocked Tauri bridge and the Playwright script behind `pnpm screenshots` |
| `.github/workflows/desktop-ci.yml` | Windows checks and NSIS installer artifact, Linux clippy |

Windows code sits behind the hook, foreground and clipboard modules; other platforms compile with an unsupported implementation until phase 5.

## Endpoints owned

None; desktop is a client.

Calls: `POST /dictations` (audio, `locale` from the Windows language, `appId`); app rules, styles and `/me/settings` from 0007 and phase 3.

Jobs, listeners or scheduled work: the key hook, the microphone thread and the clipboard thread run for the app's lifetime; until 0007 a stub answers `POST /dictations` on `127.0.0.1` with a random port, its mode picked from the tray.

## Depends on

- dictation: `POST /dictations` turns the WAV into clean text.
- auth: Cognito sign-in and refresh, from 0007.
- styles: app rules map the focused app to a style and a paste keystroke, from phase 3.
- GitHub Releases: installers and the updater manifest, from phase 5.

## Depended on by

- None; nothing calls the desktop app.

## Configuration

- API base URL, Cognito user pool id and app client id per environment, fixed at build time (0007).
- Per-user `settings.json` in the app's config folder: hotkey and first-run flag; autostart lives in the OS (`HKCU\...\Run`).
- Debug builds only: `--dump-dir`, and `--dictate-wav` and `--stub-mode` sent to the running instance through single instance.

## Testing

- `cargo test` covers the hook model, session, paste, worker, stub and contract; the real-clipboard test is ignored locally and runs in `desktop-ci`.
- Vitest covers the views with a mocked bridge; `pnpm screenshots <dir>` renders every state at 390, 768 and 1280 px.
- Physical keyboard, microphone and paste behavior need a manual check from the PR installer.
