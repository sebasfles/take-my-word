---
updated: 2026-10-21
source: 0005_desktop_release
---

# Desktop: technical

Built on Windows by 0002, signed in to the real API by 0007, released and self-updating since 0005; phase 3 adds app rules, phase 5 macOS and Linux.

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
| `apps/desktop/src-tauri/src/updater.rs`, `activity.rs` | Update check, offer, download and install; the in-flight dictation guard that keeps them out of a hold or a pending paste |
| `apps/desktop/src-tauri/src/env.rs`, `account.rs` | Build-time environment; sign-in, new password, onboarding and sign-out commands and windows |
| `apps/desktop/src` | React views: sign-in, choose password and style pick, first run, settings, overlay, update |
| `apps/desktop/scripts` | Version check, `pnpm release:desktop`, and the release check that verifies `latest.json` against the committed key |
| `apps/desktop/contract` | JSON Schema of the mirrored contracts generated from `packages/shared` (`pnpm contract`) |
| `apps/desktop/screenshots` | Mocked Tauri bridge and the Playwright script behind `pnpm screenshots` |
| `.github/workflows/desktop-ci.yml` | Windows checks and the dev NSIS installer artifact, Linux clippy |
| `.github/workflows/desktop-release.yml` | prd build, signing and the GitHub Release on `desktop-v*` tags |

Windows code sits behind the hook, foreground, clipboard and keychain modules; other platforms compile with an unsupported implementation until phase 5.

## Endpoints owned

None; desktop is a client.

Calls, all from Rust with the access token: `POST /dictations` (audio, `locale` from the Windows language, `appId`), `GET /styles`, `GET` and `PUT /me/settings` (read first, since `PUT` replaces the item).
Cognito directly, as unsigned JSON calls: `InitiateAuth`, `RespondToAuthChallenge`, `ConfirmDevice`, `GetTokensFromRefreshToken`, `ForgetDevice`, `RevokeToken`.

Jobs, listeners or scheduled work: the key hook, the microphone thread and the clipboard thread run for the app's lifetime; a renewal starts in the background at hotkey down; prd release builds check `releases/latest/download/latest.json` at start and every 6 hours.

## Depends on

- dictation: `POST /dictations` turns the WAV into clean text; settings hold the default style.
- auth: the pool, the client contract and the authorizer.
- styles: the style list for onboarding; app rules map the focused app to a style and a paste keystroke from phase 3.
- GitHub Releases: installers and `latest.json`, downloaded anonymously by the updater and the landing.

## Depended on by

- None; nothing calls the desktop app.

## Configuration

- Environment chosen at build time: `tauri.dev.conf.json` and `tauri.prd.conf.json` set product name, identifier and the Cargo feature `dev` or `prd`, which picks the API URL and pool ids in `env.rs`; `pnpm tauri:build:dev` or `pnpm tauri:build:prd`.
  Debug builds and the base config are dev; a release with no environment does not compile, and the app refuses to start when its identifier does not match the compiled environment.
- Keychain service and config folder are the identifier, so dev and prd never share them.
- The updater lives in `tauri.prd.conf.json` only (public key, endpoint, signed version required, `createUpdaterArtifacts`); the app registers it only when that config is present and the build is not debug, so dev and debug builds never check.
- Version: `Cargo.toml`, `package.json` and the `Cargo.lock` entry stay equal (`pnpm check:version`, run by `ci`); `tauri.conf.json` has none, so Tauri reads `Cargo.toml`.
- `settings.json` in the config folder: hotkey, first-run flag, and the Cognito `sub` of users who already picked a style on this machine; autostart lives in the OS (`HKCU\...\Run`).
- Debug builds only: `--dump-dir`, and `--dictate-wav` and `--stub-mode` sent to the running instance through single instance; the stub's tray submenu, off by default.

## Releases

- `pnpm release:desktop X.Y.Z [--notes file]` from a task branch: refuses `develop`, `main`, a dirty tree and any version not newer than the current one; bumps, commits, creates the annotated tag `desktop-vX.Y.Z` whose message is the release notes, and pushes branch and tag together.
- The first tag, `desktop-v0.1.0`, was made by hand, since the app was already at 0.1.0.
- `desktop-release` creates the draft through the API, lets `tauri-action` build the prd installer into it by id, uploads `take-my-word-windows-x64-setup.exe` for the landing, verifies every installer `latest.json` points to against the committed key and version, then publishes it as latest; prerelease versions stay drafts, which is how dry runs work.
- Tagged commits reach `develop` through merge commits; never rebase or force-push at or below a pushed tag.
- The installer is not code-signed, so Windows SmartScreen warns on first install.

## Testing

- `cargo test`: hook model, session gate, paste, worker and error messages, stub routing, Cognito request shapes against a local fake, SRP against vectors from `packages/cognito`, the account (renewal, single renewal under concurrency, sign-in, new password, sign-out order), the bearer retry, the keychain on the real Credential Manager, and the contract against `contract.schema.json`.
- `auth::dev_pool` tests are ignored: with `TMW_DEV_USERNAME` and `TMW_DEV_PASSWORD` they sign in to the dev pool, call the dev API and clean up after themselves.
- Vitest covers the views with a mocked bridge and fails `ci` when `contract.schema.json` is stale; `pnpm screenshots <dir>` renders every state at 390, 768 and 1280 px.
- Physical keyboard, microphone and paste behavior need a manual check from the PR installer; the update path was checked on Windows from 0.1.0 to 0.1.1.
