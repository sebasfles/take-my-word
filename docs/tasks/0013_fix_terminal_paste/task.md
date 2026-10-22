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
- PowerShell (om-manager): targets 4 and 5 run with Windows PowerShell 5.1 and PowerShell 7 where installed; each counts as its own target.
- Windows Terminal settings (om-manager): the om-developer may read Sebastian's WT `settings.json` read-only, to compare paste bindings and multi-line warning with WT's defaults. It is never modified or committed. The fix must work with WT defaults.
- Sebastian's prd app log (om-manager): read-only, to learn whether his failed paste left the text with a notification; never copied into the repo; only the conclusion goes in `replication.md#Observed`.
- Windows slots (om-manager): no run starts without the om-manager's `computer available`, given to one task at a time (0014 shares the host). The om-developer sends me `computer needed: {{what}}, {{estimate}}` and `computer free`; I relay both.
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
