---
updated: 2026-10-22
source: 0010_brand_web
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
- Resolved by: 0007_desktop_integration, 2026-10-21
- Revisit when: 0007 adds the contract test fed by JSON Schema from `packages/shared`.
- Source: 0002_desktop_shell

## 2026-10-21: Paste through a delayed-rendered clipboard

- Decision: the paste offers the text with delayed rendering, marked with `ExcludeClipboardContentFromMonitorProcessing`, `CanIncludeInClipboardHistory` 0 and `CanUploadToCloudClipboard` 0, after saving every memory-based format; it pastes only into the window focused at key down, after every modifier is up and when the target is not elevated, restores 150 ms after the target reads (500 ms if something read before the keystroke), retries a busy clipboard for 3 s, and leaves the text with a notification when nothing reads it within 1.5 s.
- Alternatives rejected: a fixed wait before restoring.
- Reason: delayed rendering tells when the target actually read the text, and the missing read doubles as the paste-failure signal.
- Debt created: any reader after the keystroke counts as the target, and a clipboard monitor that ignores the exclusion format still sees the text.
- Resolved by: 0008_desktop_features, 2026-10-21
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
- Resolved by: 0007_desktop_integration, 2026-10-21
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

## 2026-10-21: SRP and the Cognito calls in Rust

- Decision: the shell signs in with its own SRP port of `packages/cognito/src/srp.ts` and makes the six Cognito calls as unsigned JSON requests over reqwest, with no AWS SDK and no Node sidecar.
- Alternatives rejected: the shared Node package in a sidecar.
- Reason: a sidecar adds a Node runtime of tens of MB to a binary of about 10 MB and moves tokens between processes; fixed vectors from `packages/cognito` and a real dev sign-in prove the port.
- Debt created: two SRP implementations to keep equal.
- Revisit when: Cognito changes the SRP variant, or a third client needs SRP.
- Source: 0007_desktop_integration

## 2026-10-21: Dev and prd are separate apps chosen at build time

- Decision: `tauri.dev.conf.json` and `tauri.prd.conf.json` give each environment its product name, identifier and a Cargo feature that selects API URL and pool ids; the identifier also names the keychain service, config folder and autostart entry; a release without an environment fails to compile, and the app refuses an identifier that does not match its environment.
- Alternatives rejected: an endpoint field at run time, which would be dead UI.
- Reason: Sebastian runs both side by side, so they must never share a session, settings or a window title.
- Debt created: none.
- Revisit when: a third environment appears.
- Source: 0007_desktop_integration

## 2026-10-21: Tokens never reach the WebView

- Decision: Cognito, `POST /dictations`, `GET /styles` and `GET`/`PUT /me/settings` all run in Rust; the UI gets only what it renders through commands, the new-password challenge stays in Rust, and CSP stays `default-src 'self'`.
- Alternatives rejected: calling Cognito or the API from React with the zod types.
- Reason: a script in the WebView can never read a token or the challenge, and the hotkey path works with no window open; this extends the Rust-mirror exception to styles and settings.
- Debt created: none.
- Revisit when: the settings window gains editors (0008) that would need many more mirrored contracts.
- Source: 0007_desktop_integration
- Superseded by 2026-10-21: The editors reach the API through one closed route forwarder (the mirror per route only)

## 2026-10-21: The session lives in Credential Manager through keyring-core

- Decision: refresh token, `DeviceKey` and `DeviceGroupKey` go to Windows Credential Manager through `keyring-core` and `windows-native-keyring-store`, as raw UTF-8 bytes, persisted per machine; the access token stays in memory.
- Alternatives rejected: an encrypted file, weaker than the OS store; the `keyring` crate, a CLI since v4 whose v3 silently falls back to a mock store without a platform feature; splitting tokens over several entries.
- Reason: the store is built explicitly, so there is no silent mock; the measured refresh token is 1932 bytes, under the 2560-byte blob as UTF-8 but not as UTF-16; device-bound tokens must not roam with a domain profile.
- Debt created: macOS and Linux have no keychain yet; if a rotated refresh token cannot be written, it lives only in memory and the next start reuses the old one and is signed out.
- Revisit when: phase 5 builds macOS and Linux, or a user is signed out after a keychain error in the log.
- Source: 0007_desktop_integration

## 2026-10-21: One lock for the session, and only transient failures keep it

- Decision: every token read goes through one mutex that renews with under 5 minutes left and stores the rotated token at once; the hotkey reads an atomic flag and starts a background renewal; network, unexpected answers, 5xx, `InternalErrorException` and `TooManyRequestsException` keep the session, every other Cognito rejection ends it; a gateway 401 or 403 without the error envelope renews once and retries once.
- Alternatives rejected: ending the session only on `NotAuthorizedException` and reuse, which would keep a session Cognito answers with any other rejection; renewing on each caller.
- Reason: Cognito keeps only the last rotation, so concurrent renewals lose the session; in dev a forgotten device and a deleted user both answer `NotAuthorizedException`, and a dead session must return to sign-in instead of failing every dictation.
- Debt created: none.
- Revisit when: Cognito adds a transient error kind the client should ride out.
- Source: 0007_desktop_integration

