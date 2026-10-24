---
id: "0020"
title: fix_overlay_after_reboot
type: bug
crew: pair
clearance: full
branch: bugfix/0020_fix_overlay_after_reboot
modules: [desktop]
repos: ["."]
phases: 0
depends_on: []
ticket:
created: 2026-10-24
updated: 2026-10-24
---

# 0020 Fix the overlay missing after a Windows restart

## Goal

After a Windows restart, the desktop app started at sign-in works end to end (hold to talk and hands-free paste clean text), but its overlay never appears: no waveform while listening, no spinner while cleaning, no error messages.
The user loses all feedback that a dictation is happening.
The overlay must show on every take whatever way the app started.

## Scope

- Reproduce on the Windows host as `replication.md` describes, before touching code; read the app log of the affected run first.
- Find why the overlay window, created hidden at startup (desktop `ard.md` 2026-10-21 "Overlay window kept warm and gated by the hold"), never shows when the app starts with `--autostart` at sign-in.
- Fix it so the overlay shows on the first take and every later one after a start at sign-in, a start by hand, and a display change while the app runs, without giving up the warm overlay's first-frame show.
- Regression tests for the rule that decides when the overlay is usable or must be recreated (unit), and a Windows smoke for the start path that reproduced the bug.
- Ship desktop 0.3.1 through `pnpm release:desktop` after the om-manager's release go, merging with a merge commit so the tag reaches `develop`.

## Out of scope

- Any change to the overlay's look, sizes or states.
- Segmented transcription (0019), which touches the dictation worker, not the overlay.
- Restarting Windows or signing out on the host from the crew.

## Acceptance

1. The bug is reproduced on the base build (0.3.0, or `develop`), or the PR shows the log evidence of the affected run and the start condition that matches it.
2. On the fixed build, after the reproducing start path, 5 of 5 takes show the overlay listening and processing, hold to talk and hands-free both.
3. A start by hand still shows the overlay within the hold's first frames, as before.
4. Idle RAM and CPU of the desktop app do not rise.
5. Desktop 0.3.1 is released, the 0.3.0 to 0.3.1 update is verified on the host, and the prd landing serves 0.3.1.

## Approach

- Module and layers touched: desktop overlay window lifecycle (`apps/desktop/src-tauri/src/windows.rs` and its callers); no API or contract change.
- Entities, endpoints, tables: none.
- Decisions:
  - Keep the warm overlay and repair or recreate it when it is not usable, chosen over creating it on key down, which `ard.md` rejected for first-frame latency.

## Database

None.

## Infra

None; the release uses the existing `pnpm release:desktop` path.

## Design

None.

## Replication

See `replication.md`.

## Risks

- A restart cannot be run by the crew; the reproducing condition must be found through an equivalent start (before the shell, WebView2 or the display is ready), or the log of the affected run.
- 0019 will also ship a desktop release later; 0.3.1 must not carry 0019 code.

## Depends on

None.

## Context & decisions

Consolidated 2026-10-24 by the om-reviewer with the om-manager.

- Evidence (om-reviewer, read-only): the affected run is prd 0.3.0, pid 21460, started 02:47:22, 58 s after boot (02:46:24).
  Its log starts at 07:47:23Z with the updater, Cognito and rules calls failing (no network yet) and no overlay line, since the code logs none.
  Its overlay window exists at 600x120 physical (480x96 at 125%), centred above the bottom of DISPLAY1, and its WebView2 renderer and GPU process have run since 02:47:23 without a crash: the cause is in showing the window or in its content, not in a missing or misplaced window.
