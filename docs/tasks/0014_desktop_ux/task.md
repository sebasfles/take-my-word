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

- Motion (Sebastian through the om-manager, replaces Acceptance 2's reduced-motion clause with "animates even with Windows animations off"): the host has Windows "Animation effects" off, so WebView2 reports reduced motion and `packages/brand/src/ui/ui.css` stops `.tmw-spinner`; confirm that cause on the host in round 1 before changing code. In the desktop app every animation (spinner, waveform, transitions) runs regardless of `prefers-reduced-motion` or the Windows setting, through one desktop-level override; the web's reduced-motion behavior and `packages/brand` defaults stay unchanged; the two-capture check runs with Windows animations off; recorded in `desktop/ard.md` during the task.
- Esc (om-manager): only while hands-free listens, the hook swallows a physical Esc and cancels; the ARD entry "Native Windows key hook" is amended. Other keys never cancel hands-free; a chord press followed by another key is a shortcut and leaves hands-free running; the stop tap counts at its release.
- Target (om-manager): the paste goes to the window focused when hands-free starts; if focus changed, the text stays in the clipboard with today's notification.
- Timing (om-manager): first release to second press within 300 ms, each tap under 0.5 s; a second press held past 0.5 s is a normal hold; tap timings logged at info, never audio; Sebastian tunes from the PR installer.
- Practice box (om-manager): a real dictation pasted into a text box of the main window, skippable; his physical try from the PR installer is offered, not awaited.
- Keys in the app's own windows (Sebastian through the om-manager, 2026-10-22, adds to Scope): on prd 0.2.0 holding Ctrl+Win with a Take My Word window focused shows no overlay, so the hook does not see it there. While any app window is focused, its page forwards key down and up events to the same Rust chord state machine as the hook; no gesture logic in TS. Hold, hands-free and Esc then work with the app in front (practice box, dictionary editor); forwarding pauses during hotkey capture, as the hook path does, and an event seen by both paths counts once. Recorded in `desktop/ard.md` (amends "Shortcut capture" and "Native Windows key hook").
- Upgrade (om-manager, adjusts Scope): upgraded 0.2.0 users (`firstRunDone`, their `sub` in `onboardedUsers`) see no onboarding; General shows one dismissible "new: hands-free" note once after the update; release notes and "rerun onboarding" in Settings.
- Launch (om-manager, adjusts Scope): a user launch, cold or second instance, opens and foregrounds the main window; autostart passes an argument and stays in the tray; the 0.2.0 Run entry is rewritten at start.
- Hands-free is always on, no toggle; it holds the in-flight guard and the tray's recording state from start to paste (om-reviewer).
- Styles (om-reviewer): a custom style's description is its prompt, as `src/styleNames.ts` shows; no contract or API change. Built-in examples: one sample per language run once per style through the dev refiner and committed as static text; no invented differences.
- Mic check (om-reviewer): audio never leaves the process or is stored; capture runs only while the step is visible; blocked and missing microphone states kept; a hold during it still dictates.
- Design checkpoint (om-reviewer, as 0011): round 1 code is reviewed as usual and I send its screenshot paths (overlay hands-free and processing, onboarding steps, History and General at 1920) to the om-manager for one design answer before the rest is restyled.
- Screenshots (om-reviewer): 1280x800, 1920x1080, 2560x1440 and the minimum 380x480, device scale 1, light and dark, es and en; fixed windows at their real size; in `.workspaces/0014_desktop_ux/`.
- No release (Sebastian through the om-manager, 2026-10-22, replaces Scope "Release" and Acceptance 8's release part): 0014 merges to `develop` with no tag; desktop 0.3.0, the update check and the landing check move to 0015 (a "What do you do?" onboarding step and setting), which starts after 0013 and 0014 merge. Acceptance 8 is now `ci`, `desktop-ci` windows and linux-check green. The onboarding plan stays easy to extend: one more step after languages is one entry in `plan.ts` plus its view, with no other step or the resume and rerun logic edited. Rebase on `develop` if 0013 merges first.
- Acceptance 7 (om-reviewer): 0011's method (private working set of app plus WebView2 after opening and closing the main window; CPU seconds over 5 idle minutes) on dev release builds of the `develop` head and the final commit, same session; pass at RAM ≤ base + 10 MB, CPU ≤ base + 1.0 s.
- Windows runs (om-reviewer): crew-e2e-b from the root `.env`, its settings saved and restored, its dictations deleted, signed out; the dev config folder and credentials snapshotted and restored around the fresh-install run; injected chords press Alt before Win so prd's Ctrl+Win never fires; Acceptance 5 launches the way a user does, with another window the run opened in front and the app minimized. Choose-password covered by tests and screenshots.
- One PR, no phases (Sebastian's global rule).

Constraints: `desktop/ard.md` "Updates wait for no dictation in flight" and "Overlay window kept warm and gated by the hold" extend to hands-free; "Window sizes in one file" is rewritten, not appended, as the account and first-run windows go; `packages/brand` tokens only, new layout tokens in brand when both surfaces need them, web unchanged; no infinite animation while idle; Windows runs under 0011/0012 machine rules with `TMW_WINDOWS_CHECKOUT='C:\dev\tmw-0014'`, scratch `C:\dev\tmw-0014-*`, runs only on the om-manager's `computer available`.

Review focus beyond the Pipeline: chord state machine tests (double tap, stop at release, shortcut during hands-free, held second press, Esc swallow only while hands-free); no gesture logic in TS; nothing stretched or half-empty at 1920 and 2560; closing the main window frees it; onboarding resume and rerun paths.

clearance: full: GitHub as sebasfles (push, PR; no tag, no release), the Windows host under the machine rules, dev sign-in as crew-e2e-b; Sebastian's prd install untouched; no AWS profile, no Terraform, no deploys.

## om-developer notes

### Round 1

Done:
- Hands-free in Rust: `hotkey/gesture.rs` is the state machine (hold, first tap, second press within 300 ms, hands-free, stop tap at its release, shortcut during hands-free, Esc), driven by the session thread with its gap deadline next to the 2-minute cap; the recording starts at the first press and continues through the double tap, so the overlay never flickers and the audio has no gap. Tap timings logged at info.
- Esc: the tracker reports a fresh Esc outside a hold; the hook holds back Esc (down and its up) only while hands-free listens (`holds_back`, tested); own injections pass.
- Keys in the app's own windows: every non-overlay window forwards `KeyboardEvent.code` down and up (no repeats) through `forward_key` into the same `Keys`; `Keys` admits each event from either source once (an unmatched twin from the other source within 250 ms is dropped), and ignores both during a capture.
- Overlay: listening and processing show no visible label (kept for screen readers), the pill keeps one width, hands-free adds a stop button that stops and pastes through the session.
- Motion: confirmed on the host (`SPI_GETCLIENTAREAANIMATION=False`; headless Edge reports `prefers-reduced-motion: reduce` true, false with `--force-prefers-no-reduced-motion`). The override is that switch in one `BROWSER_ARGS` for every WebView window; brand CSS untouched. The two-capture check in the app is pending the Windows run.
- One main window (`main`): opens maximized with no saved placement, then restores the last normal placement and the maximized flag from `settings.json` (`mainWindow`), saved on close and exit, reused only while its title bar is on a screen; min 380x480; the account and first-run windows and `fit_account` are gone; closing destroys it.
- Onboarding in the main window: welcome, sign in (choose password), microphone check (live level from a monitor-only capture that buffers nothing, runs only while the step is shown, a hold during it still dictates), shortcut with both gestures and a practice box, languages, style with examples, ready. The plan is derived from `app_state`; a sign-in that finds the user onboarded skips languages and style; Settings > General reruns it; upgraded 0.2.0 users see none and get a dismissible hands-free note once.
- Launch: autostart passes `--autostart` and stays in the tray unless sign-in or setup is needed; a 0.2.0 Run entry is rewritten at start; any user launch, cold or second instance, opens and focuses the main window (the plugin already grants foreground to the first instance).
- Style examples: TTS of one sample per language on the host (SAPI, Sabina es-MX, Zira en-US), three dictations per language through the dev API as crew-e2e-b with `styleId` per style; outputs committed as `src/styleExamples.ts`; settings saved and restored, the 6 dictations deleted. Styles view and onboarding share `StyleExamples`; custom styles show their prompt.
- Dictionary: the add form leads with the written word and an example; "sounds like" sits under a closed Advanced disclosure with the Kubernetes "cuberneti" example; rows show "Sounds like" only when there are variants.
- Layout: sections center in the content area; General and History are wide (two columns: settings beside a how-to, setup guide and About aside; History as two columns of cards).
- Screenshots: `pnpm screenshots` now renders the main window at 380x480, 1280x800, 1920x1080 and 2560x1440, fixed windows at their size; round 1 set in `.workspaces/0014_desktop_ux/screenshots/round-1`.

Decisions not in the plan:
- During hands-free any clean press and release of the shortcut stops at the release, whatever its length; only the start gesture has the 0.5 s tap rule, so a slow stop tap never leaves the user stuck.
- A second press held past 0.5 s sends audio from the first press (a few hundred ms of extra lead), since the recording is one.
- Injected Esc from other processes is held back like a physical one, consistent with how the hook treats other injected input.
- Autostart opens the main window anyway when signed out, before first run is done, or when the user still needs languages and style.
- `app_state` treats a signed-in user it cannot look up (offline) as onboarded, so an outage never forces setup.
- The microphone gained a monitor mode (stream plays, nothing buffered) instead of reusing a recording, so the check never holds up to 120 s of audio.

Pending:
- Windows run (needs `computer available`): two-capture spinner check with animations off, hands-free and Esc with injected chords (Alt before Win), practice box paste, Acceptance 5 foreground, fresh-install onboarding run, maximized first launch and restore, Acceptance 7 RAM and CPU.
- Restyling Dictionary, Styles, App rules and Account for wide screens after the design answer; they are centered at prose width for now.

Deferred:
- With a user's dictation languages set to Spanish only, English speech dictated with casual or formal comes back translated to Spanish while plain keeps English (seen with crew-e2e-b before setting both languages); a dictation or styles task should look at it.

### Round 2

Findings:
1. Dictionary: Advanced opens and closes only by the user's toggle; it opens on its own when a "sounds like" it holds is refused. Tests: clearing the field keeps it open; a refused variant opens it.
2. Microphone check: Rust runs it only while the step wants it and the main window is shown (not minimized or hidden), through `CheckGate` in the shell, fed by the window's resize events and reset when the window opens; unit test over the gate.
3. Hands-free note: the dismissal lives in Main's phase, so the note stays gone across sections; test in `Main.test.tsx` (dismiss, History, back to General).
4. Styles view tests: the built-ins show "what you said" and each output with only changed words marked; a custom style is a card in the same grid described by its prompt.

Design answer:
- Onboarding steps are components in a registry keyed by the catalog in `plan.ts` (`steps`, each with a scope: machine, account or user). A new step is one catalog entry plus its view in the registry; the plan, resume after sign-in, rerun and the save on leaving the last user step derive from scopes. A plan test inserts a "role" user step after languages and checks order, resume, rerun and where the save happens.
- Frame: centered at `--size-content`, two columns above 1280 (content beside a sunken visual panel), one column at 1280 and below with the visual on top; headline at `--text-4xl`. Visuals: mark and waveform demo (welcome), mark and tagline (sign in), the live level (microphone), large keycaps animating hold and double tap plus Esc (hotkey), the tray menu over a taskbar corner (ready). Languages and style stay full width.
- Style examples: new samples run through the dev API as before (crew-e2e-b settings saved and restored, 33 dictations deleted across the candidate runs); picked the Spanish and English samples where all three outputs differ. Changed words are marked against "what you said" with a word-level diff that treats curly and straight quotes as equal; custom styles share the grid.
- History is one centered list at about 896 px; Dictionary, App rules and Styles' own styles put the form beside the list above 56rem of content, sticky; Account stays one centered panel.
- Scope change applied: no release work in this task.

Observed: across nine samples the refiner's casual output differs from plain only by punctuation or sentence splits; recorded for the dictation or styles owner, not changed here (prompts are out of scope).

Pending: the Windows run, on `computer available`.
