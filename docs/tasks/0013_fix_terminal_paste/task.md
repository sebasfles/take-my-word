---
id: "0013"
title: fix_terminal_paste
type: bug
crew: pair
clearance: full
branch: bugfix/0013_fix_terminal_paste
modules: [desktop]
repos: ["."]
phases: 0
depends_on: []
ticket:
created: 2026-10-22
updated: 2026-10-22
---

# 0013 Paste into terminals: PowerShell, Windows Terminal, WSL with tmux and Claude Code

## Goal

Sebastian's main flow is dictating into a terminal: Windows Terminal running WSL, inside tmux, often inside Claude Code.
Today the dictated text does not paste there.
After this task a dictation lands in every terminal target below exactly as it lands in a normal app, or stays in the clipboard with the notification; it is never lost.

## Scope

- Reproduce on the Windows host with desktop 0.2.0 behavior (develop), per `replication.md`, before touching code, and find why each target fails (paste keystroke, reader proof from 0012, elevation, or the terminal's own paste handling).
- Make the paste work, in priority order, for:
  1. Windows Terminal with a WSL tab running tmux running Claude Code;
  2. Windows Terminal with a WSL tab running tmux;
  3. Windows Terminal with a WSL tab (bash);
  4. Windows Terminal with a PowerShell tab;
  5. classic PowerShell (conhost) window.
- Multi-line dictations paste as one block (no line executed on its own); a trailing newline is never added.
- Built-in app rules for these terminals are correct out of the box (no user rule needed).
- Regression coverage: unit tests for whatever rule changes, and a Windows smoke that drives each target the run opens itself.

## Out of scope

- Elevated (administrator) terminals: Windows blocks synthetic input from a normal process (UIPI); if a target is elevated, the app leaves the text in the clipboard with the notification and says why. Documented, not fixed.
- macOS and Linux terminals.

## Acceptance

1. `replication.md` reproduces the failure on the base build for each failing target, with the log lines that show why.
2. After the fix, 5 of 5 dictations land in each of the five targets, including a multi-line one, with the previous clipboard restored; never "pasted" with nothing landed.
3. The 0012 targets still pass (scratch window, WebView2, Chrome).
4. `ci`, `desktop-ci` windows and linux-check green.
5. `docs/modules/desktop` (ard, trd, prd) records the terminal behavior and the elevated-terminal limitation.

## Approach

- Start from the paste logs: they name every reader and the proof result per paste (0012).
- Windows Terminal reads the clipboard from its own process; WSL, tmux and Claude Code receive text from the terminal, so only the terminal process must be proven as the reader; tmux and Claude Code matter for bracketed paste and for the keystroke Windows Terminal forwards.

## Database

None.

## Infra

None. No release: merges to `develop` only; desktop 0.3.0 is cut by 0014. Windows runs follow the machine rules of 0011 and 0012: own mirror `C:\dev\tmw-0013` and scratch `C:\dev\tmw-0013-*`, only windows and terminal tabs the run opens itself (never Sebastian's Windows Terminal windows or tmux sessions; the run starts its own Windows Terminal window and its own tmux session with a unique name and kills only those), debug builds launched detached with no console, clipboard snapshotted and restored, injected input only when Sebastian is away, busy/free through the om-manager, removed at clean. Claude Code in the smoke runs in its own throwaway directory with no project and is exited by the run.

## Design

None.

## Replication

See `replication.md`.

## Risks

- Windows Terminal may treat Ctrl+V and Ctrl+Shift+V differently by profile settings; the fix must not depend on Sebastian's personal settings.
- Claude Code collapses long pastes into a placeholder; that is its behavior and counts as landed.

## Depends on

None. Runs in parallel with 0014; 0014 cuts the release after this merges.

## Context & decisions

Consolidated 2026-10-22; the om-manager decides on Sebastian's behalf; items marked (om-reviewer) are mine.
These override Scope, Acceptance and Approach above where they differ.

- Built-in rules (om-manager, adjusts Scope bullet 4): none exist today and Sebastian's prd account has no app rules, so every target got Ctrl+V. A desktop-only table of default keystrokes by executable, used only when the user has no rule for that app, is built only if the reproduction shows a target needs something other than Ctrl+V. If it exists, the App rules add form preselects that keystroke for a known terminal, with screenshots (390, 768, 1280).
- Multi-line (om-manager, Scope bullet 3, Acceptance 2): line breaks kept where bracketed paste exists (bash, tmux, Claude Code). In conhost, lines are joined with a space only when a line would otherwise run. In a Windows Terminal PowerShell tab, the terminal's own confirmation dialog counts as landed and prd says so. A line never runs.
- Multi-line adjusted (om-reviewer, 2026-10-23, on the om-developer's question, adjusts Acceptance 2 for target 4): Windows PowerShell 5.1 ships PSReadLine 2.0.0 without bracketed paste, so once Sebastian confirms Windows Terminal's multi-line warning, every line but the last runs, as with any paste there. The app keeps the text as dictated: no lines are joined for `windowsterminal.exe`, because that would break the one-block paste in bash, tmux and Claude Code, and no reader rule may depend on an executable name. prd says so. "A line never runs" holds for everything the app does: it adds no newline and sends no Enter, and without his confirmation nothing runs.
- PowerShell (om-manager): targets 4 and 5 run with Windows PowerShell 5.1 and PowerShell 7 where installed; each counts as its own target.
- Windows Terminal settings (om-manager): the om-developer may read Sebastian's WT `settings.json` read-only, to compare paste bindings and multi-line warning with WT's defaults. It is never modified or committed. The fix must work with WT defaults.
- Sebastian's prd app log (om-manager): read-only, to learn whether his failed paste left the text with a notification; never copied into the repo; only the conclusion goes in `replication.md#Observed`.
- Windows slots (om-manager): no run starts without the om-manager's `computer available`, given to one task at a time (0014 shares the host). The om-developer sends me `computer needed: {{what}}, {{estimate}}` and `computer free`; I relay both.
- Shared dev identity (om-manager, 2026-10-23): 0013 and 0014 debug builds share `%LOCALAPPDATA%\dev.fless.takemyword.dev`, the roaming config and the dev credentials. Before `computer free`, the dev app is stopped and signed out, its credentials are removed and those folders are as found. While 0014 is busy, no 0013 dev build runs on the host, not even passive ones.
- Clipboard snapshot (om-manager, 2026-10-23): before any run injects input or touches the clipboard, the clipboard is saved to a DPAPI-encrypted file, with its formats and hash logged (never content), then restored and verified by hash at the end.
  No shell tracing (`set -x`) around clipboard code; the snapshot never reaches logs, command lines or evidence, only the DPAPI file (om-manager, 2026-10-23, after the round 1 trace incident).
- Config test temp folders (om-reviewer, 2026-10-23, out of Scope on purpose): config.rs's tests leave a `%TEMP%\tmw-config-*` folder per run (6951 on the host). Round 2 makes them clean up after themselves. The leftover folders are not deleted, since only folders a run's own tests created may go (om-manager); the PR lists them for Sebastian.
- Replication (om-reviewer): the classic window is launched explicitly as `conhost.exe powershell.exe` (and `pwsh.exe`), since Windows 11 may hand consoles to WT. Each target also gets a multi-line dictation, which may come from a debug-only stub mode with a fixed two-line text.
- Isolation (om-reviewer): tmux runs on its own socket (`tmux -L tmw-0013-{{n}}`), never on the default server where the crew lives, and only that server is killed. WindowsTerminal.exe, OpenConsole and conhost processes the run did not start are never killed; the run's WT window (`wt -w tmw-0013-{{n}}`) closes by ending its own shells. Before every dictation the run checks that the foreground window is its own and aborts otherwise.
- Claude Code in the smoke (om-reviewer): throwaway directory, no prompt ever submitted, no Enter sent, exited by the run; skip user hooks and MCP servers where the CLI allows.
- Evidence (om-reviewer, Acceptance 1 to 3): every paste records the app log lines (readers, proof, keystroke, restore) and the text read from the target itself (`tmux capture-pane` on the run's socket, the PSReadLine buffer through a key handler in a `-NoProfile` session), plus the previous clipboard checked back. A Claude Code paste placeholder counts as landed. One injected real hold, with the stub in Normal mode, goes into target 1.
- Smoke (om-reviewer, Scope bullet 5): committed under `apps/desktop/scripts/`, run by hand from WSL, not in CI; documented in `desktop/trd.md` Testing.

Constraints: `desktop/ard.md` 2026-10-22 (a read counts only when it is the target's proven first read). Any loosening of the proof is a superseding ard entry, and no reader rule may depend on an executable name (the keystroke table is app-rule data). `desktop/prd.md` paste rules: only the window focused at the hold, and the text left with a notification when it cannot land. 0011 machine rules apply with `TMW_WINDOWS_CHECKOUT='C:\dev\tmw-0013'` and scratch `C:\dev\tmw-0013-*`.
Keep changes inside `paste.rs`, `clipboard`, `foreground`, `rules.rs` and the App rules view where possible; 0014 changes the session and hotkey code.

Review focus beyond the Pipeline: the 0012 race (a windowless monitor reading first) still never wins, with 0012's tests intact; no paste reported done without a counted read and target-side text; unit tests that fail on the base build's keystroke or proof rule; docs corrected, not appended.

clearance: full: GitHub as sebasfles (push, PR); the Windows host under the machine rules; dev sign-in as crew-e2e-b from the root `.env` (rules and settings saved, restored and deleted, then signed out); Sebastian's WT `settings.json` and prd app log read-only. No release, no AWS, no Terraform, no deploys.

## om-developer notes

### Round 1

Evidence: `.workspaces/0013_fix_terminal_paste/evidence/` (`base/` for the reproduction and the reader probe, `fix1` to `fix14` for the runs on this round's build, `tools/` for the probe program and the run drivers).

Cause (see `replication.md`): Windows Terminal reads the clipboard without a window from one of its own GUI threads.
That thread existed at the offer, but the process hosts every Windows Terminal window on the machine (about 110 threads, 44 to 46 of them GUI), and the proof's order (the target's main threads, then depth, then snapshot order) put it 25th to 28th.
At about 12 ms per wait chain the 200 ms budget ran out after 15 to 19 threads, the read stayed unproven, both attempts were contended, and the text stayed in the clipboard with the notification.
The keystroke, elevation and the terminals' own paste handling were not involved: Ctrl+V is what every target needs, so no keystroke table was built (Context & decisions, built-in rules).

What I did:

- The thread snapshot taken at the offer keeps a query handle per target thread, and each `arm` reads every thread's cycle time.
- When a read without a window arrives, the threads whose cycle time grew since that attempt's keystroke are probed first, in the old order, then the rest in the old order, under the same 200 ms budget; the read line logs how many ran.
  The proof itself is unchanged: a read counts only when a wait chain shows a thread of the target's tree blocked sending this render request to the clipboard thread, and only as the first read after the keystroke.
- `ran_first` in `clipboard/mod.rs` is the pure ordering, with a unit test; `win32.rs` tests that a thread that ran since the arm is probed before idle GUI threads, and a real-clipboard test reads without a window from behind 80 idle GUI threads of the target, which fails on the base build (the reader gets nothing) and passes now.
- The clipboard thread answers render requests sent to it while it waits to open the clipboard (offer, restore, keep, put).
  Before, it slept between `OpenClipboard` retries, so a reader that already held the clipboard open and asked for the text waited on the one thread that was waiting on it, until the patience ran out (200 ms for an offer, 3 s for a restore); the restore then failed and the app said the clipboard was lost.
  Found as a flake of `a_reader_outside_the_target_app_gets_nothing_and_does_not_count_as_the_paste` in fix13 ("access denied" from `restore` after 3 s, while another reader held the clipboard).
  The history copy owner is the same type and goes through the same `with_open_clipboard`, so it had the same stall and gets the same fix.
  New real-clipboard test: a reader opens the clipboard, a restore starts, the reader asks for the text; the restore must land within 2 s and the reader gets nothing. On the pre-fix loop it fails on its own assertion, "the restore gave up", after the 3 s patience (3.25 s); with the fix it passes in 0.36 s (fix15, with the clipboard sealed by DPAPI before and restored with a verified hash after).
- Debug-only stub mode `stub-two-lines` answers a fixed two-line text, for the multi-line dictations.
- `apps/desktop/scripts/terminal-smoke.sh` (with `terminal-smoke.ps1`) drives targets 1 to 5 and, for 0012's targets, a WinForms text box, a WebView2 text area and Chrome with its own profile, with an optional race reader without a window (on every clipboard update, or on every Ctrl+V); it opens and closes only its own windows, tmux sockets and app, checks the foreground before every paste, aborts on real input, signs in and out through UI Automation for the hold, and records per paste the app's log lines, the text read from the target, whether a line ran, and the clipboard check.
  Debug builds for it are built with `--features tauri/custom-protocol`, so their windows load the bundled UI instead of the dev server.

Results on this round's build (target text, clipboard check and log lines per paste):

| Target | Single-line | Two-line | Run |
|---|---|---|---|
| 1 Windows Terminal, WSL, tmux, Claude Code | 15 of 15 landed | landed as one block, 3 of 3 | fix4, fix5, fix6 |
| 2 Windows Terminal, WSL, tmux | 5 of 5 | one block | fix4 |
| 3 Windows Terminal, WSL bash | 5 of 5 | one block | fix4 |
| 4 Windows Terminal, Windows PowerShell 5.1 | 15 of 15 landed (one in fix4 lost its log lines to the log rotation) | warning cancelled: nothing ran (fix4, fix5); confirmed: line 1 ran, line 2 stayed in PSReadLine's buffer (fix13) | fix4, fix5, fix13 |
| 5 conhost, Windows PowerShell 5.1 | 10 of 10 | both lines in PSReadLine's buffer, none ran | fix6, fix7 |
| 6 WinForms text box, race reader on updates | 5 of 5 | landed | fix11 |
| 7 WebView2, race reader on updates | 5 of 5 | landed | fix11 |
| 8 Chrome, race reader on updates | 5 of 5 | landed | fix14 |

Tests on this build (fix15): `rust:test` 176 passed, 9 ignored; the clipboard tests with `--include-ignored` 36 of 36, 0012's race tests among them.

The injected hold (Ctrl+Alt+Win, stub in Normal mode, signed in as crew-e2e-b) into target 1 landed (fix6).
No line ran except the confirmed Windows Terminal warning in target 4, the previous clipboard came back after every landed paste, and no paste was reported done with nothing landed.
The race reader got the dictation 0 times (fix14: 0 dictations, 12 other text, 6 empty).
Windows Terminal reads on this build: 48 counted, each proven after 3 or 4 GUI threads, in 31 / 43 / 81 ms (min / median / max), 6 to 9 target threads having run since the keystroke; no attempt 2, no budget spent.
Cycle times read at the keystroke: 10 / 45 / 165 us over 15 to 227 threads.
PowerShell 7 is not installed on the host, so targets 4 and 5 ran with 5.1 only.

Decisions the plan did not record (ARD entries in `document-task`):

1. The proof probes the threads that ran since the attempt's keystroke first; it supersedes the order part of the 2026-10-22 entry ("probed in depth order from the target, main threads first").
   A thread that ran is not trusted more: it only gets its wait chain looked at sooner, and a reader outside the target's tree is still never proven.
2. The target's threads are held open by handle from the snapshot taken at an offer until the next offer replaces it, which also keeps their ids from being reused while the paste lasts (corrected in round 2).
3. While it waits to open the clipboard, the clipboard thread answers the render requests sent to it.

Debt (for the ARD and the PR):

- A reader without a window that opens the clipboard on every Ctrl+V, faster than the target, wins both attempts: fix9, scratch window, 6 of 6 left in the clipboard with the notification, the reader got nothing in 12 reads; this is the 2026-10-22 entry's "a monitor that wins the race on both attempts", unchanged by this round.
- Confirming Windows Terminal's multi-line warning in a Windows PowerShell 5.1 tab runs every line but the last (Context & decisions, multi-line adjusted).

Deferred: the app log rotates (`KeepOne`), which lost one paste's lines in fix4; the smoke now reads across a rotation, the rotation itself is untouched (already deferred by 0012).

### Round 2

Findings applied, all five:

1. The five `trace.log` files of fix8 to fix12 were shredded unopened (the om-manager had shredded them first) and the guard files under `C:\dev\tmw-0013-run` deleted; nothing on the Windows side holds a clipboard copy or a trace.
   `TMW_SMOKE_TRACE` is gone from the smoke, so no run can trace it.
2. The smoke seals every memory-based clipboard format into a DPAPI file (CurrentUser) in its scratch folder before it touches the clipboard, logs only the formats and a SHA-256, and in `cleanup` restores from that file and verifies the hash, deleting the file only after a verified restore; on a mismatch it keeps the file and says where.
   No clipboard content goes on a command line, into a log or into a trace; the only text the run itself puts on the clipboard is its own sentinel.
3. The guard records only the time and kind of the first real input (keyboard or mouse, no key codes), unhooks both hooks and ends.
4. Every injected step checks the guard right before it runs (focus, every chord, the hold, the UI Automation fill and invoke, the dialog press, each launch through `act`), and the foreground is checked again right before each `--dictate-wav`; a positive guard aborts before the next injection.
   During `cleanup` after an abort, the run sends no keys: targets close through `WM_CLOSE`, and only the sign-out goes through the app's own Settings window with UI Automation.
5. The run keeps the PID that `start` returns for the app it launched and stops, finds and checks only that PID with `--app`'s path; refusing to start while another dev instance runs stays.

Also, on the om-reviewer's decision (outside the task's scope, on purpose): `config.rs`'s tests left a `%TEMP%\tmw-config-<name>-<pid>` folder behind on every run (6951 on the host); their scratch path is now a guard that removes its folder on drop, so also when a test fails.
The leftovers already on the host stay (6964 on 2026-10-23, from every task's runs); they are debt for the PR, their cleanup is Sebastian's call.

Checks on the host (`evidence/round2`), with Sebastian's clipboard sealed first and restored with the same hash at the end (sha256 85f98cac…3b345, 10 formats):

- An HTML-only clipboard set by the run survived seal, overwrite and restore with an equal hash, so a clipboard without text is no longer lost.
- `config` tests: 9 passed, and the `tmw-config-*` count stayed at 6964 (0 new).
- The reworked smoke, targets 3 and 6 with the update race reader: 2 of 2 each plus the two-line dictation landed, the previous clipboard came back each time, the race reader got 0 dictations, cleanup stopped only the app the run started and restored the clipboard with a verified hash.
- `rust:test` 176 passed, 9 ignored.

Decisions the plan did not record (ARD entries in `document-task`, or the smoke's own docs in `trd.md` Testing):

4. The smoke's clipboard safety, guard and process rules as listed under findings 2 to 5.

