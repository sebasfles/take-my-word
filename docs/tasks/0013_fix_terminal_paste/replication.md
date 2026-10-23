# Replication: 0013 fix_terminal_paste

## Preconditions

- Windows host with WSL and tmux installed; Claude Code available inside WSL.
- Take My Word built from `develop` (0.2.0 behavior), signed in with a dev test user, hotkey held or `--dictate-wav` sent to the running instance.

## Steps

1. The run opens its own Windows Terminal window with a WSL tab, starts its own tmux session (unique name), and starts Claude Code inside it in a throwaway directory.
2. Focus that pane and dictate one sentence.
3. Repeat in: the same tmux without Claude Code, a plain WSL tab, a PowerShell tab, and a classic PowerShell window.
4. Read the app log for each paste (readers, proof, keystroke, restore).

## Expected

The dictated text appears at the prompt of each target, once, with no line executed, and the previous clipboard is restored.

## Observed

Reported by Sebastian on 2026-10-22 with 0.2.0 prd: dictating into Windows Terminal with WSL and tmux pastes nothing. Other targets not yet checked.
His prd app log (read 2026-10-22, not copied) shows 9 dictations into `windowsterminal.exe` with Ctrl+V and 0 app rules, 9 of 9 ending `left a dictation in the clipboard: NotRead`, so the text was never lost: it stayed in the clipboard with the notification.
In every one, both attempts read the same way: a reader without a window opened the clipboard after the keystroke, the proof walked the wait chains of 11 to 19 GUI threads of the Windows Terminal tree, spent its 200 ms budget without finding the sender, and withheld the text as unproven, so each attempt was contended and the terminal pasted nothing.
His Windows Terminal 1.24 `settings.json` binds Ctrl+V to paste, as the defaults do, and does not change the multi-line paste warning; PowerShell 7 is not installed on the host, so targets 4 and 5 run with Windows PowerShell 5.1 only.

## Environment

Windows 11, Windows Terminal, WSL 2, tmux, Claude Code; desktop 0.2.0.

## Evidence

To be collected by the om-developer in the first Windows run.

## om-developer confirmation

2026-10-22 23:34 to 2026-10-23 00:19 UTC, base build `develop` at 8e6cba0 (debug, dev, API stub in Normal mode, signed out), Windows 11 host with WSLg up, Windows Terminal 1.24.12741, Windows PowerShell 5.1 with PSReadLine 2.0.0, tmux 3.4, Claude Code 2.1.308, launched with no console, driven by `apps/desktop/scripts/terminal-smoke.sh`.
Reproduced on every Windows Terminal target, and the conhost target did not fail:

| Target | Pastes | Result |
|---|---|---|
| 1 Windows Terminal, WSL, tmux, Claude Code | 10 | 10 left in the clipboard (`NotRead`), nothing landed |
| 2 Windows Terminal, WSL, tmux | 5 | 5 left in the clipboard, nothing landed |
| 3 Windows Terminal, WSL bash | 5 | 5 left in the clipboard, nothing landed |
| 4 Windows Terminal, Windows PowerShell 5.1 | 4 | 4 left in the clipboard, nothing landed (a fifth never reached the app, a harness launch failure) |
| 5 conhost, Windows PowerShell 5.1 | 7 | 7 landed, previous clipboard restored |

Every Windows Terminal paste logged both attempts as `clipboard read by an unidentified reader (without a window, wait chains of 15 to 19 target GUI threads in 200 to 217 ms, 0 failed, budget spent): withheld, contends attempt N`, then `left a dictation in the clipboard: NotRead`; no paste was reported done with nothing landed, and no line ran.
In conhost the reader is `powershell.exe` itself (PSReadLine's paste), proven at the third GUI thread in 51 ms.
A probe that owned the clipboard the same way and walked every thread without a budget found the reader in all 9 tries (3 per window): a GUI thread of `WindowsTerminal.exe` that existed at the offer, 25th to 28th of the 44 to 46 GUI threads in the proof's order (the process hosts every Windows Terminal window on the machine, about 110 threads), and 5th to 8th among the threads whose cycle time grew after the keystroke; in conhost it was PowerShell's third GUI thread.
Multi-line, pasted directly by the run (the base build has no two-line dictation): targets 1 to 3 received both lines as one block through bracketed paste and ran nothing; target 4 showed Windows Terminal's multi-line warning, cancelled by the run; target 5 got both lines into PSReadLine's buffer and ran nothing.
Logs: `.workspaces/0013_fix_terminal_paste/evidence/base/` (`smoke2` to `smoke6` per run, `probe1` and `probe2` for the reader probe).

## om-reviewer verification

2026-10-23 07:40 to 07:50 UTC, commit 26e5a8a, debug build on the mirror `C:\dev\tmw-0013`, API stub in Normal and two-line modes, signed out, driven by the committed `apps/desktop/scripts/terminal-smoke.sh` after the 5 min idle gate.
Targets 1 to 4 (Windows Terminal with WSL, tmux and Claude Code; WSL and tmux; WSL bash; Windows PowerShell 5.1) took 2 of 2 dictations each and the two-line dictation, with the text read back from the target, no line run and the previous clipboard back.
In target 4, Windows Terminal's multi-line warning was confirmed: the first line ran and the second stayed in PSReadLine's buffer, which is what Context & decisions accepts.
Target 5 (conhost, Windows PowerShell 5.1) took 3 of 3 in a second run, because the first run aborted while closing target 4 (round 3 finding, a harness error, not the app).
Sebastian's clipboard was sealed before each run and restored with the same sha256 after both.
Result: matches Expected on 26e5a8a.
Round 4 (d9a3b1c) changes only the smoke's window close and the notes, with no app code since 26e5a8a; its run on 9954fb4 closed targets 4 and 5 cleanly (smoke exit 0) with the same results, so the verification stands.
