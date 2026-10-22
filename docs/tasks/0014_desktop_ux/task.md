---
id: "0014"
title: desktop_ux
type: feature
crew: pair
clearance: full
branch: feat/0014_desktop_ux
modules: [desktop, styles, dictionary]
repos: ["."]
phases: 0
depends_on: []
ticket:
created: 2026-10-22
updated: 2026-10-22
---

# 0014 Desktop UX: hands-free, quieter overlay, onboarding, full-window layout

## Goal

After using 0.2.0 every day, Sebastian likes how it works but wants it to feel finished: dictate without holding the keys, an overlay that is only the voice, an app window that fills the screen and still looks designed, an onboarding that explains everything and lets him pick a style by seeing what it does, a dictionary that explains itself, and an app that comes to the front when opened.
Ships as desktop 0.3.0.

## Scope

- Hands-free mode: a double tap of the hotkey (Ctrl+Win by default) starts listening without holding; a single tap of the hotkey stops and pastes; Esc cancels without pasting. Holding keeps working as today. The same maximum length and quota rules apply. Settings shows the gesture.
- Overlay: no "Escuchando"/"Listening" label, only the moving waveform; while processing, no "Limpiando" label, only a spinner that actually spins (today it is frozen). Errors keep their text and action. Hands-free shows a subtle difference from hold (for example a small stop affordance), designed within the brand. The overlay still appears only while dictating.
- Full-window layout: the main window opens maximized by default (remembering the user's last size and state afterwards) and every view is designed for wide screens: content centered with a readable max width or a multi-column layout where it helps (history, editors), no large empty area on one side, nothing stretched. It must look intentional at 1280, 1920 and 2560 wide and still work when the user makes the window small. Component sizes do not grow with the window.
- Onboarding, one continuous flow in the main window (no separate small sign-in window that closes by itself):
  1. what Take My Word does;
  2. sign in (and choose password on first sign-in);
  3. microphone check with the live waveform;
  4. the hotkey and hands-free, practiced in a practice box inside the flow;
  5. dictation languages;
  6. style choice showing the same sample sentence rendered in each built-in style (plain, casual, formal) with the differences visible (capitalization, punctuation, tone), static examples, no API call;
  7. "you are ready": where the app lives (tray), how to open it, what to try first.
  Signing in again later skips the steps already done; the user can rerun the onboarding from Settings.
- Styles view: the same before/after examples for built-in styles; custom styles show their description.
- Dictionary: the editor leads with "the word as it must be written", explained with a short example; "sounds like" variants move under an optional "Advanced" disclosure with a concrete example (Kubernetes, heard as "cuberneti").
- Opening the app (Start menu, shortcut, or launching the exe again) while it already runs in the tray brings the main window to the front and focuses it, restoring it if minimized.
- Screenshots of every changed window and state at 1280, 1920 and 2560 wide plus the minimum size, light and dark, es and en, refreshed every round.
- Release: desktop 0.3.0 with `pnpm release:desktop` after the om-manager's release go, only after 0013 is merged to `develop` (rebase first), merge commit so the tag reaches `develop`; update check 0.2.0 to 0.3.0 on Windows.

## Out of scope

- Changing the styles' prompts or adding built-in styles.
- Terminal paste (0013).
- Web changes.

## Acceptance

1. Hands-free: double tap starts, single tap stops and pastes, Esc cancels; hold still works; unit tests over the chord state machine; verified on Windows with injected input.
2. Overlay shows no label while listening or processing, and the spinner animates (verified by two captures at different times differing), respecting reduced motion with a non-animated busy state.
3. The main window opens maximized on first launch and restores the user's last size later; screenshots at 1280, 1920, 2560 and minimum show no stretched component and no empty half of the window.
4. A fresh install goes through the whole onboarding in one window, ending signed in with languages and style chosen; the style step shows the three styles' examples.
5. Launching the app while it runs brings its window to the foreground (verified on Windows: foreground window after launch is the app's).
6. Dictionary editor and styles view as described, with tests.
7. RAM and CPU at idle within 0011's method and limits against the develop head.
8. `ci`, `desktop-ci` windows and linux-check green; 0.3.0 published as latest, an installed 0.2.0 updates to it on Windows, and the prd landing shows 0.3.0.

## Approach

- Hands-free lives in the existing chord tracker in Rust (`hotkey`), as new states; the double-tap window is a constant chosen by measurement (about 300 ms).
- Foreground on second launch uses the single-instance plugin's callback in the running instance, with the Windows foreground rules handled (the launching process grants foreground permission).
- Layout uses `packages/brand` tokens; new layout tokens go there if both surfaces need them.

## Database

None.

## Infra

No AWS changes. Windows runs follow the machine rules of 0011 and 0012 (own mirror `C:\dev\tmw-0014`, scratch `C:\dev\tmw-0014-*`, only windows the run opens, detached debug builds with no console, clipboard snapshot and restore, injected input only when Sebastian is away, busy/free through the om-manager, removed at clean). The update check installs 0.2.0 only if prd is not installed; Sebastian has prd 0.2.0 installed and in use, so the run never touches his installation: the update evidence comes from his own app updating, or the run uses a separate scratch Windows user profile only if the om-manager agrees.

## Design

Direction A "Tinta" from 0010 and 0011. Design delegated to the om-manager; the first round delivers the overlay (hands-free and processing), the onboarding steps and the History and General views at 1920 for a design checkpoint before the rest.
Sebastian's reference for what looks wrong today: History maximized at 1920 shows a narrow left-aligned column and an empty right half.

## Risks

- Double tap can trigger by accident while typing shortcuts; the tap window and the "both keys released" rule must be tuned on the host.
- Windows foreground lock can refuse focus; Acceptance 5 checks it for real.
- Sebastian's own prd app must not be disturbed by the update check.

## Depends on

None to start. The release waits for 0013 on `develop`.

## Context & decisions

Consolidated 2026-10-22; the om-manager decides (design and merges delegated by Sebastian); details marked (om-reviewer) are mine.
These override Scope, Acceptance and Approach above where they differ.

- Spinner (om-manager, adjusts Acceptance 2): the host has Windows "Animation effects" off, so WebView2 reports reduced motion and `packages/brand/src/ui/ui.css` stops `.tmw-spinner`; confirm that cause on the host in round 1 before changing code. The processing spinner always rotates, slow and small, no travel or scaling (essential motion); the two-capture check applies with and without reduced motion; the waveform keeps honoring reduced motion as today.
- Esc (om-manager): only while hands-free listens, the hook swallows a physical Esc and cancels; the ARD entry "Native Windows key hook" is amended. Other keys never cancel hands-free; a chord press followed by another key is a shortcut and leaves hands-free running; the stop tap counts at its release.
- Target (om-manager): the paste goes to the window focused when hands-free starts; if focus changed, the text stays in the clipboard with today's notification.
- Timing (om-manager): first release to second press within 300 ms, each tap under 0.5 s; a second press held past 0.5 s is a normal hold; tap timings logged at info, never audio; Sebastian tunes from the PR installer.
- Practice box (om-manager, open): a real dictation pasted into a text box of the main window, skippable; chord logic only in Rust, events from the hook or forwarded by the page behind one interface, since `desktop/ard.md` "Shortcut capture" found no hook sees injected keys with the app's WebView in front. Sebastian's physical check on 0.2.0 picks the path; his physical try from the PR installer is offered, not awaited.
- Upgrade (om-manager, adjusts Scope): upgraded 0.2.0 users (`firstRunDone`, their `sub` in `onboardedUsers`) see no onboarding; General shows one dismissible "new: hands-free" note once after the update; release notes and "rerun onboarding" in Settings.
- Launch (om-manager, adjusts Scope): a user launch, cold or second instance, opens and foregrounds the main window; autostart passes an argument and stays in the tray; the 0.2.0 Run entry is rewritten at start.
- Hands-free is always on, no toggle; it holds the in-flight guard and the tray's recording state from start to paste (om-reviewer).
- Styles (om-reviewer): a custom style's description is its prompt, as `src/styleNames.ts` shows; no contract or API change. Built-in examples: one sample per language run once per style through the dev refiner and committed as static text; no invented differences.
- Mic check (om-reviewer): audio never leaves the process or is stored; capture runs only while the step is visible; blocked and missing microphone states kept; a hold during it still dictates.
- Design checkpoint (om-reviewer, as 0011): round 1 code is reviewed as usual and I send its screenshot paths (overlay hands-free and processing, onboarding steps, History and General at 1920) to the om-manager for one design answer before the rest is restyled.
- Screenshots (om-reviewer): 1280x800, 1920x1080, 2560x1440 and the minimum 380x480, device scale 1, light and dark, es and en; fixed windows at their real size; in `.workspaces/0014_desktop_ux/`.
- Release (om-manager, as 0012): clean review, PR, "awaiting release go"; rebase on `develop` once 0013 is merged; I run `pnpm release:desktop 0.3.0 --notes {{file}}` on the om-developer's prepared notes (short, English then Spanish); merge commit, never rebase at or below the tag. Update evidence (Acceptance 8): Sebastian's own prd app updating after publish; the run only reads `DisplayVersion` and the prd log; prd landing checked after publish.
- Acceptance 7 (om-reviewer): 0011's method (private working set of app plus WebView2 after opening and closing the main window; CPU seconds over 5 idle minutes) on dev release builds of the `develop` head and the final commit, same session; pass at RAM ≤ base + 10 MB, CPU ≤ base + 1.0 s.
- Windows runs (om-reviewer): crew-e2e-b from the root `.env`, its settings saved and restored, its dictations deleted, signed out; the dev config folder and credentials snapshotted and restored around the fresh-install run; injected chords press Alt before Win so prd's Ctrl+Win never fires; Acceptance 5 launches the way a user does, with another window the run opened in front and the app minimized. Choose-password covered by tests and screenshots.
- One PR, no phases (Sebastian's global rule).

Constraints: `desktop/ard.md` "Updates wait for no dictation in flight" and "Overlay window kept warm and gated by the hold" extend to hands-free; "Window sizes in one file" is rewritten, not appended, as the account and first-run windows go; `packages/brand` tokens only, new layout tokens in brand when both surfaces need them, web unchanged; no infinite animation while idle; Windows runs under 0011/0012 machine rules with `TMW_WINDOWS_CHECKOUT='C:\dev\tmw-0014'`, scratch `C:\dev\tmw-0014-*`, runs only on the om-manager's `computer available`.

Review focus beyond the Pipeline: chord state machine tests (double tap, stop at release, shortcut during hands-free, held second press, Esc swallow only while hands-free); no gesture logic in TS; nothing stretched or half-empty at 1920 and 2560; closing the main window frees it; onboarding resume and rerun paths.

clearance: full: GitHub as sebasfles (push, PR, the `desktop-v0.3.0` tag on my hand-off, the release), the Windows host under the machine rules, dev sign-in as crew-e2e-b; Sebastian's prd install only read; no AWS profile, no Terraform, no deploys.

## om-developer notes
