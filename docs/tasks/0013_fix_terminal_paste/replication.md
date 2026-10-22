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

## Environment

Windows 11, Windows Terminal, WSL 2, tmux, Claude Code; desktop 0.2.0.

## Evidence

To be collected by the om-developer in the first Windows run.
