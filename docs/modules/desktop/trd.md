---
updated: 2026-10-24
source: 0020_fix_overlay_after_reboot
---

# Desktop: technical

Built on Windows by 0002, signed in to the real API by 0007, released and self-updating since 0005, with the editors, app rules and Spanish and English since 0008, on the brand since 0011, with hands-free and one main window since 0014, with "Use your own server" since 0016; phase 5 adds macOS and Linux.

## Structure

| Path | What |
|---|---|
| `apps/desktop/src-tauri/src/hotkey` | Native `WH_KEYBOARD_LL` hook behind `KeyHook`, the Esc hold-back, chord tracking fed by the hook and by page-forwarded keys (`Keys`, one count per event), the hold and hands-free gesture machine (`gesture.rs`), Start-menu guard, hotkey model |
| `apps/desktop/src-tauri/src/audio` | `cpal` capture with a pre-armed stream, filtered resampling to 16 kHz mono 16-bit WAV, the input level meter |
| `apps/desktop/src-tauri/src/session.rs`, `dictation.rs` | Gestures, cancel, the two-minute cap, the held-keys release check, the microphone check and the signed-out gate on the session thread; encode, send, paste and report on a worker |
| `apps/desktop/src-tauri/src/own_window.rs` | Dictations into the main window sent to the page with an ack, kept in the clipboard otherwise |
| `apps/desktop/src-tauri/src/paste.rs`, `clipboard`, `foreground` | Paste through a delayed-rendered clipboard counted only for the target's first read after the keystroke (Wait Chain Traversal for readers without a window, threads that ran since the keystroke first), one retry, restore after quiet, focus and integrity checks, `appId`, running apps |
| `apps/desktop/src-tauri/src/rules.rs` | The user's app rules kept in memory for the paste keystroke |
| `apps/desktop/src-tauri/src/i18n.rs`, `apps/desktop/src/i18n` | Message ids and the `es` and `en` dictionaries shared by Rust and the views |
| `apps/desktop/src-tauri/src/auth` | SRP port, the six Cognito calls, `Secret`, and `Account`: the session behind one lock |
| `apps/desktop/src-tauri/src/keychain` | Refresh token and device keys in Windows Credential Manager; unsupported elsewhere |
| `apps/desktop/src-tauri/src/api` | Serde mirror of the contracts Rust reads, the route forwarder, the bearer client with its one retry, and the debug-only stub |
| `apps/desktop/src-tauri/src/updater.rs`, `activity.rs` | Update check, offer, download and install; the in-flight dictation guard that keeps them out of a hold or a pending paste |
| `apps/desktop/src-tauri/src/env.rs`, `account.rs` | Build-time environment and its official server; app state, sign-in, new password, onboarding, sign-out and server switch commands, startup routing |
| `apps/desktop/src-tauri/src/server.rs`, `discovery_vectors.json` | `Server`, domain normalization, discovery (HTTPS, no redirects, 16 KiB, 15 s) and validation held to `discoverySchema` by the shared vectors |
| `apps/desktop/src-tauri/src/tray.rs`, `theme.rs`, `windows.rs` | Tray menu and state icon, the theme choice, the main window's placement, the update and overlay windows, the shared browser arguments |
| `apps/desktop/src-tauri/src/overlay.rs`, `overlay_health.rs` | The warm overlay: the hold gate, placement and content scale for the screen with the pointer, the page's paint confirmation, and the rule that recreates an overlay that paints no frame, never becomes ready or loses a WebView2 process |
| `apps/desktop/src` | React views on `packages/brand` primitives and token-only CSS in `styles/`: the main window (onboarding steps from the catalog in `views/onboarding/plan.ts`, settings and its sections), overlay, update; key forwarding and dictation insertion in every app window; `api.ts` validates every forwarded route with the shared schemas |
| `apps/desktop/scripts` | `tauri.ts` (the build-time server, updater key and releases repository from env or `deployment.json`, as a `--config` overlay), version check, `pnpm release:desktop`, the release check that verifies `latest.json` against `--pubkey`, the terminal smoke (`terminal-smoke.sh` with `terminal-smoke.ps1`) and the overlay smoke (`overlay-smoke.sh`, on the same helper) |
| `apps/desktop/contract` | JSON Schema of the mirrored contracts generated from `packages/shared` (`pnpm contract`) |
| `apps/desktop/screenshots` | Mocked Tauri bridge and the Playwright script behind `pnpm screenshots` |
| `.github/workflows/desktop-ci.yml` | Windows checks and the dev NSIS installer artifact, Linux clippy |
| `.github/workflows/desktop-release.yml` | prd build, signing and the GitHub Release on `desktop-v*` tags |

