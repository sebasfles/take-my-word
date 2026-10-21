---
id: "0007"
title: desktop_integration
type: feature
crew: pair
clearance: full
branch: feat/0007_desktop_integration
modules: [desktop, auth, dictation]
repos: ["."]
phases: 0
depends_on: ["0002", "0003"]
ticket:
created: 2026-10-21
updated: 2026-10-21
---

# 0007 Desktop integration with the API

## Goal

The desktop shell from 0002 talks to the real API: the user signs in once with username and password, stays signed in, and every dictation goes through `POST /dictations` in dev or prd depending on the build.
This is the first usable product end to end.

## Scope

- Sign-in form in the desktop UI (username, password, "choose your password" step for `NEW_PASSWORD_REQUIRED`), SRP against Cognito from the Rust side or through the shared Node SRP package via a sidecar, whichever the om-reviewer finds sound; device confirmation and refresh token rotation as `docs/modules/auth/trd.md` describes; tokens and device key in the OS keychain (`keyring` crate, Windows Credential Manager); silent refresh before expiry; sign out revokes and forgets the device, then clears the keychain.
- Real API client implementing the trait from 0002 with the `packages/shared` contract (multipart WAV plus `meta` with `locale`, `appId`); the JSON Schema contract test promised in 0002 (schema generated from `packages/shared` with `z.toJSONSchema`, Rust serde types checked against it in CI).
- Error handling: 401 after a failed refresh returns to sign-in; 429 shows the daily limit message in the overlay; 413 and 415 show a short message; network failure shows the error overlay; in every failure nothing is pasted and the clipboard is restored.
- Build-time configuration per environment: API base URL, Cognito pool and client ids for dev and prd; `pnpm tauri build` selects the env; the stub stays available in debug builds only.
- Onboarding: after the first sign-in on a device the app asks the user to pick a default style from `GET /styles` and saves it with `PUT /me/settings` (styles API from 0003).
- Screenshots at the three widths of sign-in, choose-password, onboarding and the error overlays; Windows smoke captures with the real dev API using `crew-e2e`.
- Docs: desktop, auth and dictation module docs via `document-task`.

## Out of scope

- Dictionary, styles and app rules editors, history screen: 0008.
- Updater and release: 0005.
- Google sign-in.

## Acceptance

1. Root `pnpm lint`, `typecheck`, `test` and the desktop `cargo` checks pass; `ci` and `desktop-ci` green; the contract test runs in CI.
2. On a fresh install the app shows sign-in; `crew-e2e` signs in and reaches the onboarding style picker; picking `casual` saves it (`GET /me/settings` returns it); the app restarts without asking again.
3. A user with a temporary password gets the "choose your password" step and lands in onboarding afterwards.
4. With the cursor in Notepad, holding Ctrl+Win and speaking (the crew uses the dev WAV command with a Spanish sample), the real cleaned text from the dev API is pasted and the clipboard is restored; the dictation appears in `GET /dictations`.
5. Revoking the refresh token server side makes the next dictation fail and the app return to sign-in, pasting nothing.
6. Seeding the quota item to the cap makes the next dictation show the daily limit message; a 2 s silent recording pastes nothing.
7. Sign out clears Credential Manager entries and revokes the token (a later refresh with the old token fails).
8. Tokens, the device key and the password never appear on disk in plain text, in logs or in screenshots.

## Approach

- Where SRP runs is the om-reviewer's call at analyze time: a Rust SRP implementation avoids a Node sidecar in the binary; the shared Node package avoids a second implementation. The decision and its reason go to `docs/modules/desktop/ard.md`.
- Keychain through `keyring`; alternative rejected: an encrypted file, weaker than the OS store.
- Env selection at build time with Tauri's config merging (`tauri.dev.conf.json`, `tauri.prd.conf.json`); alternative rejected: a runtime endpoint field (dead UI).

## Database

None on the client; reads and writes `SETTINGS` and `DICTATION#` through the API.

## Infra

