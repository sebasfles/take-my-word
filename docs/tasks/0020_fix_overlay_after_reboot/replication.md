# Replication: 0020 fix_overlay_after_reboot

## Preconditions

- Desktop 0.3.0 (prd) installed, signed in, start at sign-in on (registry `Run` entry `take-my-word.exe --autostart`).

## Steps

1. Restart Windows and sign in.
2. Wait for the tray icon.
3. Open Notepad, hold the hotkey, speak a sentence, release.
4. Tap the hotkey twice for hands-free, speak, tap again.

## Expected

The overlay shows the waveform while listening and the spinner while cleaning, then hides when the text is pasted.

## Observed

No overlay at any point; the clean text is pasted in both modes.

## Environment

- App version or commit: desktop 0.3.0.
- Platform, browser or device: Windows host, started at sign-in with `--autostart`.
- Environment: prd.

## Evidence

- The app log of the run started at sign-in on 2026-10-24 (read before any new start, without text).

## om-developer confirmation

## om-reviewer verification
