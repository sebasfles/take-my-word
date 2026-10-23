---
updated: 2026-10-23
source: 0015_user_context
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
- Amended by 0014_desktop_ux: while hands-free listens, and only then, the callback holds back Esc (its down and its up) from other apps and the key-events thread turns it into a cancel.
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
- Amended by 0014_desktop_ux: the stream also has a monitor mode that plays and meters without buffering, used only while the onboarding's microphone step is shown in a visible window, so Windows shows the microphone in use then; a hold during the check takes the stream over and the check resumes after; monitoring never buffers, so a check left open holds no audio, where reusing a recording would keep up to 120 s.
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

- Decision: the paste offers the text with delayed rendering, marked with `ExcludeClipboardContentFromMonitorProcessing`, `CanIncludeInClipboardHistory` 0 and `CanUploadToCloudClipboard` 0, after saving every memory-based format; it pastes only into the window focused at key down, after every modifier is up and when the target is not elevated; nothing renders before the paste keystroke, which waits until readers reacting to the offer are answered (40 to 100 ms); the clipboard is restored once readers go quiet (150 ms after the last render request, at most 1 s), a busy clipboard is retried for 3 s, and the text stays with a notification when no read counts within 1.5 s.
- Alternatives rejected: a fixed wait before restoring.
- Reason: delayed rendering tells when the target actually read the text, and the missing read doubles as the paste-failure signal; Chromium drops a paste whose clipboard changes before it finishes, so the restore waits for quiet instead of a fixed delay (0012).
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
- Amended by 0014_desktop_ux: met the other way, Sebastian found on 0.2.0 that the hook does not see the shortcut in the app's own windows; every app window now forwards `KeyboardEvent.code` down and up to the same chord machine, an event seen by both sources within 250 ms counts once, page keys pause during a capture like hook keys, and while a chord is held the session checks every 100 ms that its keys still read held (`GetAsyncKeyState`) and releases it when they do not.
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
- Amended by 0014_desktop_ux: the gate also covers the hands-free state; the overlay is shown with `ShowWindow(SW_SHOWNOACTIVATE)` and hidden with `SW_HIDE` on its handle, because tao shows a window without activation only the first time, so every later `show()` took focus from the app being dictated into (a focus flicker since 0.2.0, and lost key-ups in the app's own window).
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
- Met by 0014_desktop_ux: hands-free records without a hold, and the guard spans it from the first press to the paste, so the rule holds unchanged.
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
- Alternatives rejected: counting any read after the keystroke, as before.
- Reason: on Windows a clipboard reader that ignores the exclusion format (WSLg's `msrdc.exe` there) read first, counted as the target, and the clipboard was restored before the target pasted, so a paste reported done landed nothing.
- Debt created: a reader that opens the clipboard without a window, or whose window reads as process 0, still gets the text and counts as the target, so such a monitor reading first can still end a paste early; a reused process id in the parent chain can admit an unrelated process.
- Resolved by: 0012_fix_lost_paste, 2026-10-22
- Revisit when: met on 2026-10-21: in 0011's Windows run `msrdc.exe` was withheld and then a process-0 reader got the text in 2 of 2 console-free `--dictate-wav` pastes, reported as pasted while nothing landed.
- Source: 0008_desktop_features
- Superseded by 2026-10-22: A read counts only when it is the target's proven first read after the keystroke

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

## 2026-10-22: Window sizes in one file, content-fitted where content varies

- Decision: `src/windows.json` holds the main window's first size and minimum (380x480), the update window's width and minimum height and the overlay's size, read by Rust and by the screenshot script; the main window opens maximized until the user changes it, then reopens at the last normal placement and maximized flag kept in `settings.json`, reused only while its title bar is on a screen; sign-in, onboarding and first run live in the main window, so the account and first-run windows are gone; the update window is still sized to its content.
- Alternatives rejected: a window-state plugin, which cannot tell a first launch from a saved state; one small window per step, which floated in empty space at 1920 and closed on its own.
- Reason: Sebastian works maximized, and a screenshot can never show a size the app does not use.
- Debt created: none.
- Revisit when: a window needs a size that depends on the display.
- Source: 0011_desktop_rebrand, rewritten by 0014_desktop_ux

## 2026-10-22: The tray paints its state on the main thread from live state

- Decision: the tray icon and tooltip show idle, recording or attention from `tray::status`, read from the live account flag, the live microphone status and a listening flag; every caller only stores state and queues a job with `run_on_main_thread`, which picks the frame for the display scale (16, 20, 24 or 32 px) and paints it.
- Alternatives rejected: painting from the caller's thread, which waits on the main thread inside a hold and can deadlock with a main-thread command.
- Reason: a hold never waits on the tray, and no state change between startup and the first paint is lost.
- Debt created: the `image` crate joins the binary to decode the PNG frames.
- Revisit when: release binary size matters.
- Source: 0011_desktop_rebrand

## 2026-10-22: Desktop icons are generated by the brand into the app

- Decision: `pnpm desktop-assets` in `packages/brand` writes the prd and dev app icons, installer icons and tray frames into `apps/desktop/src-tauri/icons` and `icons/dev`, where Tauri expects them; the dev set carries a light-blue corner.
- Alternatives rejected: Tauri config and Rust paths reaching into `packages/brand`.
- Reason: the brand stays the only source of the artwork while the app keeps Tauri's layout.
- Debt created: none.
- Revisit when: macOS joins and needs an `.icns`.
- Source: 0011_desktop_rebrand

## 2026-10-22: A read counts only when it is the target's proven first read after the keystroke

- Decision: a reader with a window is placed by its process; a reader without one counts only when Wait Chain Traversal finds a GUI thread of the target's process tree blocked sending this render request to the clipboard thread (probed in depth order from the target, main threads first, at most 200 ms, one process-wide session serialized behind a mutex and never closed); a failed, denied or spent probe is unproven and never counts.
  Only the first read after the keystroke can count, and only when its render succeeds; any other first reader contends the attempt, a contended attempt is retried once after a new settle and a recheck of modifiers, focus and elevation, and a failed render ends the paste with the text kept; after a counted read, later requests of the same paste are answered without rendering.
  The target's process tree and threads are taken on a helper thread at the offer and fixed before the first keystroke.
- Alternatives rejected: counting any read without a window after the keystroke, which still lets a monitor that reads first win; never counting reads without a window, which loses WebView2 and Chromium pastes; asynchronous Wait Chain Traversal (70 threads in 3049 ms against 806 ms); probing every thread of the system (about 7 ms per thread).
- Reason: on the base build a dictation app reading after every Ctrl+V without a window (Wispr Flow on Sebastian's machine) took the text first in 4 of 5 pastes, the paste was reported done and the restore removed the text; with this rule 10 of 10 landed with that app and a test reader racing it; one session per thread crashed the process in 32 of 200 test runs when two sessions closed at once.
- Debt created: the retry can paste twice if the target keeps retrying to open the clipboard for longer than the settle after a contention; a thread or process the target creates after the offer is never proven, so its read leaves the text with a notification; a monitor that wins the race on both attempts leaves the text with a notification; proving a Chromium read costs about 65 to 190 ms.
- Revisit when: a paste lands twice, a target's read is reported unproven in the log, or the share of pastes left in the clipboard grows on machines with such a monitor.
- Source: 0012_fix_lost_paste
- Superseded by 2026-10-23: Threads that ran since the keystroke are probed first

## 2026-10-23: Threads that ran since the keystroke are probed first

- Decision: the proof of a read without a window stays the 2026-10-22 one (a wait chain shows a thread of the target's process tree blocked sending this render request to the clipboard thread; only the first read after the keystroke counts; one retry), with a new order: each attempt reads the cycle time of every target thread at its keystroke, and a read without a window probes first the threads whose cycle time grew since then, in the old order (depth from the target, main threads first), then the rest, under the same 200 ms budget.
  The snapshot taken at an offer keeps a query handle per target thread, and the handles live until the next offer replaces the snapshot; a thread that ran gets its wait chain looked at sooner and is not trusted more.
- Alternatives rejected: a larger budget (Windows Terminal hosts about 110 threads, 44 to 46 of them GUI, at about 12 ms per wait chain); a fresh thread snapshot inside the render request (about 40 ms); recognizing terminals by executable name (no reader rule may depend on one).
- Reason: Windows Terminal reads without a window from one of its own GUI threads, 25th to 28th in the old order, so the budget ran out after 15 to 19 threads and every paste into it stayed in the clipboard (24 of 24 on the base build); with this order 48 of 48 of its reads were proven after 3 or 4 threads in 31 to 81 ms, and reading the cycle times costs 10 to 165 us.
- Debt created: the 2026-10-22 entry's debt stands: the retry can paste twice, a thread or process created after the offer is never proven, and a monitor that wins both attempts leaves the text with a notification; one that opens the clipboard on every Ctrl+V, faster than the target, wins every time (6 of 6 left in the clipboard in a text box, and the monitor never got the text).
- Revisit when: a paste lands twice, a target's read is reported unproven in the log, or the share of pastes left in the clipboard grows on machines with such a monitor.
- Source: 0013_fix_terminal_paste

## 2026-10-23: The clipboard thread answers render requests while it waits to open the clipboard

- Decision: between `OpenClipboard` retries (offer, restore, keep, put, and the History copy owner), the clipboard thread waits on its sent-message queue and answers what arrives instead of sleeping.
- Alternatives rejected: a longer patience, which only stretches the stall.
- Reason: a reader that already holds the clipboard open and asks for the text waits on the clipboard thread, which was asleep until that reader let go, so the restore gave up after 3 s and the app said the clipboard was lost; a test that holds the clipboard open through a restore fails on the old loop after 3.25 s and passes in 0.36 s.
- Debt created: none.
- Revisit when: a restore or an offer fails with the clipboard busy in the log.
- Source: 0013_fix_terminal_paste

## 2026-10-23: Multi-line text goes to Windows Terminal as dictated

- Decision: the paste never joins lines and never adds a line break or Enter; in Windows Terminal the lines arrive as one block where the shell supports bracketed paste (bash, tmux, Claude Code), and in a Windows PowerShell 5.1 tab the terminal shows its own multi-line warning first.
- Alternatives rejected: joining lines for every Windows Terminal paste, which would break the one-block paste in bash, tmux and Claude Code, since the app cannot tell the tabs apart and no rule may depend on an executable name; a per-app rule option.
- Reason: Windows PowerShell 5.1 ships PSReadLine 2.0.0 without bracketed paste, so a line break in a paste is an Enter there; that is the terminal's behavior, and its warning is the guard.
- Debt created: confirming the warning in a Windows PowerShell 5.1 tab runs every line but the last.
- Revisit when: Windows PowerShell ships a PSReadLine with bracketed paste, or users ask for joined lines.
- Source: 0013_fix_terminal_paste

## 2026-10-23: Config tests remove their scratch folders

- Decision: the config tests' scratch path is a guard that deletes its folder on drop, also when a test fails.
- Alternatives rejected: a new dependency for temporary folders.
- Reason: every test run left a `tmw-config-<name>-<pid>` folder in the temp directory.
- Debt created: the folders earlier runs left stay on Sebastian's machine (6964 in `%TEMP%` on 2026-10-23); removing them is his call.
- Revisit when: Sebastian clears them.
- Source: 0013_fix_terminal_paste

## 2026-10-23: Animations run in the desktop WebView whatever the Windows setting

- Decision: every WebView window is created with `--force-prefers-no-reduced-motion` in one shared browser argument string, so the spinner, waveform and transitions run with Windows "Animation effects" off; `packages/brand` and the web keep honoring reduced motion.
- Alternatives rejected: per-rule CSS overrides that restore each animation, which duplicate the brand's keyframes; a slow essential-motion spinner only.
- Reason: Sebastian's machine has animations off, WebView2 then reported reduced motion and the processing spinner froze, which read as a hang; Sebastian chose motion everywhere in the desktop app.
- Debt created: users who need reduced motion get the desktop animations anyway.
- Revisit when: a user asks for reduced motion in the desktop app.
- Source: 0014_desktop_ux

## 2026-10-23: Dictations into the app's own main window are inserted by the page

- Decision: when the window focused at the first press is the app's main window, Rust sends the text to the page with an id instead of pasting; the page inserts it at the caret of a focused textarea or caret-capable input and answers `insert_ack`; only an inserted ack counts as pasted, and a refusal or no answer within 1 s keeps the text in the clipboard through the History copy owner with the "not pasted" notice.
- Alternatives rejected: raising the Wait Chain Traversal budget for the app's own WebView2 process, which slows every paste and stays a race; trusting the app's own processes as readers, which hands the text to any of them on a contended clipboard.
- Reason: the clipboard paste could not prove the WebView2 reader within 200 ms (15 to 17 GUI threads), so both attempts were withheld and the practice box stayed empty.
- Debt created: a page that inserts after the 1 s timeout leaves the text in the field and in the clipboard with the notice.
- Revisit when: a dictation shows up twice in the app's own window.
- Source: 0014_desktop_ux

## 2026-10-23: A user launch opens the main window and autostart stays in the tray

- Decision: autostart passes `--autostart` and stays in the tray unless sign-in or setup is needed; any other launch, cold or a second instance, opens the main window and brings it to the front through the single-instance callback, whose launcher grants the foreground; the 0.2.0 Run entry without the argument is rewritten at start when autostart is on.
- Alternatives rejected: opening nothing on a user launch, which left the app invisible in the tray.
- Reason: launching the app from Start must show it.
- Debt created: none.
- Revisit when: Windows refuses the foreground to a second launch.
- Source: 0014_desktop_ux

## 2026-10-23: The onboarding example quotes one measured refiner fix per language

- Decision: the context step shows a fixed before and after pair per language, copied verbatim from 0015's round 2 evaluation (en `dev-en-1`, "C slash CD" to "CI/CD"; es `bio-es-2`, "P-Zebra" to "pez cebra"), so the Spanish label names biology; Skip restores the context loaded at the step, and the context is saved with languages and style.
- Alternatives rejected: an invented pair; generating the example live.
- Reason: the evaluation showed no overall gain, so only an observed fix may be shown; a live call would cost a dictation per onboarding.
- Debt created: the pairs are single runs (the English fix held in 6 of 6 runs with context, the Spanish one in 1 of 6) and do not follow prompt or model changes.
- Revisit when: the refiner prompt or model changes, or the context's direction changes after 0015.
- Source: 0015_user_context