Windows code sits behind the hook, foreground, clipboard and keychain modules; other platforms compile with an unsupported implementation until phase 5.

## Endpoints owned

None; desktop is a client.

Calls, all from Rust with the access token: `POST /dictations` (audio and `appId`; the API picks the language), `GET /styles`, `GET /app-rules`, `GET` and `PUT /me/settings` (read first, since `PUT` replaces the item), and the editors' routes through the forwarder: dictionary, styles and app rules CRUD, settings, usage (`GET /me/usage`, read when General opens), history page and delete.
Discovery: `GET https://<domain>/.well-known/take-my-word.json` when the user picks their own server.
Cognito directly, as unsigned JSON calls: `InitiateAuth`, `RespondToAuthChallenge`, `ConfirmDevice`, `GetTokensFromRefreshToken`, `ForgetDevice`, `RevokeToken`.

Jobs, listeners or scheduled work: the key hook, the microphone thread and the clipboard thread run for the app's lifetime; a paint check runs 1 s after each overlay show and a ready check 20 s after each overlay is created; a renewal, and a rule refresh when the rules are older than 5 min, start in the background at the first press; a level emitter runs only while listening or while the microphone step is shown in a visible window, and a 100 ms held-keys check only while the shortcut is down; prd release builds check `releases/latest/download/latest.json` at start and every 6 hours.

## Depends on

- dictation: `POST /dictations` turns the WAV into clean text; settings hold the default style.
- auth: the pool, the client contract and the authorizer.
- styles, dictionary: the editors' data; app rules map the focused app to a style and a paste keystroke.
- GitHub Releases: installers and `latest.json`, downloaded anonymously by the updater and the landing; the landing reads the version through `desktopReleaseManifestSchema` in `packages/shared`.

## Depended on by

- None; nothing calls the desktop app.

## Configuration

- Environment chosen at build time: `tauri.dev.conf.json` and `tauri.prd.conf.json` set product name, identifier and the Cargo feature `dev` or `prd`; `pnpm tauri:build:dev` or `pnpm tauri:build:prd`.
  The official server is the discovery JSON in `TAKE_MY_WORD_SERVER` at build time (`DESKTOP_DEV_SERVER` or `DESKTOP_PRD_SERVER` in CI, `desktop.servers` of `deployment.json` locally), validated like any discovered server; a build without it refuses to start.
  Debug builds and the base config are dev; a release with no environment does not compile, and the app refuses to start when its identifier does not match the compiled environment.
