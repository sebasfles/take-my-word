---
updated: 2026-10-22
source: 0012_fix_lost_paste
---

# Desktop: technical

Built on Windows by 0002, signed in to the real API by 0007, released and self-updating since 0005, with the editors, app rules and Spanish and English since 0008, on the brand since 0011; phase 5 adds macOS and Linux.

## Structure

| Path | What |
|---|---|
| `apps/desktop/src-tauri/src/hotkey` | Native `WH_KEYBOARD_LL` hook behind `KeyHook`, chord tracking, Start-menu guard, hotkey model |
| `apps/desktop/src-tauri/src/audio` | `cpal` capture with a pre-armed stream, filtered resampling to 16 kHz mono 16-bit WAV, the input level meter |
| `apps/desktop/src-tauri/src/session.rs`, `dictation.rs` | Hold, cancel, cap and the signed-out gate on the session thread; encode, send, paste and report on a worker |
| `apps/desktop/src-tauri/src/paste.rs`, `clipboard`, `foreground` | Paste through a delayed-rendered clipboard counted only for the target's first read after the keystroke (Wait Chain Traversal for readers without a window), one retry, restore after quiet, focus and integrity checks, `appId`, running apps |
| `apps/desktop/src-tauri/src/rules.rs` | The user's app rules kept in memory for the paste keystroke |
| `apps/desktop/src-tauri/src/i18n.rs`, `apps/desktop/src/i18n` | Message ids and the `es` and `en` dictionaries shared by Rust and the views |
| `apps/desktop/src-tauri/src/auth` | SRP port, the six Cognito calls, `Secret`, and `Account`: the session behind one lock |
| `apps/desktop/src-tauri/src/keychain` | Refresh token and device keys in Windows Credential Manager; unsupported elsewhere |
| `apps/desktop/src-tauri/src/api` | Serde mirror of the contracts Rust reads, the route forwarder, the bearer client with its one retry, and the debug-only stub |
| `apps/desktop/src-tauri/src/updater.rs`, `activity.rs` | Update check, offer, download and install; the in-flight dictation guard that keeps them out of a hold or a pending paste |
| `apps/desktop/src-tauri/src/env.rs`, `account.rs` | Build-time environment; sign-in, new password, onboarding and sign-out commands and windows |
| `apps/desktop/src-tauri/src/tray.rs`, `theme.rs`, `windows.rs` | Tray menu and state icon, the theme choice, window creation and fitting |
| `apps/desktop/src` | React views on `packages/brand` primitives and token-only CSS in `styles/`: sign-in, choose password, onboarding, first run, settings and its sections, overlay, update; `api.ts` validates every forwarded route with the shared schemas |
| `apps/desktop/scripts` | Version check, `pnpm release:desktop`, and the release check that verifies `latest.json` against the committed key |
| `apps/desktop/contract` | JSON Schema of the mirrored contracts generated from `packages/shared` (`pnpm contract`) |
| `apps/desktop/screenshots` | Mocked Tauri bridge and the Playwright script behind `pnpm screenshots` |
| `.github/workflows/desktop-ci.yml` | Windows checks and the dev NSIS installer artifact, Linux clippy |
| `.github/workflows/desktop-release.yml` | prd build, signing and the GitHub Release on `desktop-v*` tags |

Windows code sits behind the hook, foreground, clipboard and keychain modules; other platforms compile with an unsupported implementation until phase 5.

## Endpoints owned

None; desktop is a client.

Calls, all from Rust with the access token: `POST /dictations` (audio and `appId`; the API picks the language), `GET /styles`, `GET /app-rules`, `GET` and `PUT /me/settings` (read first, since `PUT` replaces the item), and the editors' routes through the forwarder: dictionary, styles and app rules CRUD, settings, history page and delete.
Cognito directly, as unsigned JSON calls: `InitiateAuth`, `RespondToAuthChallenge`, `ConfirmDevice`, `GetTokensFromRefreshToken`, `ForgetDevice`, `RevokeToken`.

Jobs, listeners or scheduled work: the key hook, the microphone thread and the clipboard thread run for the app's lifetime; a renewal, and a rule refresh when the rules are older than 5 min, start in the background at hotkey down; a level emitter runs only during a hold; prd release builds check `releases/latest/download/latest.json` at start and every 6 hours.

## Depends on

