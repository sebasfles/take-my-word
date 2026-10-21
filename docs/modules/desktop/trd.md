---
updated: 2026-10-21
source: 0007_desktop_integration
---

# Desktop: technical

Built on Windows by 0002, signed in to the real API by 0007; phase 3 adds app rules, phase 5 the updater, macOS and Linux.

## Structure

| Path | What |
|---|---|
| `apps/desktop/src-tauri/src/hotkey` | Native `WH_KEYBOARD_LL` hook behind `KeyHook`, chord tracking, Start-menu guard, hotkey model |
| `apps/desktop/src-tauri/src/audio` | `cpal` capture with a pre-armed stream, filtered resampling to 16 kHz mono 16-bit WAV |
| `apps/desktop/src-tauri/src/session.rs`, `dictation.rs` | Hold, cancel, cap and the signed-out gate on the session thread; encode, send, paste and report on a worker |
| `apps/desktop/src-tauri/src/paste.rs`, `clipboard`, `foreground` | Paste through a delayed-rendered clipboard, restore, focus and integrity checks, `appId` |
| `apps/desktop/src-tauri/src/auth` | SRP port, the six Cognito calls, `Secret`, and `Account`: the session behind one lock |
| `apps/desktop/src-tauri/src/keychain` | Refresh token and device keys in Windows Credential Manager; unsupported elsewhere |
| `apps/desktop/src-tauri/src/api` | Serde mirror of the `packages/shared` contracts, the bearer client with its one retry, and the debug-only stub |
| `apps/desktop/src-tauri/src/env.rs`, `account.rs` | Build-time environment; sign-in, new password, onboarding and sign-out commands and windows |
| `apps/desktop/src` | React views: sign-in, choose password and style pick, first run, settings, overlay |
| `apps/desktop/contract` | JSON Schema of the mirrored contracts generated from `packages/shared` (`pnpm contract`) |
| `apps/desktop/screenshots` | Mocked Tauri bridge and the Playwright script behind `pnpm screenshots` |
| `.github/workflows/desktop-ci.yml` | Windows checks and the dev NSIS installer artifact, Linux clippy |

Windows code sits behind the hook, foreground, clipboard and keychain modules; other platforms compile with an unsupported implementation until phase 5.

## Endpoints owned

None; desktop is a client.

Calls, all from Rust with the access token: `POST /dictations` (audio, `locale` from the Windows language, `appId`), `GET /styles`, `GET` and `PUT /me/settings` (read first, since `PUT` replaces the item).
Cognito directly, as unsigned JSON calls: `InitiateAuth`, `RespondToAuthChallenge`, `ConfirmDevice`, `GetTokensFromRefreshToken`, `ForgetDevice`, `RevokeToken`.

Jobs, listeners or scheduled work: the key hook, the microphone thread and the clipboard thread run for the app's lifetime; a renewal starts in the background at hotkey down.

## Depends on

- dictation: `POST /dictations` turns the WAV into clean text; settings hold the default style.
- auth: the pool, the client contract and the authorizer.
- styles: the style list for onboarding; app rules map the focused app to a style and a paste keystroke from phase 3.
- GitHub Releases: installers and the updater manifest, from phase 5.

## Depended on by

- None; nothing calls the desktop app.

## Configuration

- Environment chosen at build time: `tauri.dev.conf.json` and `tauri.prd.conf.json` set product name, identifier and the Cargo feature `dev` or `prd`, which picks the API URL and pool ids in `env.rs`; `pnpm tauri:build:dev` or `pnpm tauri:build:prd`.
  Debug builds and the base config are dev; a release with no environment does not compile, and the app refuses to start when its identifier does not match the compiled environment.
- Keychain service and config folder are the identifier, so dev and prd never share them.
- `settings.json` in the config folder: hotkey, first-run flag, and the Cognito `sub` of users who already picked a style on this machine; autostart lives in the OS (`HKCU\...\Run`).
- Debug builds only: `--dump-dir`, and `--dictate-wav` and `--stub-mode` sent to the running instance through single instance; the stub's tray submenu, off by default.

## Testing

- `cargo test`: hook model, session gate, paste, worker and error messages, stub routing, Cognito request shapes against a local fake, SRP against vectors from `packages/cognito`, the account (renewal, single renewal under concurrency, sign-in, new password, sign-out order), the bearer retry, the keychain on the real Credential Manager, and the contract against `contract.schema.json`.
- `auth::dev_pool` tests are ignored: with `TMW_DEV_USERNAME` and `TMW_DEV_PASSWORD` they sign in to the dev pool, call the dev API and clean up after themselves.
- Vitest covers the views with a mocked bridge and fails `ci` when `contract.schema.json` is stale; `pnpm screenshots <dir>` renders every state at 390, 768 and 1280 px.
- Physical keyboard, microphone and paste behavior need a manual check from the PR installer.
