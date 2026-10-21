---
updated: 2026-10-20
source: setup
---

# Desktop: technical

Planned; no code yet, phase 2 builds it on Windows, phase 3 adds app rules, phase 5 adds the updater, macOS and Linux.

## Structure

| Path | What |
|---|---|
| `apps/desktop` | Tauri 2 tray app, one workspace package in the pnpm monorepo |
| `apps/desktop/src-tauri` | Rust shell: tray, low-level key hook (`rdev`), recording to WAV (`cpal`), clipboard paste and restore (`enigo` for the keystroke), active window lookup, OS keychain access |
| `apps/desktop/src` | React and TypeScript UI: login form, settings (hotkey, styles, app rules), floating overlay for listening and processing |
| `packages/shared` | zod contracts the UI uses to call the API |
| `.github/workflows` | Path-filtered CI for `apps/desktop`; release workflow on `desktop-v*` tags with `tauri-action`, publishing installers and `latest.json` to GitHub Releases |

The split of Rust code into files inside `src-tauri` is decided when phase 2 starts.

## Endpoints owned

None; desktop is a client.

Calls: `POST /dictations` (audio plus `appId` and `styleId`), `CRUD /app-rules` and `CRUD /styles` (phase 3), `GET/PUT /me/settings`, and Cognito SRP sign-in and refresh.

Jobs, listeners or scheduled work: the key hook runs for the app's lifetime; the release workflow runs on `desktop-v*` tags.

## Depends on

- auth: Cognito SRP sign-in and refresh; tokens stored in the OS keychain.
- dictation: `POST /dictations` turns the WAV into clean text.
- styles: app rules map the focused app to a style and a paste keystroke.
- dictionary: terms reach the pipeline server side; desktop may offer a shortcut to add a term.
- GitHub Releases: installers and the updater manifest.

## Depended on by

- None; nothing calls the desktop app.

## Configuration

- API base URL, Cognito user pool id and app client id per environment, fixed at build time.
- Tauri updater signing key, held as an Actions secret for the release workflow.
- Per-user local settings: hotkey per OS, stored on the machine.

## Testing

- Rust tests in `apps/desktop/src-tauri` with `cargo test`; UI tests in `apps/desktop/src`.
- Module-specific run: see TRD.
- Hotkey, paste and active window behavior need a manual check on each OS; no automated harness is planned.
