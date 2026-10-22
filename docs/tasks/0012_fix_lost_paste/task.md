---
id: "0012"
title: fix_lost_paste
type: bug
crew: pair
clearance: full
branch: bugfix/0012_fix_lost_paste
modules: [desktop]
repos: ["."]
phases: 0
depends_on: ["0011"]
ticket:
created: 2026-10-21
updated: 2026-10-21
---

# 0012 Fix pastes reported as done that land nothing

## Goal

When the user releases the hotkey, the cleaned text must land in the focused app, or stay in the clipboard with a notification; it must never be reported as pasted while nothing landed, and it must never be lost.
Today a clipboard reader that opens the clipboard without a window (seen as process 0) can read the offered text before the target app, count as the target, trigger the restore, and the target pastes the previous clipboard: the text is gone.

## Scope

- Reproduce the bug on the Windows host as `replication.md` describes, before touching code.
- Find the windowless reader on the host (its executable, logged without the text) and why it reads.
- Fix the paste so a reader that is not the target can never end the paste early or consume the text: the restore happens only after the target has read, and when that cannot be proven, the text stays in the clipboard with the existing notification instead of being restored away.
- Regression tests for the reader rules (unit) and a Windows smoke that reproduces the scenario with a windowless reader the run starts itself.
- Ship desktop 0.2.0 (0011's rebrand plus this fix; 0011 merged to develop without a release, Sebastian 2026-10-21) through `pnpm release:desktop`, after the om-manager's release go, merging with a merge commit so the tag reaches `develop`. The promotion of `develop` to `main` waits for this task.

## Out of scope

- Elevated targets (UIPI), which stay a documented limitation.
- Any change to the paste keystroke rules per app.

## Acceptance

1. `replication.md` reproduces the bug on the base build before the fix, with the log lines that show it.
2. After the fix, the same steps paste the text into the target in 10 of 10 tries, or leave it in the clipboard with the notification; never "pasted" with nothing landed.
3. A windowless reader started by the run reading before the target does not end the paste early (smoke on Windows, logged).
4. Real dictation with the hotkey into an ordinary app (the run's own scratch window and a WebView2 window) still pastes, and the clipboard is restored afterwards.
5. `ci`, `desktop-ci` windows and linux-check green; 0.2.0 published as latest, an installed 0.1.1 updates to it on Windows (installed, updated, verified and uninstalled by the run, as 0005 did), and the prd landing shows 0.2.0 after the promotion.
6. `docs/modules/desktop/ard.md` gets the decision, and the debt entry of "The paste gives the text only to the target's processes" is marked resolved or narrowed.

## Approach

- Start from the 0011 evidence: `msrdc.exe` withheld, then a process-0 reader got the text in 2 of 2 console-free `--dictate-wav` pastes.
- Prefer a rule that proves the target read (the target's process tree, or the paste keystroke reaching the target before any read counts) over timing heuristics; keep the restore delays from the existing decision unless the fix needs them changed.

## Database

None.

## Infra

None. Windows runs follow the machine rules recorded in 0011's Context & decisions: own mirror `C:\dev\tmw-0012` and scratch `C:\dev\tmw-0012-*`, only windows the run opens, debug builds launched detached with no console and nothing hosted by Windows Terminal, clipboard snapshotted and restored, injected input only when Sebastian is away, `computer busy` and `computer free` through the om-manager, removed at clean.

## Design

None.

## Replication

See `replication.md`.

## Risks

- The windowless reader may be part of Windows or WSLg and behave differently on other machines; the fix must not depend on one executable name.
- Waiting longer to prove the target read can make pastes feel slower.

## Depends on

0011 (same paste code; starts after its PR merges; its release moved here).

## Context & decisions

Consolidated 2026-10-22; the om-manager decides (technical calls and merges delegated by Sebastian); details marked (om-reviewer) are mine.
These override Scope, Acceptance and Approach above where they differ.

- Windowless reads (om-manager, Approach and Acceptance 3 and 4): WebView2, and likely recent Chromium apps, read the clipboard without a window, so `pid == 0` in `clipboard/win32.rs` cannot simply stop counting. Options in this order:
  (a) prove the reading thread: while handling the render request, Wait Chain Traversal over the threads of the target's process tree finds the one blocked sending to the clipboard thread; the same probe names the host's windowless reader (Scope bullet 2). Prove it on the host before building on it.
  (b) fallback, only if (a) cannot see it: nothing renders before the paste keystroke, the keystroke waits a settle of at most 100 ms (measured) so monitors reacting to the offer are withheld first, and a windowless read after it counts; the ard debt is then narrowed, not resolved, and the PR says so.
  (c) only if neither works: a windowless read never counts and the text stays with the notification.
  No rule may depend on an executable name.
- Acceptance 1 (om-manager): up to 5 tries of `replication.md` on the base build `develop` at f6f4acb; if the host's reader does not appear, the run's own windowless reader on that base build is the reproduction, with its log lines.
- Acceptance 2 (om-reviewer): 10 of 10 `--dictate-wav` pastes into `tmw-scratch.exe` with WSLg up and the run's windowless reader active; each try records the scratch text before and after (WM_GETTEXT) and the app log; any "pasted" with nothing landed fails.
- Acceptance 3 (om-reviewer): the run's reader is a small program the run builds, listening to clipboard updates and reading with `OpenClipboard(NULL)`; it logs read or empty, never the text. Under (b) it reads on each update.
- Acceptance 4 (om-manager): real holds are injected while Sebastian is away, with the committed speech fixture played through the host's speakers at moderate volume; into `tmw-scratch.exe` and a WebView2 window the run builds (as 0008's `tmw-webview.exe`); the previous clipboard checked back after each.
- Acceptance 4 adjusted (om-reviewer, 2026-10-22, on the om-developer's question): the host's microphone cancels speaker playback as echo (digital silence in a dump), and Sebastian's audio settings stay untouched; the holds run with the debug stub in Normal mode answering `POST /dictations`, so the hold path, the paste and the restore are real and only the transcription is stubbed; if the stub returns no text for a silent capture, WebView2 `--dictate-wav` 5 of 5 plus the hold mechanics count, and the PR offers Sebastian two spoken holds.
- One retry on contention (om-reviewer, 2026-10-22, on the om-developer's question): the host's windowless reader is Wispr Flow, which reads right after every Ctrl+V and can come first; when the first keystroke ends contended (nothing rendered), the paste rechecks focus, elevation and modifiers and sends the keystroke once more under the same rules; a second contention leaves the text with the notification.
- Acceptance 5 (om-manager, adjusts Scope): the prd landing already reads `latest.json` at run time, so it is checked right after the release is published; promotion #18 is the om-manager's, merged after 0012 reaches `develop`, and is not a PR gate.
- Release order (om-manager): clean review, then "PR ready, awaiting release go" to the om-manager; on its go the om-developer rebases and runs `pnpm release:desktop 0.2.0` only on my hand-off; then the 0.1.1 to 0.2.0 update evidence (installed, updated, verified, uninstalled) and the prd landing check go in the PR. Merge commit; never rebase or force-push at or below the tag. Release notes short, English then Spanish, in the tag message.
- Investigation limits (om-manager): never `wsl --shutdown` (the crew runs in WSL), never stop processes or services the run did not start; if the reader stays unidentified, the PR records what was tried.
- Logging (om-reviewer): each paste logs offer, keystroke and every read with millisecond times and the decision (rendered, withheld, counted), never the text.
- Windows slots (om-manager, 2026-10-22): no slot request needed; a ready run starts under the machine rules, with the idle guard aborting on real input, and the om-developer sends `computer busy` and `computer free` to me, which I relay to the om-manager. Superseded the same day after run 2 was aborted on Sebastian's input: no run starts on idle alone; each waits for the om-manager's `computer available`.

Constraints: `desktop/ard.md` (delayed-rendered paste, restore delays kept unless the fix needs otherwise, the reader log at info level); `desktop/prd.md` paste rules (only the focus-at-hold window, the text left with a notification when it cannot land); Windows runs under 0011's machine rules with `TMW_WINDOWS_CHECKOUT='C:\dev\tmw-0012'`, scratch `C:\dev\tmw-0012-*`, debug builds and every helper launched detached with no console, only windows the run opens, clipboard snapshot and restore, injected input only with Sebastian away.

Review focus beyond the Pipeline: unit tests of the reader rules that fail on the old `pid == 0` rule; the WCT probe's cost inside the render request and a denied or failed probe treated as unproven, never as proof; no paste reported done without a counted read; the ard entry rewritten, not appended.

clearance: full: GitHub as sebasfles (push, PR, the `desktop-v0.2.0` tag on my hand-off, the release), the Windows host under the machine rules, prd 0.1.1 installed and removed by the run, dev sign-in as crew-e2e-b from the root `.env` (settings, rules and dictations saved, restored and deleted, then signed out); no AWS profile, no Terraform, no deploys.

## om-developer notes

### Round 1

Evidence: `.workspaces/0012_fix_lost_paste/evidence/windows-run-0012/` (run scripts and helper programs) and `windows-run-0012-host/` (outputs per run: `run1` base and investigation, `run2a` aborted by real input, `run3`, `run4` invalid, `prior-165511` is run 4b, `run5` final).

What I did:

- `clipboard/mod.rs` holds every rule as a pure function with unit tests: who may read (`renders_for`, `reader_allowed`, `depth_below`), what proves a windowless reader (`sends_to` over a wait chain), the probe order, the read order of a paste (`ReadOrder`) and the settle before the keystroke and before the restore (`settled`, `Settle`).
- `clipboard/win32.rs` applies them: a windowless reader counts only when Wait Chain Traversal finds a thread of the target's process tree blocked sending this render request to the clipboard thread; the old `pid == 0` rule is gone, and a reader nobody can place, a failed or denied probe and a spent probe budget all mean unproven, never counted.
- `paste.rs` settles before the keystroke, arms the read order, retries once on contention, and restores only after the readers go quiet.
- Every paste logs offer, settle, keystroke with its attempt, every read with opener, probe cost, threads probed and the decision, every request answered without a render, and the restore's wait and why it ended; log timestamps now carry milliseconds.

Acceptance:

1. Reproduced on f6f4acb, 4 of 5 (see `replication.md`).
2. Run 5: 10 of 10 `--dictate-wav` pastes into `tmw-scratch.exe` with WSLg up and the run's reader active landed, and the previous clipboard came back each time; no "pasted" with nothing landed in any run since the round 1 rules.
3. The run's reader (`OpenClipboard(NULL)` on every update, logs read or empty only) was withheld before the keystroke in every try, in 0 ms, and never ended a paste; the real-clipboard tests also pass on the host (5 of 5, run 5).
4. Real holds with the speech fixture through the speakers came back empty: the host's Intel Smart Sound microphone with Acer Purified Voice cancels speaker playback (a `--dump-dir` capture at 0.5 volume was digital silence; the WAVs were deleted).
   Per the om-reviewer's decision the hotkey path ran with the debug stub instead: 3 injected Ctrl+Alt+Win holds into `tmw-scratch.exe` and 3 into the run's WebView2 window, 6 of 6 landed with the previous clipboard back, stub switched off after.
   `--dictate-wav` into the WebView2 window: 5 of 5; into a Chrome window the run opened (own temporary profile, removed): 3 of 3.
   Two spoken holds by Sebastian on the PR build stay offered, not awaited.
5. and 6. pending: CI on the PR, the release, and `document-task`.

Measured on the host (run 5):

| Read | Count | Cost min / median / max | Threads probed |
|---|---|---|---|
| Before the keystroke (the run's reader, `msrdc.exe`), withheld without a probe | 47 | 0 ms | 0 |
| Window reader after the keystroke (scratch), counted without a probe | 13 | 0 ms | 0 |
| WebView2 after the keystroke, proven and counted | 5 | 100 / 112 / 142 ms | 9 |
| Chrome after the keystroke, proven and counted | 3 | 65 / 67 / 82 ms | 5 |
| WebView2 during a stub hold, proven and counted | 3 | 144 / 145 / 166 ms | 10 |
| Request after the counted read, answered without a render | 10 | 0 ms | 0 |

Settle before the keystroke: 41 / 42 / 43 ms over 24 pastes; restore wait: 150 / 151 / 155 ms over 24 pastes, the 1 s cap hit 0 times; no paste needed attempt 2, and no `SetClipboardData` ran after a counted read (by construction, and none logged).
While the probe runs, the reader stays blocked in `GetClipboardData` and the clipboard stays open by it; nothing else renders and the paste thread only waits.
Each WCT call costs about 10 to 15 ms on this host, whatever its flags; the probe goes over GUI threads only, the target's own processes first, then children by depth, each process's main thread before its others, and stops at 200 ms.

Why a proven read is the paste's read, and what made it fail before (runs 3 and 4b):

- Reads before the keystroke never count, so the first read after it is the earliest any app can make for this paste; a monitor that reads after the keystroke and before the target contends the attempt and nothing after it counts.
- When the first answer after the keystroke takes 25 ms or more, Chromium (WebView2 and Chrome) sends a second, overlapping render request for the same format; it uses the data of the first, and it drops the paste if the clipboard changes before it finishes.
  Run 4b (the probe program, all reads before the keystroke withheld, every try checked for a render after the keystroke): 35 of 36 landed with first answers of 260 to 300 ms; every landing had a second `SetClipboardData` failing with 1418 (clipboard no longer open), and the one failure had it succeed and the sequence number move from 8830 to 8831.
  Run 3's false pastes were the app doing exactly that: rendering the second request (sequence bump), or holding it 200 ms and then restoring, which emptied the clipboard before Chromium finished.
- So after a counted read every later render request of that paste is answered at once without rendering, and the restore waits until no request has come for 150 ms; Chromium tolerated first answers of 260 to 300 ms in 4b, against 166 ms at most in run 5, a margin above 90 ms.

WCT crash (found by the unit tests, 5 to 6 of 40 runs with an access violation):

- Cause: each clipboard thread opened and closed its own synchronous WCT session, and closing one while another thread used its own wrote through freed state (`advapi32!CloseThreadWaitChainSession+0x6e`, write to 0x14 on a `clipboard` thread), captured with a temporary vectored exception handler and dbghelp symbols in a mirror-only build that never reached the worktree.
- Isolation, 40 runs each: open and close with no query, 1 crash; query and never close, 0; query without `WCT_OUT_OF_PROC_FLAG`, 8.
- Fix: one process-wide session opened on first use and never closed, every query serialized behind a mutex; a test runs two threads probing at once.
- 200 full-suite runs: 32 crashes before, 0 after.

Decisions the plan did not record (they become ARD entries in `document-task`):

1. No read before the paste keystroke counts or renders, not even the target's, and it is withheld without a probe; this replaces the 2026-10-21 rule "500 ms if something read before the keystroke".
2. Only the first read after the keystroke can count; any other first reader contends the attempt, and nothing after a contention renders.
3. One retry when attempt 1 is contended (om-reviewer, 2026-10-22): settle again, recheck modifiers, focus and elevation (any failing leaves the text with its reason), re-arm and send the keystroke once more; a second contention leaves the text with the notification.
   Residual: a target that retries opening the clipboard for longer than the settle after a contention could still read under attempt 2 and paste twice; the edit control and Chromium give up well within it.
4. After a counted read, later render requests of the same paste are answered without rendering.
5. The restore waits until the readers are quiet (at least 150 ms, 150 ms after the last render request, at most 1 s) instead of a fixed 150 ms after the read; this rewrites the 2026-10-21 restore delays.
6. The keystroke waits a settle after the offer (at least 40 ms, 30 ms with no read in progress, at most 100 ms), so readers reacting to the offer are answered before the target opens the clipboard.
7. The probe set is fixed at the offer (the target's process tree and its threads); a thread or process created after the offer is never proven.
8. One WCT session per process, never closed, queries serialized; a warm-up query at clipboard thread start (on the spawning thread) takes the first call's 300 ms off the first paste.
9. With no target window, nothing renders and the text stays with the notification (the old rule let anyone read).
10. Log lines carry milliseconds, for the whole app log.

Rejected along the way: asynchronous WCT (70 threads in 3049 ms against 806 ms synchronous); a system-wide probe (about 7 ms per thread over 5000 threads); a fresh thread snapshot inside the render request (doubled the cost for readers that are not the target).

Host notes: Wispr Flow won the race against the target once in run 2's three tries and never in run 5's ten, so attempt 2 has no host evidence yet beyond the real-clipboard test of an unproven reader followed by the retry; offline experiments on the host (no input, no windows) saved and restored the clipboard around each; leftovers to remove at clean: `C:\dev\tmw-0012`, `C:\dev\tmw-0012-base`, `C:\dev\tmw-0012-run`.

Deferred: `tauri-plugin-log` keeps one rotated file (`KeepOne`), so a long session loses older paste lines; the PR evidence was taken from the run outputs instead.