## 2026-10-21: The API stub is debug-only and off by default

- Decision: the stub compiles only into debug builds, its modes replace only `POST /dictations`, and its default mode is off, so debug builds dictate against the real dev API; sign-in is always real.
- Alternatives rejected: keeping the stub in every build.
- Reason: release builds carry no fake server and no stub menu.
- Debt created: axum and tokio still compile in release builds, unlinked, because Cargo cannot scope a dependency to a profile.
- Revisit when: release build time matters.
- Source: 0007_desktop_integration

## 2026-10-21: The Rust mirror is checked against JSON Schema from packages/shared

- Decision: `apps/desktop/contract` writes `z.toJSONSchema` of every mirrored contract to a committed file that vitest keeps current in `ci`, and a Rust test compares it with `schemars` schemas of the serde types: field names, required flags, enum values, arrays and primitive kinds.
- Alternatives rejected: generating the Rust types from the schema.
- Reason: hand-written types stay readable, and any field, enum value or required flag added, removed or renamed on either side fails; the test was red on the old mirror before the fix.
- Debt created: string patterns, lengths and integer bounds are not compared.
- Revisit when: a client bug comes from a constraint the shapes do not carry.
- Source: 0007_desktop_integration


## 2026-10-21: The updater runs in Rust over native TLS

- Decision: `tauri-plugin-updater` is built with `native-tls` (SChannel) instead of its default `rustls-tls`; the check, the offer, the download and the install run in Rust, and the update window only renders a view and answers through three commands.
- Alternatives rejected: the plugin's default `rustls-tls`; giving the WebView the updater permission.
- Reason: `rustls-tls` switches the shared `reqwest` to `rustls-no-provider`, which made every other client panic when built, so release builds would have crashed at start; native TLS also keeps rustls and ring out of the binary, and the WebView stays without updater rights.
- Debt created: none.
- Revisit when: macOS and Linux builds need a TLS stack of their own.
- Source: 0005_desktop_release

## 2026-10-21: Updates wait for no dictation in flight and never take focus

- Decision: each hold carries a guard from key down until the worker has pasted or dropped its job; the update window opens only when no guard is alive, without focus, and the install waits for the same after the download.
- Alternatives rejected: gating on the overlay's recording flag, which ends at key up while the paste is still pending.
- Reason: an update window that takes focus, or an install that quits the app, between key up and the paste would send the text to the wrong window or lose it; on Windows the dialog appeared with the user's window still in the foreground.
- Debt created: none.
- Revisit when: dictations can run without a hold, such as a toggle mode.
- Source: 0005_desktop_release

## 2026-10-21: Releases are verified against the committed key before they are published

- Decision: `desktop-release` creates the draft release through the API with no target commit and hands its id to `tauri-action`; before publishing, it downloads `latest.json` and every installer it names, checks they are assets of that draft, verifies the minisign signature with the public key in `tauri.prd.conf.json` and the version signed into its trusted comment, and requires the fixed-name copy to match; the updater also requires the signed version.
- Alternatives rejected: letting `tauri-action` create the release; trusting `latest.json` as built.
- Reason: `tauri-action` creates the release pointed at the tagged commit, and a commit whose workflows differ from the default branch needs a `workflows` permission that `GITHUB_TOKEN` cannot hold, so it failed with 403; a release that would brick the updater or ship an unsigned installer never reaches "latest".
- Debt created: `latest.json` points to `api.github.com` asset URLs, which anonymous clients may fetch 60 times per hour per IP.
- Revisit when: an update download fails with a rate-limit error, or users share one public IP.
- Source: 0005_desktop_release

## 2026-10-21: Installers ship without a code-signing certificate

- Decision: the NSIS installer and the app are signed only for the updater (minisign); Windows code signing is out of v1.
- Alternatives rejected: buying a code-signing certificate now.
- Reason: the users are an invited circle who can pass the warning once; the updater's own signature already protects every later version.
- Debt created: Windows SmartScreen warns on the first install.
- Revisit when: the app is offered beyond the invited circle, or SmartScreen blocks installs.
- Source: 0005_desktop_release

## 2026-10-21: The editors reach the API through one closed route forwarder

- Decision: one command forwards a closed enum of named routes (dictionary, styles, app rules, settings, history; never `POST /dictations`) with ids and the history cursor as parameters percent-encoded by Rust, attaches the token, renews once like every call, and answers the JSON body or `{kind, status, code}` with no text; the views validate requests and responses with the `packages/shared` schemas, and Rust mirrors only what it reads itself (dictation, error, settings, style list, app rule list), all in the contract test.
- Alternatives rejected: a mirrored command per route, which would copy most of the API surface into Rust.
- Reason: the token stays in Rust and no path or URL comes from the WebView, while each contract lives in one place.
- Debt created: a new CRUD route needs a variant in the enum before the views can use it.
- Revisit when: the editors need a route the enum lacks, or a second client process needs the API.
- Source: 0008_desktop_features

