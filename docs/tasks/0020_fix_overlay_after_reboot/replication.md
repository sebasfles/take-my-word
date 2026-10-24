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

2026-10-24, prd 0.3.0 pid 21460 (started at sign-in) and dev release builds of `develop` 1a77433 signed in as `crew-e2e-b`.
Reproduced on pid 21460, not yet on `develop` with an equivalent start.

pid 21460, under the idle guard, into a scratch window, clipboard sealed and restored with a verified hash, every dictation returning no text:

- Hold, hands-free, a hold after one `DISPLAY5` scale change (100 to 125 % and back), and a hold with a foreground change mid-take: in all four the overlay window and every WebView2 child are visible, uncloaked and 600x120 at `DISPLAY1`, and the page's accessibility tree reads "Escuchando", "Escuchando en manos libres" and "Limpiando" in turn.
  Screen grabs of the overlay's rect show nothing painted: no difference from the hidden baseline and no accent pixels.
- So Rust shows the window and the page receives every state; the frames never reach the screen, and neither a display change nor a foreground change repairs it.
- During 2.6 s of hands-free its renderer used 94 ms of CPU and its GPU process 31 ms, against 219 ms and 110 ms on a healthy dev overlay over the same steps: the page runs, but it barely produces frames.
- WebView2 155.0.4283.62 with the same flags, GPU preferences, Intel adapter and loaded modules as the healthy dev instance.

Equivalent starts on `develop`:

- `--autostart` by hand with no main window: the overlay paints on every take, so it does not reproduce.
- Separate defect: on every start by hand or `--autostart` by hand the overlay keeps a title bar ("Take My Word Dev" with minimize, maximize and close) around the pill, because nothing recalculates the frame after creation since the overlay is shown with `ShowWindow` instead of tao.
  pid 21460 is frameless (client 600x120), as is a dev overlay after a forced frame recalculation, which still paints.

## om-reviewer verification
