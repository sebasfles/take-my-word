# Replication: 0012 fix_lost_paste

## Preconditions

- Windows host with WSLg running (its `msrdc.exe` reads the clipboard) and the dev app built from `develop` after 0011 merges, signed in with a dev test user.
- The app launched detached with no console window.

## Steps

1. Start the run's own scratch target (`tmw-scratch.exe`) and focus it.
2. Run a dictation with `--dictate-wav` and a speech fixture, sent to the running instance.
3. Read the app log for the clipboard readers of that paste.

## Expected

The text lands in the scratch window, then the previous clipboard is restored; or, if the target never reads, the text stays in the clipboard and a notification says so.

## Observed

In 0011's Windows run (2026-10-21, 2 of 2 console-free pastes): `msrdc.exe` was withheld, then a reader seen as process 0 got the text and counted as the target; the paste was reported done, nothing landed in the scratch window, and the restore removed the text.

## Environment

Windows 11 host of Sebastian, WebView2, dev debug build, 0011 branch at afd37cc.

## Evidence

`.workspaces/0012_fix_lost_paste/evidence/app.log` (copied from 0011's Windows run, with that run's scripts in `evidence/windows-run-0011/`); `docs/modules/desktop/ard.md`, entry "The paste gives the text only to the target's processes", revisit trigger marked met.

## om-developer confirmation

2026-10-22, base build `develop` at f6f4acb (debug, dev), Windows 11 host with WSLg up, signed in as crew-e2e-b, launched with no console.
Reproduced on the first set of tries: 4 of 5 `--dictate-wav` pastes into the run's `tmw-scratch.exe` were reported pasted while nothing landed and the previous clipboard came back.
Each of the four logged, within the same second: `clipboard read by msrdc.exe (with a window): withheld`, `clipboard read by an unidentified reader (without a window): rendered`, `pasted a dictation`.
The fifth had no `msrdc.exe` read; the scratch window read with its own window and the text landed.
The windowless reader is `Wispr Flow.exe` (another dictation app on the host): Wait Chain Traversal found its thread blocked sending the render request to the clipboard owner, and it reads only after a Ctrl+V, never on a clipboard update alone.
Logs: `.workspaces/0012_fix_lost_paste/evidence/windows-run-0012-host/run1/replicate.out` and `probe1.out`.

## om-reviewer verification

2026-10-22, 17:22 to 17:23 UTC, commit 21c0c7c (worktree head 17fa8b8, same code), dev debug build on the Windows 11 host with WSLg up, signed in as crew-e2e-b, launched with no console, run by the om-reviewer with the om-developer's harness.
5 of 5 `--dictate-wav` pastes into the run's `tmw-scratch.exe`, with the run's windowless reader active, landed, and the previous clipboard came back each time; none was reported pasted with nothing landed.
Each paste logged the run's windowless reader and `msrdc.exe` withheld before the keystroke, then `tmw-scratch.exe` (with a window) rendered and counted for attempt 1.
After: signed out, 0 credential targets, dev folders removed, clipboard restored, crew-e2e-b settings, rules and dictations equal to before.
Logs: `.workspaces/0012_fix_lost_paste/.reviewer/run/accept.out`.
