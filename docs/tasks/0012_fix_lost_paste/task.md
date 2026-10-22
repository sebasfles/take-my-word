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
- Acceptance 5 (om-manager, adjusts Scope): the prd landing already reads `latest.json` at run time, so it is checked right after the release is published; promotion #18 is the om-manager's, merged after 0012 reaches `develop`, and is not a PR gate.
- Release order (om-manager): clean review, then "PR ready, awaiting release go" to the om-manager; on its go the om-developer rebases and runs `pnpm release:desktop 0.2.0` only on my hand-off; then the 0.1.1 to 0.2.0 update evidence (installed, updated, verified, uninstalled) and the prd landing check go in the PR. Merge commit; never rebase or force-push at or below the tag. Release notes short, English then Spanish, in the tag message.
- Investigation limits (om-manager): never `wsl --shutdown` (the crew runs in WSL), never stop processes or services the run did not start; if the reader stays unidentified, the PR records what was tried.
- Logging (om-reviewer): each paste logs offer, keystroke and every read with millisecond times and the decision (rendered, withheld, counted), never the text.
- Windows slots (om-manager): "computer needed" to the om-manager with what the run does and its estimate, wait for "computer available", then `computer busy` and `computer free`.

Constraints: `desktop/ard.md` (delayed-rendered paste, restore delays kept unless the fix needs otherwise, the reader log at info level); `desktop/prd.md` paste rules (only the focus-at-hold window, the text left with a notification when it cannot land); Windows runs under 0011's machine rules with `TMW_WINDOWS_CHECKOUT='C:\dev\tmw-0012'`, scratch `C:\dev\tmw-0012-*`, debug builds and every helper launched detached with no console, only windows the run opens, clipboard snapshot and restore, injected input only with Sebastian away.

Review focus beyond the Pipeline: unit tests of the reader rules that fail on the old `pid == 0` rule; the WCT probe's cost inside the render request and a denied or failed probe treated as unproven, never as proof; no paste reported done without a counted read; the ard entry rewritten, not appended.

clearance: full: GitHub as sebasfles (push, PR, the `desktop-v0.2.0` tag on my hand-off, the release), the Windows host under the machine rules, prd 0.1.1 installed and removed by the run, dev sign-in as crew-e2e-b from the root `.env` (settings, rules and dictations saved, restored and deleted, then signed out); no AWS profile, no Terraform, no deploys.

## om-developer notes
