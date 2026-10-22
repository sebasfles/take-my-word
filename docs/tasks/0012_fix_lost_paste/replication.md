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