- dictation: `POST /dictations` turns the WAV into clean text; settings hold the default style.
- auth: the pool, the client contract and the authorizer.
- styles, dictionary: the editors' data; app rules map the focused app to a style and a paste keystroke.
- GitHub Releases: installers and `latest.json`, downloaded anonymously by the updater and the landing; the landing reads the version through `desktopReleaseManifestSchema` in `packages/shared`.

## Depended on by

- None; nothing calls the desktop app.

## Configuration

- Environment chosen at build time: `tauri.dev.conf.json` and `tauri.prd.conf.json` set product name, identifier and the Cargo feature `dev` or `prd`, which picks the API URL and pool ids in `env.rs`; `pnpm tauri:build:dev` or `pnpm tauri:build:prd`.
  Debug builds and the base config are dev; a release with no environment does not compile, and the app refuses to start when its identifier does not match the compiled environment.
- Keychain service and config folder are the identifier, so dev and prd never share them.
- The updater lives in `tauri.prd.conf.json` only (public key, endpoint, signed version required, `createUpdaterArtifacts`); the app registers it only when that config is present and the build is not debug, so dev and debug builds never check.
- Version: `Cargo.toml`, `package.json` and the `Cargo.lock` entry stay equal (`pnpm check:version`, run by `ci`); `tauri.conf.json` has none, so Tauri reads `Cargo.toml`.
- `settings.json` in the config folder: hotkey, first-run flag, the Cognito `sub` of users already onboarded on this machine, and the app language and theme when chosen; autostart lives in the OS (`HKCU\...\Run`).
- The default hotkey belongs to the environment in `env.rs`: Ctrl+Win for prd, Ctrl+Alt+Win (left Alt) for dev and debug; it applies only when `settings.json` holds no valid hotkey.
- Window sizes live in `src/windows.json`, read by Rust and the screenshots; onboarding and the update window are fitted to their content at run time.
- Icons in `src-tauri/icons` (prd) and `icons/dev` (dev, the base config's) are written by `pnpm desktop-assets` in `packages/brand`, including the tray frames for 16 to 32 px.
- Debug builds only: `--dump-dir`, and `--dictate-wav` and `--stub-mode` sent to the running instance through single instance; the stub's tray submenu, off by default.

## Releases

- `pnpm release:desktop X.Y.Z [--notes file]` from a task branch: refuses `develop`, `main`, a dirty tree and any version not newer than the current one; bumps, commits, creates the annotated tag `desktop-vX.Y.Z` whose message is the release notes, and pushes branch and tag together.
- The first tag, `desktop-v0.1.0`, was made by hand, since the app was already at 0.1.0.
- `desktop-release` creates the draft through the API, lets `tauri-action` build the prd installer into it by id, uploads `take-my-word-windows-x64-setup.exe` for the landing, verifies every installer `latest.json` points to against the committed key and version, then publishes it as latest; prerelease versions stay drafts, which is how dry runs work.
- Tagged commits reach `develop` through merge commits; never rebase or force-push at or below a pushed tag.
- The installer is not code-signed, so Windows SmartScreen warns on first install.

## Testing

- `cargo test`: hook model, session gate, paste with its retry, read order and reader rules (the real-clipboard ones ignored locally, run by `desktop-ci`), worker and error messages, route forwarding, rule cache ordering, level meter on a speech WAV and silence, dictionaries, stub routing, Cognito request shapes against a local fake, SRP against vectors from `packages/cognito`, the account (renewal, single renewal under concurrency, sign-in, new password, sign-out order), the bearer retry, the keychain on the real Credential Manager, the tray status and frames, window fitting, each environment's default hotkey, and the contract against `contract.schema.json`.
- `auth::dev_pool` tests are ignored: with `TMW_DEV_USERNAME` and `TMW_DEV_PASSWORD` they sign in to the dev pool, call the dev API and clean up after themselves.
- Vitest covers the views with a mocked bridge, both dictionaries for missing keys, the brand token lint over every CSS and TSX file, and fails `ci` when `contract.schema.json` is stale; `pnpm screenshots <dir> [prefix,...]` renders every state in both languages and themes at each window's real size (settings at 380, 880 and 1280) and fails on sideways scroll or a fixed window that would scroll.
- Physical keyboard, microphone and paste behavior need a manual check from the PR installer; the update path was checked on Windows from 0.1.0 to 0.1.1, the editors, paste keystrokes, languages and a silent hold in 0008, in 0011 a real hold pasting into a scratch window, with idle RAM and CPU against the base build, and in 0012 pastes into a scratch window, WebView2 and Chrome with a reader without a window racing them; Windows runs launch debug builds with no console.