- Server chosen at run time: `settings.json` holds `server` (domain and discovery) when the user picked their own; it is re-validated at start (invalid falls back to the official server), switched only while signed out, kept across sign-out, and absent in 0.2.0 files, which read as the official server.
- Keychain service and config folder are the identifier, so dev and prd never share them.
- The updater lives in the prd build only: `tauri.prd.conf.json` requires signed versions and creates the artifacts, and `scripts/tauri.ts` adds the public key (`DESKTOP_UPDATER_PUBKEY`) and the official releases endpoint; every server updates from the official releases. The app registers it only when that config is present and the build is not debug, so dev and debug builds never check.
- Version: `Cargo.toml`, `package.json` and the `Cargo.lock` entry stay equal (`pnpm check:version`, run by `ci`); `tauri.conf.json` has none, so Tauri reads `Cargo.toml`.
- `settings.json` in the config folder: hotkey, first-run flag, the Cognito `sub` of users already onboarded on this machine, whether the hands-free note was seen, the main window's last placement (`mainWindow`), and the app language and theme when chosen; autostart lives in the OS (`HKCU\...\Run`) with the `--autostart` argument.
- The default hotkey belongs to the environment in `env.rs`: Ctrl+Win for prd, Ctrl+Alt+Win (left Alt) for dev and debug; it applies only when `settings.json` holds no valid hotkey.
- Window sizes live in `src/windows.json` (main window first size and minimum, update, overlay), read by Rust and the screenshots; the update window is fitted to its content at run time.
- Every WebView window shares one browser argument string, `--force-prefers-no-reduced-motion` included.
- Icons in `src-tauri/icons` (prd) and `icons/dev` (dev, the base config's) are written by `pnpm desktop-assets` in `packages/brand`, including the tray frames for 16 to 32 px.
- Debug builds only: `--dump-dir`, and `--dictate-wav` and `--stub-mode` sent to the running instance through single instance; the stub's tray submenu, off by default, with a two-line mode for multi-line pastes.

## Releases

- `pnpm release:desktop X.Y.Z [--notes file]` from a task branch: refuses `develop`, `main`, a dirty tree and any version not newer than the current one; bumps, commits, creates the annotated tag `desktop-vX.Y.Z` whose message is the release notes, and pushes branch and tag together.
- The first tag, `desktop-v0.1.0`, was made by hand, since the app was already at 0.1.0.
- `desktop-release` creates the draft through the API, lets `tauri-action` build the prd installer into it by id, uploads `take-my-word-windows-x64-setup.exe` for the landing, verifies every installer `latest.json` points to against `DESKTOP_UPDATER_PUBKEY` and the version, then publishes it as latest; prerelease versions stay drafts, which is how dry runs work.
- Tagged commits reach `develop` through merge commits; never rebase or force-push at or below a pushed tag.
- The installer is not code-signed, so Windows SmartScreen warns on first install.

## Testing

- Discovery parity: `discovery_vectors.json` (accepted and refused documents) runs against `discoverySchema` in vitest and against the Rust validator in cargo.
- `cargo test`: the overlay's placement at each screen's scale and the rule that recreates it, hook model, gestures, twin key events, the held-keys release, session gate, the microphone check gate, inserts into the main window, paste with its retry, read order and reader rules (the real-clipboard ones ignored locally, run by `desktop-ci`), worker and error messages, route forwarding, rule cache ordering, level meter on a speech WAV and silence, dictionaries, stub routing, Cognito request shapes against a local fake, SRP against vectors from `packages/cognito`, the account (renewal, single renewal under concurrency, sign-in, new password, sign-out order), the bearer retry, the keychain on the real Credential Manager, the tray status and frames, window fitting, each environment's default hotkey, and the contract against `contract.schema.json`.
- `auth::dev_pool` tests are ignored: with `TMW_DEV_USERNAME` and `TMW_DEV_PASSWORD` they sign in to the dev pool, call the dev API and clean up after themselves.
- Vitest covers the views with a mocked bridge, both dictionaries for missing keys, the brand token lint over every CSS and TSX file, and fails `ci` when `contract.schema.json` is stale; `pnpm screenshots <dir> [prefix,...]` renders every state in both languages and themes at each window's real size (the main window at 380x480, 1280x800, 1920x1080 and 2560x1440) and fails on sideways scroll or a fixed window that would scroll.
- `scripts/terminal-smoke.sh`, run by hand from WSL on the Windows host and never in CI, dictates with a debug build (built with `--features tauri/custom-protocol`) into Windows Terminal with WSL, tmux and Claude Code, WSL with tmux, WSL bash, Windows PowerShell, conhost, a text box, WebView2 and Chrome, optionally racing a reader without a window, and records per paste the app's log lines, the text read back from the target, whether a line ran and the clipboard check.
  It opens and closes only its own windows, tmux sockets and app instance, seals the whole clipboard in a DPAPI file before touching it and restores it with a verified hash, waits for 5 idle minutes, checks for real input before every injected step and the foreground before every dictation, and needs `--sign-in` only for the real hold.
- `scripts/overlay-smoke.sh`, run by hand from WSL under the same guards, starts a dev build by hand and with `--autostart` and judges each take on screen pixels against the hidden baseline: the pill painted while listening and cleaning up, no title bar, centred at the scale of its screen with the waveform drawn at that scale, and the focus left where it was; `--no-frames` (debug builds) makes the overlay paint nothing and needs it recreated within the hold, `--displays` takes on both screens and after a scale change, and the run exits nonzero on any failure.
- Physical keyboard, microphone and paste behavior need a manual check from the PR installer; the update path was checked on Windows from 0.1.0 to 0.1.1, the editors, paste keystrokes, languages and a silent hold in 0008, in 0011 a real hold pasting into a scratch window, with idle RAM and CPU against the base build, in 0012 pastes into a scratch window, WebView2 and Chrome with a reader without a window racing them, in 0013 the terminal smoke on every target with two-line dictations and a real hold into Claude Code in tmux, and in 0014 injected hold, hands-free, Esc held back from a scratch window, the spinner animating with Windows animations off, the practice box, the maximized first launch and restore, a second launch to the front and idle RAM and CPU; Windows runs launch debug builds with no console, under an idle guard that ignores only injected input and a DPAPI-encrypted clipboard snapshot restored and hash-compared.