## 2026-10-21: Spanish and English through two shared dictionaries

- Decision: `src/i18n/es.json` and `en.json`, keyed by message id, serve the views and are embedded in Rust for the tray, notifications and window titles; Rust sends ids across IPC, never text; the language is Windows' when it is Spanish or English, else English, unless `settings.json` holds a choice; a change saves, switches Rust's language, relabels the tray, retitles open windows and tells every view, which re-renders in place; new windows get it in their URL.
- Alternatives rejected: an i18n framework; English text from Rust translated in the views; reloading windows on a switch.
- Reason: two small files tested for matching keys on both sides keep every string in one place, and an id cannot leak English into a Spanish view.
- Debt created: none.
- Revisit when: a third language arrives, or plural rules outgrow one variant per count.
- Source: 0008_desktop_features

## 2026-10-21: App rules cached in memory for the paste keystroke

- Decision: Rust keeps the user's rules in memory, loaded at startup and sign-in, reloaded after every rule change made through the forwarder, refreshed in the background at hotkey down when older than 5 minutes (one refresh at a time, never awaited), and cleared on sign-out; each load is numbered and applies only if it started after the rules already applied and after the last sign-out; the paste uses the target's rule keystroke, Ctrl+V otherwise, and `cmd+v` reads as Ctrl+V on Windows.
- Alternatives rejected: sending the keystroke in `POST /dictations`, an API change.
- Reason: the hotkey never waits on the network, and an older load can never undo a newer edit or bring back a signed-out user's rules.
- Debt created: a rule edited on the web or another machine reaches this one's paste up to 5 minutes later.
- Revisit when: a paste uses a stale keystroke after an edit elsewhere.
- Source: 0008_desktop_features

## 2026-10-21: The overlay's level comes from an atomic set in the capture callback

- Decision: the cpal callback meters RMS over 50 ms into one atomic, and an emitter thread that lives only while Listening sends the latest value to the overlay every 50 ms, dropping rather than queueing; the overlay draws nine bars from the last values, flat on silence.
- Alternatives rejected: streaming samples to the WebView.
- Reason: no lock or allocation is added to the audio path, and nothing runs while idle; idle RAM and CPU stayed at the base build's.
- Debt created: none.
- Revisit when: the overlay lags the voice on a slow machine.
- Source: 0008_desktop_features

## 2026-10-21: The paste gives the text only to the target's processes

- Decision: the offer carries the target window's process and a hosted app's, and the clipboard window renders the text only when the reader that opened the clipboard is one of them or descends from one (a walk up the parent chain); others get nothing and do not count as the paste; each read is logged with the reader's executable, never the text.
  WebView2 opens the clipboard without a window, so its paste is served by the rule for unidentifiable readers below, not by the process tree; the tree is covered by unit tests, for hosts that read from a child process that has a window.
- Alternatives rejected: counting any read after the keystroke, as before.
- Reason: on Windows a clipboard reader that ignores the exclusion format (WSLg's `msrdc.exe` there) read first, counted as the target, and the clipboard was restored before the target pasted, so a paste reported done landed nothing.
- Debt created: a reader that opens the clipboard without a window, or whose window reads as process 0, still gets the text and counts as the target, so such a monitor reading first can still end a paste early; a reused process id in the parent chain can admit an unrelated process.
- Revisit when: a paste reported as done does not land again, or a target app's reads are withheld.
- Source: 0008_desktop_features

## 2026-10-21: History copy uses its own clipboard owner

- Decision: Copy in History goes through Rust to a second clipboard window, created on the first copy, that puts the text with the paste's exclusion flags and restores nothing; the window class is registered once for both owners.
- Alternatives rejected: the paste worker's clipboard, which a copy would wait behind and whose restore it could disturb.
- Reason: the copied text stays out of clipboard history and the cloud clipboard like a dictation, without touching a paste in flight.
- Debt created: none.
- Revisit when: a copy fails while a paste is in flight.
- Source: 0008_desktop_features

## 2026-10-22: The landing reads the desktop version from the release manifest

- Decision: the web reads `version` from the latest release's `latest.json`, parsed with `desktopReleaseManifestSchema` in `packages/shared`, cached 15 minutes with a 2.5 s timeout and streamed in a Suspense boundary; without it the download button shows no version.
- Alternatives rejected: a version constant in the web, which goes stale on every release; the GitHub API, rate limited without a token.
- Reason: the manifest the updater already trusts is the single source of the current version, and the landing must never wait on GitHub.
- Debt created: none.
- Revisit when: the manifest format changes or macOS joins with its own platform entry.
- Source: 0010_brand_web

