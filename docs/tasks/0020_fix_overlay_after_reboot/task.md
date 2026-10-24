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

Review focus beyond the Pipeline: the "usable or recreate" rule is a pure function whose unit tests fail on the base code; recreation keeps the overlay non-focusable, never steals focus and never holds the gate lock while building; the Windows smoke checks pixels; no 0019 code in the diff; the release round changes only the version.

clearance: full: the Windows host under the idle guard; pid 21460 read-only plus the 4 takes and the one scale change; dev release builds as `crew-e2e-b`; GitHub push, PR, `desktop-ci`, and `desktop-release` for 0.3.1 after the om-manager's go; no prd build launched, no AWS, no Terraform, no restart or sign-out.

## om-developer notes