- Log copy (om-manager): `.workspaces/0020_fix_overlay_after_reboot/evidence/take-my-word-0.3.0-autostart.log`, untracked; never copied into the task folder (public repo); the PR quotes only the lines it needs.
- Live instance (Sebastian through the om-manager): pid 21460 stays running until `replication.md` records its inspection; the om-developer tells me, I tell the om-manager to release it.
- Live probing (om-manager): up to 4 near-silent takes (hold and hands-free) on pid 21460 and one secondary-display scale change from 100 to 125 % and back, under the terminal smoke's idle guard (5 idle minutes, real-input check before every step); the scale is restored even on abort; hold if Sebastian says he is using the computer.
- Replication correction (om-reviewer): the crew cannot restart Windows; its runs use an equivalent start on `develop` with a dev release build signed in as `crew-e2e-b` (`--autostart` by hand with no main window, or a start before WebView2 or the display is ready); the inspection of pid 21460 goes in `om-developer confirmation`.
- Acceptance 2, adjusted (om-manager): judged on the overlay's painted pixels, never on window state, 5 of 5 per mode on the equivalent start that reproduces on `develop`; if none reproduces, the cause proven on pid 21460 plus the regression tests, and Sebastian's next restart with 0.3.1 closes the real path later.
- Acceptance 3 and 4 (om-reviewer): 0014's method on dev release builds of the `develop` head and the final commit, same session: private working set of app plus WebView2 after opening and closing the main window, CPU seconds over 5 idle minutes; pass at RAM ≤ base + 10 MB and CPU ≤ base + 1.0 s; key down to first painted overlay frame on a start by hand, fixed ≤ base + 16 ms.
- Acceptance 5 (om-manager): the crew never launches a prd build; the 0.3.0 to 0.3.1 update is Sebastian's install taking the offer, checked from his log, `latest.json` and the landing.
- Scope (om-reviewer): the fix goes where the cause is; `windows.rs`, `overlay.rs`, `src/views/Overlay.tsx` and `src/bridge.ts` are in scope (`keepListening` silently drops a rejected `listen()`, which would leave the page deaf for the process's life).
  The overlay lifecycle logs creation, recreation, a show without a ready page and WebView2 process failures; never text.
- Release (om-manager): no human PR review; after a clean review and docs I publish and send "PR ready, awaiting release go"; on the go the om-developer runs `pnpm release:desktop 0.3.1` on the task branch as a round, I audit it and rewrite the description, the om-manager merges with a merge commit.
  No rebase after the tag; later findings land as new commits and `develop` comes in by merge; every `apps/desktop` merge into `develop` is held until `desktop-v0.3.1` is pushed, so 0.3.1 carries no 0019 code.

Constraints:
- `docs/modules/desktop/ard.md` 2026-10-21 "Overlay window kept warm and gated by the hold" and its 0014 amendment: warm window, `MemoryUsageTargetLevel` Low while hidden, shown with `SW_SHOWNOACTIVATE` and hidden with `SW_HIDE` on its handle (never tao `show()`), the hold gate intact.
- `docs/modules/desktop/ard.md` 2026-10-22 "The tray paints its state on the main thread": a hold never waits on the main thread; any recreation is queued there, never awaited from the hook or session thread.
- `docs/modules/desktop/ard.md` 2026-10-23 "A user launch opens the main window and autostart stays in the tray" stays as is.
- `docs/modules/desktop/trd.md` Releases: tags never rewritten; `Cargo.toml`, `package.json` and `Cargo.lock` versions equal; `rust:*` runs from WSL through `scripts/windows.sh`, cargo with `--test-threads=1`.

Decided 2026-10-24 before round 1 (om-reviewer, on the om-developer's questions):
- pid 21460 inspected and recorded in `replication.md`; released to the om-manager.
- Scope, added: the title bar a start by hand leaves around the overlay (no frame recalculation after creation, since the overlay is shown with `ShowWindow`) is fixed in this task, with a pixel check in the smoke that the overlay shows no frame; it is a lifecycle defect of the same window, not a change of its look.
- Probing, added: on dev instances only (never pid 21460 or a prd build), under the same idle guard, more secondary-display scale changes, each restored even on abort, and at most 2 display power off and on cycles while the dev overlay is hidden; stop at the first real input.

Review focus beyond the Pipeline: the "usable or recreate" rule is a pure function whose unit tests fail on the base code; recreation keeps the overlay non-focusable, never steals focus and never holds the gate lock while building; the Windows smoke checks pixels; no 0019 code in the diff; the release round changes only the version.

clearance: full: the Windows host under the idle guard; pid 21460 read-only plus the 4 takes and the one scale change; dev release builds as `crew-e2e-b`; GitHub push, PR, `desktop-ci`, and `desktop-release` for 0.3.1 after the om-manager's go; no prd build launched, no AWS, no Terraform, no restart or sign-out.

## om-developer notes

### Round 1

Did:
- Inspected pid 21460 (see `replication.md`): the overlay is shown and its page receives every state, but the WebView2 paints no frame; a display change and a foreground change do not repair it.
- Looked for an equivalent start on `develop` with dev release builds as `crew-e2e-b`, none reproduced: `--autostart` by hand, a display power cycle with the overlay hidden, a start with the displays off, a DPI round trip across monitors, 25 minutes hidden at the Low memory target, a cold WebView2 profile under CPU load.
  So the fallback of Context & decisions applies: the cause is the 21460 evidence, the trigger at sign-in stays unknown, and Sebastian's next restart on 0.3.1 closes the real path.
- Repair: each shown state carries a `seq`; the page confirms it from a second animation frame (`overlay_painted`), which only runs when the WebView2 produces frames, and reports `overlay_ready` once it listens, retrying until the shell answers.
  `overlay_health.rs` holds the pure rule: a state shown and unconfirmed for 1 s, a page not ready 20 s after creation, or a failed WebView2 browser, renderer or GPU process recreates the overlay; after 3 recreations without a frame it stops and logs.
  Recreation is queued with `run_on_main_thread`, never built under the gate lock: the old window is destroyed and the new one built on its `Destroyed` event with the same label, hidden, non-focusable and at Low; when its page is ready the current state is shown again, so a take in progress gets its overlay back.
  The lifecycle logs creation, recreation with its reason, a show before the page is ready and every WebView2 process failure; never text.
- `keepListening` retries a refused `listen()` every 500 ms instead of dropping it.
- Title bar: `create_overlay` refreshes the frame once with `SWP_FRAMECHANGED | SWP_NOACTIVATE` after building, because raw `ShowWindow` never runs tao's frame refresh; the overlay is frameless on every start (client 600x120).
- Smoke: `scripts/overlay-smoke.sh` with `overlay-frame` and `overlay-take` in `terminal-smoke.ps1`; it starts by hand and with `--autostart`, checks the frameless non-activating window, and per take the painted pill (accent pixels) in listening and processing, no title bar band and the focus kept; debug builds take `--overlay-no-frames`, which hides the overlay's WebView2 controller with the window shown (no frames, page still updating, as on 21460) and must be repaired within the hold.

Evidence (workspace `evidence/probe`, untracked):
- Smoke on a debug build of this round: 14 of 14 pass, 5 takes per start path plus the no-frames take on each, recreated about 1.1 s into the hold and painted again by 2.5 s; the first run's failures were the smoke's own timing (a 150 ms processing shot after a 170 ms "no text", a double tap past 300 ms), fixed by peak sampling.
- Acceptance 3, key down to first painted pill (accent pixels below the top third), dev release builds by hand, same session: base medians 47 and 42 ms, fixed 48 ms.
  A first run counted the base build's title-bar icon as painted and read base 72 ms against fixed 101 ms; that measured the title bar, not the pill.
- Acceptance 4, private working set of app plus WebView2 after opening and closing the main window, and CPU over 5 idle minutes: base 27.2 and 26.2 MB, 0.19 and 0.38 s; fixed 25.6 MB, 0.39 s.
- The release build measured was built from this round's tree before `cargo fmt`; the smoke's debug build predates the page's ready retry and the formatting.

Decisions the plan did not record:
- Paint detection by the page's animation frame confirmation, not by reading pixels in Rust: it costs nothing while hidden and fails exactly when the WebView2 stops producing frames.
- Deadlines: 1 s for a frame, 20 s for a ready page, 3 recreations without a frame before giving up.
- A GPU process exit also recreates the overlay.
- The recreated window keeps the label `overlay` (the capability lists exact labels), so it is built only after the old one's `Destroyed`.
- The smoke extends `terminal-smoke.ps1` instead of a second helper, and the no-frames fault is a debug-only argument like `--stub-mode`.

Pending:
- Acceptance 2 on the real sign-in path closes with Sebastian's next restart on 0.3.1; acceptance 5 is the release round.

Deferred:
- The first show after the overlay moves to a monitor with another scale lands off-centre (720,894 instead of 660,870 on 125 %) because `place_above_taskbar` uses the size from before the DPI change.
- `place_above_taskbar` and `set_shown` run window getters from the session thread inside the gate lock during `begin_recording`; they wait on the main thread during a hold (pre-existing).
- A dev release build's first run writes the `Take My Word Dev` Run entry (`refresh_autostart` with `firstRunDone` false); I removed the one my probe build wrote.
- The shell's default Node is 22 while `.nvmrc` pins 24; `release.test.ts` fails on 22.

### Round 2

Did, finding by finding:
1. `place_above_taskbar` now centres with `above_taskbar(work_area, scale)`, which takes the size from `SIZES.overlay` times the target monitor's scale, and then sets that size too, so a size left from an earlier scale never survives (the first fix without `set_size` still showed 480x96 at 125 % and 384x77 back at 100 % in the smoke).
   Unit test `the_overlay_is_centred_above_the_taskbar_at_the_scale_of_the_monitor_it_goes_to`; the smoke's `--displays` holds on the secondary display, after raising its scale a step and back on the first display, the scale always restored.
2. "painted" counts only accent pixels the hidden baseline lacks at the same coordinates, and the take reports the baseline's own accent; every take also checks the overlay is centred and sized for the monitor it shows on.
3. `overlay-smoke.sh` exits 1 when `results.tsv` holds a FAIL; cleanup still runs.
4. Evidence below is on the commit that closes these findings.

Also changed, found while closing them:
- A show that lasted 400 ms or more and ended without a confirmed frame now counts as missed and recreates the overlay when it hides; before, hiding cleared it, so a near-silent take under 1 s was never judged.
- The smoke stops the app's whole process tree and waits for its WebView2 to exit before the next start.
  The round 2 run that skipped this (`smoke-r2`) failed autostart takes 1 to 3: that instance shared the browser process the previous, faulted instance left behind; the same builds started cleanly painted every take (`exp-*`).
- Windows moves the cursor to the primary display when a display's scale changes, so the smoke puts it back before the take at the new scale.

Evidence (workspace `evidence/probe`):
- `smoke-a14046a`: debug build of the app at b8f6b5c (a14046a only adds the cursor line to the smoke), `--starts hand,autostart --takes 5 --no-frames --displays`: 17 of 17 pass, exit 0, recreated at the no-frames take of each start and painted again within its hold.
- `smoke-base-1a77433`: the same smoke on the `develop` release build fails, exit 1: framed after start, and its first take off-centre on the 100 % display (2580,888 for 2640,912).
- `measure-1052`, Acceptance 3 and 4 on dev release builds of `develop` (1a77433) and b8f6b5c, same session: first painted pill (accent pixels below the top third the baseline lacks) median 35 ms and 38 ms; private working set 27.1 MB and 24.8 MB; CPU over 5 idle minutes 0.31 s and 0.58 s.

Decisions the plan did not record:
- Missed show at 400 ms: a healthy overlay confirms its first frame in about 40 to 160 ms.
- The overlay's size is set on every show from the target scale, not left to `WM_DPICHANGED`.

Deferred: none new; round 1's item on window getters inside the gate lock goes to the ARD as debt in `document-task`.

### Round 3

Did:
- The `--displays` primary take moves the cursor to the primary display's centre and restores `cursor_home` only after it, as the cleanup already did.
- Any start that opens the sign-in window now signs in through it; before, only a start by hand did, so an `--autostart`-only run after a sign-out took no dictation (`smoke-0462390`, invalid: 4 FAIL with the sign-in window in front).

Evidence (workspace `evidence/probe`):
- `smoke-73011ba`: the debug build of the app at b8f6b5c (no app code changed since), `--starts autostart --takes 1 --displays`: 5 of 5 pass, exit 0; the primary take lands at 660,870, 600x120 at 125 %, after the takes on the secondary display at 100 % and 125 %.