None new; uses dev (and prd for the prd build) as applied. No Terraform change expected.

- Windows machine rules (from 0002): the toolchain (VS Build Tools 2022, rustup, fnm with Node 24, pnpm) is installed; this task keeps its own mirror checkout at `C:\dev\tmw-0007` and its scratch under `C:\dev\tmw-0007-*`, all removed at clean-task. Injected runs (keystrokes, mouse, foreground window, microphone setting) need Sebastian away: start only after 2 minutes of Windows idle, abort and restore on real input, and announce each run to the om-manager with `computer busy: <what, how long>` before and `computer free` after, restoring debug apps, hotkey, autostart, microphone setting and clipboard. Another desktop task may run in parallel: never touch its mirror, and never start an injected run while the om-manager has not relayed the other task's `computer free`.

## Design

None.

## Risks

- SRP and device confirmation in Rust: the Cognito SRP variant has quirks (padding, timestamp format); the e2e scripts from 0001 are the reference implementation.
- Credential Manager entry size limits (about 2.5 KB per blob): split tokens into several entries if needed.

## Depends on

0002 (PR #8) and 0003 (PR #3), both merged. Runs alongside 0005.

## Context & decisions

- Acceptance 5 adjusted (om-manager for Sebastian): the authorizer checks signatures, not revocation (`docs/modules/auth/ard.md`, 2026-10-21), so it reads: after `admin-forget-device` on the desktop's device the next renewal fails; a restart forces it (the access token lives only in memory), the next dictation fails, pastes nothing and the app returns to sign-in. Fallback if forgetting the device does not stop renewal: `admin-user-global-sign-out` on a throwaway user.
- Environments (Sebastian via om-manager): dev and prd are separate apps, "Take My Word Dev" and "Take My Word", each with its own identifier, keychain service, config folder and autostart entry, through `tauri.dev.conf.json` and `tauri.prd.conf.json`. Debug builds and `desktop-ci` use dev; a release build with no env selected fails. Pool and client ids are public and committed; prd values are read-only lookups. The updater (0005) belongs to prd only; whichever of 0005 and 0007 merges second reconciles `tauri.conf.json`, `Cargo.toml` and the tray.
- Language (Sebastian via om-manager): sign-in, choose-password, onboarding and new error messages in English, like the shell; desktop i18n moves to 0008.
- Onboarding (Sebastian via om-manager): once per user per device, a local flag keyed by the Cognito `sub`, current `defaultStyleId` preselected; not shown again when the same user signs back in on that machine. Dictation works while it is pending. `PUT /me/settings` replaces the whole item, so read `GET /me/settings` first. `document-task` aligns `auth/prd.md`.
- SRP in Rust (om-reviewer, the task's call): no Node sidecar, which would add a Node runtime of tens of MB to a ~10 MB binary (`desktop/ard.md`, Tauri entry) and move tokens across processes. The SRP port mirrors `packages/cognito/src/srp.ts`; the six Cognito operations are unsigned JSON POSTs over reqwest, no AWS SDK. Cross-checked with fixed vectors produced by `packages/cognito` plus a real dev sign-in. Recorded in `desktop/ard.md`.
- Sign-in never passes `DEVICE_KEY` (no `DEVICE_SRP_AUTH`; the device password is not kept, as in `packages/cognito`); every sign-in confirms a new device. Client contract in `docs/modules/auth/trd.md` holds: `DeviceKey` on every refresh, store the rotated token at once, never resend an old one.
- Tokens never reach the WebView (om-reviewer): Cognito, `POST /dictations`, `GET /styles`, `GET`/`PUT /me/settings` all run in Rust; the UI gets only what it renders through commands, CSP stays `default-src 'self'`, the challenge session stays in Rust. This extends the recorded Rust-mirror exception (`desktop/ard.md`, 2026-10-21) to styles and settings.
- Contract test (om-reviewer): JSON Schema from `packages/shared` via `z.toJSONSchema` for every mirrored contract (meta, response, error, settings, style list); a committed generated file whose staleness fails `ci`, compared in a Rust test so `cargo test` runs alone on the Windows mirror. It fails on any field, enum value or required flag added, removed or renamed on either side; it must be shown red on today's mirror (missing `styleId`, `latencyMs.profile`, five error codes) before the fix.
- Keychain (om-reviewer): refresh token, `DeviceKey`, `DeviceGroupKey` via `keyring` with the Windows native backend (v3 without a platform feature silently uses a mock store); access token in memory. Measure real dev token sizes against the 2560-byte blob limit (the password API may store UTF-16) before splitting.
- Session (om-reviewer): lazy renewal with under 5 min left, kicked at hotkey down to overlap the recording; one renewal at a time behind a single lock (`auth/ard.md`, Web Lock entry). The gateway answers 401 without a token and 403 for an invalid one (`auth/trd.md`); a gateway 401/403 without the error envelope forces one renewal and one retry (safe, `dictate` never ran). Only `NotAuthorizedException` and reuse sign out; network and 5xx keep the session. Signed out, the hotkey records nothing, shows "sign in" and opens the sign-in window.
- Sign-out from the tray and Settings, in the web's order (`auth/ard.md`, 2026-10-21): renew if expiring, `ForgetDevice`, `RevokeToken`, clear the keychain even when Cognito fails.
- Stub (om-reviewer): compiled only into debug builds (axum out of release); debug defaults to the real dev API; stub modes replace only `POST /dictations`, sign-in is always real. Resolves the desktop debt "Release builds ship the API stub".
- TLS: reqwest gains a TLS backend verifying against the Windows store that builds on `windows-latest` and the host with no new toolchain (aws-lc-rs needs cmake and NASM).
- Test users (om-reviewer): Acceptance 3, 5 and 6 on throwaway dev users the crew creates and deletes, as `apps/web/integration` does; crew-e2e for 2, 4 and 7, its `SETTINGS` restored after 2; never leave a seeded `QUOTA#` item behind.
- Delivery (om-reviewer): one branch, three review milestones, one PR: (1) env split, debug-only stub, TLS, contract test, Rust Cognito client, keychain; (2) session, API client, error mapping, views, screenshots; (3) Windows smoke for 2 to 8, `desktop-ci`, docs.
- Review will also check: secret types with redacted `Debug`, the password dropped after use and never in an error string; after the smoke the crew searches the log folder, the config folder and the WebView data folder (`EBWebView`) for token, device key and password values and finds none; evidence scripts never write a token to disk (Acceptance 7 and 8).
- clearance: full: AWS profile `fless-takemyword` on dev (crew-e2e sign-in, throwaway users, device forget and global sign-out on them, `QUOTA#` seed and removal, crew-e2e `SETTINGS` restore), prd read-only for pool and client ids, the Windows host under the machine rules above with mirror `C:\dev\tmw-0007`; no Terraform, no prd writes.

## om-developer notes

### Round 1 (milestone 1: env split, debug-only stub, TLS, contract test, Rust Cognito client, keychain)

Done:

- Environments: Cargo features `dev` and `prd`, selected by `build.features` in `tauri.dev.conf.json` and `tauri.prd.conf.json`; `src-tauri/src/env.rs` holds both sets of public values (prd ids read with `list-user-pools` and `list-user-pool-clients`, read-only).
  The base `tauri.conf.json` is the dev app, so `cargo test` and debug builds are dev; `compile_error!` stops a release with no environment or with both, and startup refuses a Tauri identifier that does not match the compiled environment.
  Dev is "Take My Word Dev" (`dev.fless.takemyword.dev`), prd "Take My Word" (`dev.fless.takemyword`); the tray tooltip shows the product name.
  Scripts `pnpm tauri:build:dev` and `pnpm tauri:build:prd`; `rust:lint`, `windows:build` and `desktop-ci` use dev (release clippy with `--features dev`, the dev NSIS installer).
  Checked on the mirror: `cargo check --release` with no feature fails with the message, `pnpm windows:build` produces `Take My Word Dev_0.1.0_x64-setup.exe`.
- Stub: compiled only under `debug_assertions`; a new `Off, real API` mode is the default, and `Stubbed` routes `POST /dictations` to the stub only while another mode is picked.
  The release worker calls the env's API without a token for now (401 until milestone 2 adds the session).
  The status mapping and the stub-only constants moved into `stub.rs`, so release builds have no dead code.
- TLS: reqwest `native-tls` (SChannel on Windows, verifying against the Windows store, no cmake or NASM); `libssl-dev` added explicitly to the Linux clippy job.
- Contract: `apps/desktop/contract/` generates `src-tauri/src/api/contract.schema.json` with `z.toJSONSchema` (`pnpm contract`; meta with `io: "input"`); a vitest test fails `ci` when the committed file is stale (compared as parsed JSON, the file is prettier-ignored as generated).
  The Rust test derives schemas with `schemars` (dev-dependency, `cfg_attr(test)`) and compares normalized shapes: field names, required flags, enum and const values, arrays and primitive kinds; string patterns, lengths and integer bounds are not compared.
  Red on today's mirror before the fix (`.verify/contract-red.out` in the workspace): four missing error codes (`unauthorized`, `forbidden`, `not_found`, `conflict`; the plan said five), `latencyMs.profile`, `styleId`, and no settings or style list mirror.
  Fixed by completing the mirror and adding `UserSettings`, `SettingsProviders`, `Style`, `StyleList`.
- Cognito: `src-tauri/src/auth/` with `Secret` (zeroized on drop, redacted `Debug`, no `Serialize`, so every request exposes it explicitly), `srp.rs` mirroring `packages/cognito/src/srp.ts`, and `cognito.rs` with the six operations as unsigned JSON 1.1 POSTs.
  Fixed vectors in `auth/srp_vectors.json` were produced by `packages/cognito/src/srp.ts` with `randomBytes` patched through `syncBuiltinESMExports` (password claims on two dates, one with a one-digit day, and the device verifier); the Rust port matched them on the first run.
  Fake-Cognito tests cover the request shapes (no `DEVICE_KEY` on sign-in, `DeviceKey` on every refresh, the new-password step) and the error split.
  Real dev pass (`auth::dev_pool`, ignored, credentials through `WSLENV`, never on disk): `crew-e2e` signs in, confirms the device, rotates the refresh token, round-trips the real tokens through Credential Manager, forgets the device, revokes, and the next refresh fails as session-ending; `crew-e2e` has no devices left.
  Measured: access token 1113 bytes, refresh token 1932, device key 46, device group key 36; the password does not appear in any output.
- Keychain: `src-tauri/src/keychain/` stores refresh token, `DeviceKey` and `DeviceGroupKey` in Windows Credential Manager; tests on the real store cover the round trip, rotation, a partial session read as signed out and removed, and a value over the blob limit failing without echoing it.

Decisions the plan did not record:

- `keyring-core` 1 with `windows-native-keyring-store` 1.1 instead of the `keyring` crate: since v4 `keyring` is a CLI pulling clap and rpassword, and its library split into `keyring-core` plus one store crate per OS.
  The store is built explicitly (no global default store), so there is no silent mock fallback; non-Windows builds get an unsupported keychain like the other platform modules.
- Secrets go in as raw UTF-8 bytes (`set_secret`), not passwords: the 1932-byte refresh token fits the 2560-byte blob, while UTF-16 would need 3864, so nothing is split.
- Credentials persist as `Local` (`CRED_PERSIST_LOCAL_MACHINE`) instead of the store's `Enterprise` default, so device-bound tokens never roam with a domain profile.
- `CognitoError::ends_session` is true only for `NotAuthorizedException` and `RefreshTokenReuseException`; an empty success body reads as `{}` (`ForgetDevice` and `RevokeToken` answer with none); a refresh answer without `RefreshToken` is an error, as in `packages/cognito`.
- axum and tokio stay regular dependencies: Cargo cannot scope a dependency to a profile, but with the stub under `debug_assertions` none of their code links into release.

Pending: milestone 2 (session, API client, error mapping, views, screenshots) and milestone 3 (Windows smoke, `desktop-ci`, docs).
`mod auth` and `mod keychain` carry a temporary `allow(dead_code)` until the session wires them in milestone 2.

Deferred: `--stub-mode` from the command line (debug) changes the mode without updating the tray checkmarks; pre-existing.

### Round 2

Done:

- Finding 1 applied: `CognitoError::ends_session` is now false only for transient failures (network, unexpected answers, HTTP 5xx, `InternalErrorException`, `TooManyRequestsException`); every other rejection ends the session, and `Rejected` carries the HTTP status.
- Established in dev on a throwaway user (`desktop-probe-*`, deleted afterwards; `.verify/forget-probe.out` in the workspace): after `admin-forget-device` alone, `GetTokensFromRefreshToken` answers `NotAuthorizedException` "Invalid Refresh Token.", still the same 15 s later; after `admin-delete-user` it answers `NotAuthorizedException` "The user has been deleted for the associated refresh token".
  Both answers, plus reuse and `UserNotFoundException`, are in the fake-Cognito test next to throttling, `InternalErrorException`, a typed 503 and an untyped 500, which keep the session.

Pending and deferred: as in round 1.

### Round 3 (milestone 2: session, API client, error mapping, views, sign-out, screenshots)

Done:

- Session: `auth/account.rs` keeps the refresh token and device keys from the keychain (service = the compiled environment's identifier) and the access token in memory only.
  Every caller goes through one mutex: an access token with under 5 minutes left renews before use, the rotated refresh token is written to the keychain at once, and callers waiting on a renewal share its result (tested with four threads, one Cognito call).
  A session-ending answer clears the keychain and signs out; transient failures keep the session.
  The hotkey reads an atomic flag (never the mutex, so a renewal in flight cannot delay recording) and starts a background renewal at key down.
  The temporary `allow(dead_code)` on `mod auth` and `mod keychain` is gone.
- Sign-in: SRP, then `ConfirmDevice` for the new device, then the keychain; the `NEW_PASSWORD_REQUIRED` session waits in Rust, survives an `InvalidPasswordException` for a retry, and an expired one sends the UI back to sign-in.
  If the keychain refuses the session, the device is forgotten and the token revoked, so nothing dangles.
  Device name: `{product name} on {COMPUTERNAME}`.
- Sign-out (tray item that toggles between "Sign in" and "Sign out", and a Settings row): renew if needed, `ForgetDevice`, `RevokeToken`, clear the keychain even when Cognito fails; the sign-in window opens whenever the session ends.
- API: `api/authed.rs` adds the bearer token to `POST /dictations`, `GET /styles`, `GET` and `PUT /me/settings`; a 401 or 403 without the error envelope renews once and retries once, and a second refusal is reported instead of renewing again.
- Errors in the overlay: signed out shows "Sign in to Take My Word to dictate." (the sign-in window is already open), quota "You've reached today's dictation limit.", HTTP 413 and 415 short messages by status (the gateway's own 413 has no envelope), network the existing message; nothing is pasted in any of them.
- Signed out, a hold never opens the microphone: `Sink::may_record` refuses it, shows the sign-in message and opens the sign-in window.
- Views: one `account` window with sign-in, choose-password (local mismatch check, the web's copy and password rules) and the style picker; onboarding reads `GET /styles` and `GET /me/settings`, preselects the current default, and saves through `GET` then `PUT /me/settings`.
  The flag is `onboardedUsers` (Cognito `sub`) in `settings.json`; startup reopens the picker while it is pending, then the first-run window if that is not done.
- Real dev pass (ignored test, credentials through `WSLENV`): the Rust account signs `crew-e2e` in, reads styles and settings from the dev API through the bearer client, signs out and leaves the keychain empty; `crew-e2e` has no devices left.
- Screenshots of every new and changed state at 390, 768 and 1280 px (plus 1280 light): `screenshots/round-3/` in the workspace, 92 files.

Decisions the plan did not record:

- Tokens are read through `Credentials` (`api/authed.rs`), implemented by the account, so the HTTP client never sees the session and the retry rule is tested against a local gateway.
- The account window is a single view whose step lives in React; only the onboarding entry comes from the URL, because the choose-password step needs the challenge that only Rust holds.
- A second 401 or 403 after the forced renewal shows the generic error instead of signing out: Cognito has just confirmed the session.
- The settings window grew to 560 px high for the account row.

Pending: milestone 3 (Windows smoke for Acceptance 2 to 8 once the om-manager relays `computer available`, `desktop-ci`, docs).
Deferred: none new.

### Round 4 (milestone 3: Windows smoke, desktop-ci, verification)

Windows smoke, Windows 11 on Sebastian's machine, dev API and pool, announced to the om-manager (`computer busy` at 14:28, `computer free` after).
It started after Windows reported more than 2 minutes idle; physical mouse input had kept it from starting earlier.
A low-level hook watched for physical input the whole time and saw none.
Input was injected with `SendInput` (Unicode typing for the forms) and UI Automation (buttons, radios); credentials came through `WSLENV`, never written to disk.
Captures are in `screenshots/windows/` in the workspace; mocked screenshots of every view are in `screenshots/round-3/`.

- Acceptance 2 (release dev installer, `crew-e2e`): after removing the dev app's data and credentials, the silent install opened the sign-in window (`a2-sign-in-after-fresh-install`).
  Signing in reached the style picker with `plain` preselected (`a2-onboarding`); picking Casual saved it, and `GET /me/settings` returned `defaultStyleId=casual`; first run followed and was dismissed.
  After a restart only the app's internal windows existed (single-instance and event-loop windows), so neither sign-in nor the picker came back.
  `crew-e2e`'s `SETTINGS` was restored to `plain` right after.
- Acceptance 3 (installed build, throwaway user with a temporary password): sign-in led to choose-password (`a3-choose-password`), then to the picker (`a3-onboarding-after-new-password`); after Formal was saved the window closed.
  The user and its `SETTINGS` item were deleted.
- Acceptance 4 (debug build, `crew-e2e`, `--dictate-wav` with a Polly es-US sample into a Notepad tab): the real cleaned text was pasted ("Hola, esta es una prueba de dictado desde la aplicación de escritorio. Mañana revisamos el informe con el equipo."), the clipboard hash was unchanged, and the dictation is the newest item of `GET /dictations` (`a4-dictation-notepad`, cropped to the text).
- Acceptance 5 (throwaway user): after `admin-forget-device` on the app's device and a restart, the renewal at startup failed (`NotAuthorizedException: Invalid Refresh Token.`), the keychain was cleared and the sign-in window opened.
  The next dictation showed "Sign in to Take My Word to dictate." (`a5-after-forget-overlay`), pasted nothing, and the clipboard was unchanged.
- Acceptance 6 (throwaway users): with `QUOTA#2026-10-21` seeded at 3600 s the dictation answered 429 `quota_exceeded`, showed "You've reached today's dictation limit." (`a6-quota-overlay`) and pasted nothing.
  A 2 s near-silent WAV pasted nothing and showed no error ("dictation returned no text" in the log).
  The seeded item was removed; the users and all their items are gone (0 items left).
- Acceptance 7 (`crew-e2e`, and again for every throwaway user): Sign out in Settings removed all three Credential Manager entries.
  A refresh with the old token and device key, read into memory before the sign-out, answered "Invalid Refresh Token."; the device left the user's device list and the sign-in window opened (`a7-settings-signed-in`, `a7-settings-signed-out`).
- Acceptance 8: the dev app's config folder, log folder and WebView data (`EBWebView`) were searched for the live refresh token, device key and device group key, the passwords used, and anything token-shaped (`eyJ….…`), in UTF-8 and UTF-16.
  Searches ran signed in with the app stopped (184 files), after the new-password flow (195 files), and at the end (282 files, 72.9 MB, none locked): 0 hits each time.
  The throwaway users of Acceptance 6 were searched only for token-shaped values, not for their exact passwords.
- Also: holding Ctrl+Win while signed out (Notepad in front) showed the sign-in message, recorded and sent nothing, and left Start closed (`signed-out-hold-overlay`).
- Restored: dev app uninstalled (its autostart value went with it), its config, log and WebView folders and credentials removed, no app processes, Notepad closed again with only the tabs its own session restored, clipboard never written, hotkey and microphone settings untouched; `crew-e2e` has no devices.

`desktop-ci` was not pushed (the om-reviewer pushes at publish time).
Its Windows steps ran locally on the mirror at this code: UI lint, typecheck and tests, `cargo fmt`, clippy on all targets and on release with `--features dev`, `cargo test`, and `pnpm tauri:build:dev` (installer 1.84 MiB).
The real-clipboard test and the Linux clippy job were not run locally: the first would overwrite Sebastian's clipboard outside a smoke run, and WSL has no Rust toolchain.
Root `pnpm lint`, `typecheck` and `test` pass, one package at a time.

Incident: Notepad restored Sebastian's earlier tabs when it started, and the first dictation's cleanup keys missed and left an Open dialog up.
I closed the dialog and my tab without saving through UI Automation, then let Notepad close with the tabs it had restored; his tabs were never edited.
The dictation script was changed to close only its own tab, and captures now cover only the document area.

Decisions the plan did not record: none.
Pending: docs, on the clean signal.

### Round 5

Done:

- Finding 1 applied: `windows::product_name` reads the configured product name, and the settings and account window titles, the notification title, the tray tooltip and the device name all use it; the first-run title and heading stay "Welcome to Take My Word".
  No unit test: Tauri's mock runtime is not enabled in this crate, and the titles were checked on Windows instead.
- Recaptured on Windows (announced, more than 2 minutes idle, watcher saw no physical input) from the rebuilt dev installer: the sign-in, choose-password, style picker, first-run and settings windows (signed in and out, for `crew-e2e` and a throwaway user) now read "Take My Word Dev".
  `crew-e2e`'s `SETTINGS` is back to `plain` and it has no devices; the throwaway user and its `SETTINGS` were deleted; the dev app is uninstalled and its data and credentials removed.
- Captures now come from `PrintWindow`, which renders only the target window even when another window covers it.
  The earlier screen-copy captures were deleted from the workspace and the Windows scratch folder: besides the slivers the om-reviewer saw, some showed the debug console, WhatsApp or a Google Cloud console page in front of the app's window.
  The Notepad captures cover only the document area and were clean; they are kept.
- `screenshots/windows/` in the workspace now holds 18 captures: the window captures above, plus the Notepad text and overlays of Acceptance 4 to 6 and the signed-out hold from round 4.
  The notification title has no capture: no smoke path raises a notification without a failing paste.

Pending: docs, on the clean signal.

### Round 6

Done:

- Finding 1 applied: `StoredSession::device_group_key` carries `expect(dead_code)` only for non-Windows, non-test builds, with its reason; the Windows keychain is still the only reader, as the auth client contract requires keeping the key next to the refresh token, and the `expect` fails as soon as phase 5 reads it.
- Linux clippy reproduced locally in an `ubuntu:24.04` Docker container with the `desktop-ci` apt packages and stable Rust, on a copy of `src-tauri` plus the built UI: red on `bf716e3` with exactly the reported error, green on this commit with `--all-targets --locked -- -D warnings`.
  The Windows mirror cannot check the Linux target (the GTK and WebKit `-sys` build scripts need the Linux libraries), so the container replaced it.
- Other `cfg(windows)` paths of the task checked by reading: the keychain's `unsupported` implementation uses every item of the trait, the second `auth::dev_pool` test is Windows-only with its own imports, and the shell, account and API code is the same on every platform.
