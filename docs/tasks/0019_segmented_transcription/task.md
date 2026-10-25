---
id: "0019"
title: segmented_transcription
type: feature
crew: pair
clearance: full
branch: feat/0019_segmented_transcription
modules: [dictation, desktop]
repos: ["."]
phases: 0
depends_on: ["0017"]
ticket:
created: 2026-10-24
updated: 2026-10-24
---

# 0019 Segmented transcription while speaking

## Goal

Long dictations wait too long after release, because the whole take is transcribed only once the user lets go.
In production a 25 s take waits 1.9 to 3.3 s and a 90 s take about 6.6 s, of which transcription is 0.7 to 4.5 s.
The desktop app cuts the recording at natural pauses while the user speaks and transcribes each segment in the background, so on release only the last segment is left to transcribe before cleanup runs once on the whole text.

## Scope

- Desktop detects pauses during a take and closes a segment at a pause once it is long enough; segments are transcribed while the take continues.
- Each closed segment's audio is sent at once and its raw text comes back to the desktop while the user keeps speaking.
- On release the desktop sends only the last segment's audio plus the raw texts it already holds; the API transcribes the last one, joins, cleans the whole text once, and saves one dictation as today.
- Hold to talk and hands-free both.
- Takes shorter than the minimum segment behave exactly as today (one request).
- Release-to-paste time measured per take on the desktop, by audio length, before and after.

## Out of scope

- Mobile (keeps one request per take).
- Any provider or model change (Parakeet, `gpt-transcribe`, faster cleaners): measured in 0018.
- Hedged requests, speculative cleanup, skipping cleanup for short phrases, streamed cleanup, streaming or realtime transcription.
- Lifting the two-minute cap.
- Deferred: keep-alive and a warm `dictate` (draft `latency`); text around the cursor as context (draft `surrounding_context`).

## Acceptance

1. During a take longer than the minimum segment, the desktop sends segment requests while recording, at most one in flight, and each returns raw text only (no cleanup, nothing saved).
2. On release, one final request carries the last segment's audio and the earlier raw texts; the result is one dictation, cleaned once, saved once, with history and usage as today.
3. A take shorter than the minimum segment sends exactly one request, identical to today's.
4. A segment that fails, or has not answered by release, is sent as audio inside the final request; no take is lost or fails because of a segment (tested with injected failures and delays).
5. The day's quota is charged by total audio duration once per take, not per segment; segment requests are refused when the day is at its cap.
6. No audio is persisted anywhere; segment raw texts live only in the desktop's memory for the take.
7. Quality gate: on the long samples (30 to 120 s), segmented transcripts are not worse than whole-take transcripts in WER and term errors, with words at segment boundaries reported on their own; 10/20 s and 20/30 s cut policies are both measured and the better one becomes the default.
8. Release-to-paste P50 and P95 on dev, by audio length bucket, before and after, are in the task's report.
9. Idle RAM and CPU of the desktop app do not rise.

## Approach

- Module and layers touched: desktop audio capture and dictation worker (Rust), shared contracts in `packages/shared`, the `dictate` pipeline in `apps/api`, API Gateway routes.
- Entities, endpoints, tables: a segment transcription request (audio in, raw text and language out) and an extended `POST /dictations` that accepts earlier raw texts with the last segment; contracts in `packages/shared` and the desktop's mirror.
- Decisions:
  - Segment results live on the client and the API stays stateless per request, chosen over keeping segments server-side because it adds no stored state and keeps retries simple.
  - Segment policy: a segment closes at a pause of 600 ms or more once it has about 10 s, and only if no segment request is in flight, otherwise the current segment keeps growing; forced cut at 20 s.
    Both values are configurable; the quality gate compares 10/20 s against 20/30 s.
    One speaker produces at most about 6 segment requests per minute at 10 s, under Groq's 20 per minute account-wide.
  - Each segment request carries the previous segments' raw text as transcription prompt, within the prompt budget, for continuity of names and language, chosen over independent segments because cuts otherwise break names and language.
  - Pause detection by level against an adaptive noise floor, chosen over a VAD model because it costs no memory or package size; a VAD model only if the quality gate shows bad cuts.
  - Language: with several dictation languages, later segments use the language detected for the first one, so a take does not switch language mid-way.

## Database

No new tables; one `DICTATION` item per take as today.

## Infra

- New route on the HTTP API for segment transcription, served by `dictate`; dev deploy for the measurements.
- No new secrets.

## Design

None (no visible UI change).

## Risks

- Cuts inside words or at a breath can cost accuracy; the boundary metrics must show it.
- Groq's per-minute limit is shared with dev and the eval runs; a 429 on a segment must fall back to the final request, not fail the take.
- Hands-free takes can include long silences; the noise floor must not close a segment in the middle of speech.

## Depends on

0017 (merged).
Runs in parallel with 0018, which adds the long samples (30 to 120 s); this task's quality gate runs on them last, after a rebase once 0018 is merged.

## Context & decisions

- Charging (om-manager, option C): each segment request checks the cap, is charged from its own bytes once transcribed, and answers with a receipt, an HMAC over user, text hash, seconds, language and issue time; failed segments are never charged.
  The final request sends the earlier texts with their receipts; the server verifies them, charges only its own audio, records the take's total seconds, and lets a final with a valid receipt pass the cap, so a take started under the limit finishes.
  The key is generated by Terraform per environment and passed as a `dictate` env var: nothing in Secrets Manager, no manual value, self-host gets it too.
  Why: a stateless API cannot charge once per take without trusting client claims, which `docs/modules/dictation/ard.md` "The charge comes from the bytes" refuses.
- Acceptance 5 adjusted (om-manager): "Every second of audio is charged once from its bytes when it is transcribed; segment requests are refused at the cap; a take that started under the cap finishes; a segment re-sent as audio after answering late may be charged twice (at most one per take)."
- Infra adjusted: the receipt key is this task's only new value; "No new secrets" holds for Secrets Manager.
- Gate failure (om-manager): "not worse" is 0017's relative gate (segmented within the whole-take per-run spread for WER and term errors, boundary words apart); if neither policy passes, segmentation ships off by default behind its config, the report says why, and a VAD model is a follow-up task.
- Dev (om-manager): implement and unit-test without dev; after 0018 merges and this branch is rebased, dev is handed to 0019 for the route apply, the branch `dictate` swapped on dev for `pnpm e2e`, the gate and the measurements, then develop's build restored.
  `pnpm tf prd plan` goes in the PR; prd apply and the desktop release come after the merge, so until then prd answers 404 on the segment route and the desktop falls back.
- Failures (om-reviewer): after a segment fails (429 included) or is still in flight at release, no more segment requests go out for the take; the final carries the texts before it plus one WAV of everything after, and waits only a short bounded grace for an in-flight segment; the report counts late segments.
- Texts travel outside the 4 KiB meta part (`apps/api/src/dictation/upload.ts`); today's request from mobile and released desktops must stay valid byte for byte.
- Cuts (om-reviewer): the forced cut at 20 or 30 s lands on the quietest frame of the last second; detection runs only while listening, on the existing capture buffer.
- Language (om-reviewer): segment 1's detected language comes back and is sent on later segments and the final; the server honours it only when it is one of the user's dictation languages.
- Old servers (om-reviewer): a 404 on the segment route turns segmentation off for that server and the take goes as today's request (`docs/modules/desktop/ard.md` "A self-hosted server older than the app may miss routes").
- Silence (om-reviewer): each segment goes through the level floor and the silence guard; a silent or hallucinated segment yields empty text; a short or silent last segment with earlier texts still refines them.
- Audio (om-reviewer): the segment route never writes to the debug audio sink; `debug_audio` stays off during runs.
- Prompt (om-reviewer): segment prompts keep today's term projection and the previous raw text's tail fills what is left of `STT_PROMPT_TOKEN_BUDGET`; the gate reports the split.
- Measurement (om-reviewer): a debug-only replay plays each sample in real time through capture, segmenter and worker on Windows against dev; before is the same build with segmentation off, interleaved; buckets under 10, 10 to 30, 30 to 60, 60 to 120 s; paced to keep half of Groq's per-minute limit for prd; the gate cuts with the Rust detector's output, assuming no request in flight (most cuts).
  A permanent log line per take records seconds, segment count and release-to-paste ms, never text.
- Detector tests use Polly long samples with added noise and long silences; real hold and hands-free are Sebastian's manual check from the PR installer.
- Constraints: contracts in `packages/shared` and the desktop mirror held by `pnpm contract`; ports and adapters untouched (`docs/TRD.md` Conventions); Groq pacing per `docs/modules/dictation/ard.md` 2026-10-24.
- Review beyond the Pipeline: receipt forgery, replay across users and expiry tests; injected segment failures and delays (Acceptance 4); one `DICTATION` per take; idle RAM and CPU against the base build; no text or audio in logs.
- clearance: full: `pnpm tf dev plan` and `apply` for this task's resources, `pnpm tf prd plan` only, branch `dictate` swapped on dev then develop's build restored, the dev eval Lambda and Polly, desktop debug builds on the Windows host against dev with a throwaway user deleted afterwards; no prd apply, no desktop release.

### Reiteration 1 (2026-10-24, om-manager and om-reviewer)

- Groq (om-manager): the Groq org is on the paid tier as of 2026-10-24; the free-plan reserve and the 20 per minute assumption no longer bind; pace on Groq's rate-limit headers; every run keeps the 3 USD cap and reports its spend.
- Gate (om-reviewer): gate-1 found almost every cut forced (0 pause cuts clean, 5 of 75 at -60 dBFS), a detector defect rather than a policy verdict: exact zeros drag the floor to -100 dBFS.
  The detector ignores exact zeros in its floor and always counts levels at or below about -60 dBFS as quiet, with a test; `pauseMs` stays 600 and the report gives the gap distribution of the long samples.
  The gate re-runs on the clean and the -60 dBFS sets; the better policy passing both ships on by default, otherwise off as decided above.
- Order (om-manager): 0021 (every transcriber and refiner in production, selected by Lambda env vars) merges before 0019; 0019 holds with develop's `dictate` restored on dev and runs nothing on dev until "0021 merged, resume".
- Then (om-manager): rebase on develop and run Acceptance 7 and 8 for three combinations switched by 0021's env vars on dev: whisper-large-v3-turbo + gpt-5.4-nano (today's), gpt-transcribe + gpt-5.4-nano, Parakeet + Cerebras qwen-3.8-27b.
  Parakeet takes no prompt, so its segments run without the previous text; the report says so per combination.

## om-developer notes

### Round 1

Done:
- `packages/shared`: `segmentsPath` (`POST /dictations/segments`), `segmentMetaSchema` (transcriber, language), `segmentResponseSchema` (raw, language, optional receipt and `skipped`), `earlierSegmentsSchema` (1 to 24 `{text, receipt}`), optional `language` on the dictation meta, new parts `previous` and `segments`, both up to 64 KiB.
- `apps/api`: the segment route in `dictate` (routed by `routeKey`): probe, level floor (empty text, no receipt, no charge), cap-checked charge, transcription prompted with the terms plus the previous raw text's tail within `STT_PROMPT_TOKEN_BUDGET`, the silence guard (empty text, charged, with receipt), no refine, no save, no debug audio.
  Receipts are `base64url(json{s,l,t}).base64url(HMAC-SHA256)` over user, SHA-256 of the text, the claims and a version tag; they expire after 5 min (60 s of clock skew).
  `POST /dictations` with a `segments` part verifies every receipt (400 otherwise, before any charge), charges only its own audio and without the cap condition, accepts a last part under 0.5 s or under the level floor as empty, transcribes the last part in the take's language, joins, refines once and saves one `DICTATION` with the take's total seconds; without the part the request is unchanged.
  Shared stages moved to `dictation/stages.ts`; `SEGMENT_RECEIPT_KEY` is optional: without it the segment route answers 404 and a final with segments 400.
- `infra`: route `POST /dictations/segments` to `dictate`, `random_password.segment_receipt_key` (64 chars) as `SEGMENT_RECEIPT_KEY`, provider `hashicorp/random ~> 3.7` in the stack and both environments with their lock files.
- `apps/desktop`: the capture buffer keeps one RMS level per 10 ms and slices by level; the session polls new levels every 100 ms only while a segmented take records; `segments::Detector` cuts at a pause of 600 ms once the segment has 10 s, or forces at 20 s on the quietest level of the last second, only when nothing is in flight; `TakeSegments` keeps the take's texts, receipts, covered audio and first language, and the `segments` thread sends one segment at a time with the previous raw text; release waits up to 1.5 s for one in flight, then the final carries the texts and one WAV of everything after the last answered segment.
  A failed segment (429 included) stops segmenting for the take; a 404 turns it off until the server changes; a cancelled take drops what was queued.
  Policy lives in `settings.json` `segmentation` (`enabled`, `minSeconds`, `maxSeconds`, `pauseMs`), default on with 10/20.
  One log line per take: audio ms, segments sent and used, a late one, outcome and ms after release; never text.
  The debug stub answers the segment route.

Decisions not in the plan:
- The pause cut lands on the quietest level of the detected pause after its first 150 ms, not at a fixed offset; under -50 dBFS noise a fixed offset fell in a word's decay.
- A segment with under 300 ms above the floor is not sent; its audio is marked covered (long hands-free silences cost no request).
- Receipts live 5 minutes; a user can replay their own valid receipt within that window to get one more refine without charge.
- The receipt key is optional in config so prd code can deploy before its apply.
- The detector fixture is one 64 s Polly sample (Lupe, 8 kHz, 1 MB) with noise and silences added in the tests.

Verification: the Windows checks ran in a task-only checkout (`TMW_WINDOWS_CHECKOUT=/mnt/c/dev/tmw-0019`) so no other task's checkout was touched; Docker Desktop had to be started on the host after the reboot for `rust:lint:linux`.
`verify.log` was written on 4d09ed1; this commit only adds it and these notes.

Pending (after 0018 merges and the rebase, per Context & decisions): dev apply, `pnpm e2e` (new `e2e/segments.e2e.ts`), the gate tool (detector cuts per sample for 10/20 and 20/30) and the real-time replay, Acceptance 7 to 9, `pnpm tf prd plan`.
Deferred: none.

### Round 2

Done:
- Finding 1: every file in `apps/desktop` keeps its mode on `origin/develop` and the new `segments` files are 100644; `git diff origin/develop...HEAD --summary` shows only "create mode 100644".
  Cause: copying `cargo fmt` output back from `/mnt/c` with `rsync -a`, which carries drvfs's 755; from now on output from the Windows checkout comes back only with `--no-perms`.
  `origin/develop` already holds 32 files under `apps/desktop/src-tauri/src` at 100755 from earlier tasks; they stay as they are, since changing them is outside Scope.
- Finding 2: rebased on `origin/develop` (1a77433).

Deferred: resetting the 100755 modes already on `develop` under `apps/desktop/src-tauri/src` to 100644 (their own small task).

### Round 3

Done:
- Finding 1: a segment reads the day's usage (`UsageStore`, GetItem, now in the `dictate` role) next to the profile and answers 429 at the cap; it is charged with an unconditional ADD only after the provider answers, so a provider failure (a Groq 429 included) charges nothing and the final that re-sends that audio charges it once.
  A hallucinated segment is still charged, as the provider billed it.
- Finding 2: a final that repeats a receipt answers 400; one whose receipt seconds plus its own audio pass `maxTakeSeconds` (120, now in `packages/shared`) plus 2 s answers 400; receipts live 180 s.
  Remaining replay (another final with the same receipts inside 180 s) goes to `docs/modules/dictation/ard.md` as debt at document time.
- Finding 3: a final with segments refused with 400 is sent once more as today's request (the whole take, no segments, no language); the per-take line says "resent whole".
- Finding 4: the per-take line now reads "answered N ms and {outcome} M ms after release"; N is release to the API's answer with the text and excludes the paste and the clipboard restore, and is the number the Acceptance 8 report will use.
  The target's read is not exposed: the paster only reports it through its own "restoring N ms after the counted read" line, and threading it out would change the paste API outside Scope.

### Round 4

Rebased twice: on dd517e8 (0020 merged), then on d81e689 (0018 merged); no textual conflicts, so every round commit has a new sha (round 1 c50dc3b, round 2 8d23d5d, round 3 1bb886a).
One semantic conflict: 0018's eval Lambda builds a `DictateDeps` for its `dictate` kind without the `usage` store round 3 added, so round 3 alone no longer typechecks on d81e689; this round adds `usage` to that stub (`apps/api/src/eval/execute.ts`).
The dev runs below the gate used round 3's code on 1a77433; the gate and the segments e2e ran on the rebased branch.

Done on dev:
- Terraform: `pnpm tf dev plan`, then that saved plan applied: 3 added (`random_password.segment_receipt_key`, the `POST /dictations/segments` integration and route), 2 changed in place (`dictate` gets `dynamodb:GetItem` and `SEGMENT_RECEIPT_KEY`); nothing else.
- `pnpm e2e` in `apps/api`: 3 files, 39 tests passed, `segments.e2e.ts` included; `segments.e2e.ts` passed again on the rebased branch's `dictate`.
- Receipt and cap checks, as `crew-e2e` and `crew-e2e-b`, all as expected: a segment under the cap 200; a receipt sent by another user 400; a repeated receipt 400; a forged signature 400; earlier seconds plus 120 s of own audio 400; a segment at the cap 429; a final with a valid receipt at the cap 200, charged only its own 1.9 s; a plain final at the cap 429; the same receipt 185 s after issue 400.
  `crew-e2e`'s day usage was set to the cap for the test and put back to its earlier value (164.01 s).
- Injected faults (Acceptance 4), through the replay below: a segment refused with 429 and a segment held 30 s (in flight at release, counted late) each ended in one final with no earlier texts carrying the whole take (673 KB for 21.6 s), status 200, every word pasted (65 of 65).
- Release-to-paste (Acceptance 8), 10/20, Spanish Polly samples, segmentation off and on interleaved per sample:

  | Samples | Bucket | Segmentation | Takes | With a segment used | P50 ms | P95 ms |
  |---|---|---|---|---|---|---|
  | clean | under 10 s | off | 11 | 0 | 1407 | 2055 |
  | clean | under 10 s | on | 11 | 0 | 1490 | 2320 |
  | clean | 10 to 30 s | off | 9 | 0 | 2503 | 3236 |
  | clean | 10 to 30 s | on | 9 | 1 | 2047 | 2879 |
  | white noise at -60 dBFS | 10 to 30 s | off | 9 | 0 | 2351 | 4455 |
  | white noise at -60 dBFS | 10 to 30 s | on | 9 | 1 | 2295 | 3005 |

  Under 30 s the policy fired on one take in nine (21.6 s): 2188 to 1380 ms clean, 2714 to 1507 ms noisy; every other take sends the same single request either way, so those on/off gaps are run-to-run spread.
  The long buckets were started and stopped after the first long take (old detector, so not reported as a result): 105.8 s took 12168 ms after release whole and 3886 ms with 5 segments.
- Idle RAM and CPU (Acceptance 9), release builds of `tauri:build:dev` from this branch (round 3 code) and develop 1a77433, started with `--autostart`, 60 s warm-up, 187 s measured over the process tree (the app and 7 WebView2 processes), five pairs interleaved: working set 436 to 443 MB branch, 428 to 444 MB base; private 204 to 212 MB branch, 199 to 210 MB base; CPU 0.147 to 0.168 % branch, 0.139 to 0.173 % base.
  The app's own process used 0 ms of CPU in every branch window (base 0 and 16 ms) and holds 31 to 33 MB in both, so idle CPU is WebView2's and does not rise.
  While measuring, the dev flavor's hotkey was Shift+F24 so Sebastian's prd hotkey could not reach it; its `settings.json` was restored byte for byte (sha256 checked).
- `pnpm tf prd plan`: the same 3 to add and 2 to change as dev, nothing else; output at `.workspaces/0019_segmented_transcription/.verify/tf/prd-plan.out` for the PR; no prd apply.
- Dev restored: develop's `dictate` is back (CodeSha256 `ItKQi6kGvQaqjj/s/f1mnAyukNzQJuW8Bqhm7PjkCc4=`, deploy-dev's build of d81e689, today's develop head); the applied route, key and GetItem stay on dev.
  The throwaway users of every replay were deleted (one by hand after a stopped run, with its 4 items).

Done in code:
- `apps/desktop/src-tauri/src/replay.rs`: an ignored test that plays each WAV of a plan in real time into a `CaptureBuffer` behind the real `Session`, `Detector`, `TakeSegments`, `segments` thread and `Worker`, with `AuthedApi` on the server; only the device, overlay and paste are fakes; faults are injected in front of the segment API; release-to-paste is release to the fake paste, the per-take line's "answered N ms".
- Quality gate (Acceptance 7): `pnpm eval:segmentation` (`apps/api/evaluation/segmentation.ts`, analysis and report in `harness/segmentation-*.ts`); the extended samples, every voice, both language settings, 5 runs, whole take against each policy with production's adapter (whisper-large-v3-turbo), prompt (terms plus the previous raw tail within 224 bytes), first segment's language, level floor and silence guard; cuts come from the desktop's `Detector` through an ignored test (`writes_the_cut_points_a_session_makes_with_nothing_in_flight`) run by `windows.sh`, as a session makes them with nothing in flight; boundary words (two either side of a cut) are counted apart for both arms in the same places; `SEGMENTATION_NOISE_DBFS` adds a microphone floor.
- Detector (om-reviewer's fix): the floor ignores exact-zero levels and a level at or below -60 dBFS is always quiet; test `digital_zeros_never_hide_the_pauses_around_them` (leading zeros, then pauses of breath and zeros) fails on the old logic and passes.
- Segmentation off by default: `Policy::default()` is now off at 20/30; the 10/20 tests use `TEN_TWENTY`; a `segmentation` entry without `enabled` stays off.

Gate results (`docs/tasks/0019_segmented_transcription/reports/`):
- gate-1 and gate-noise60-1: the old detector; every cut forced on clean, 8 of 63 pause cuts at -60 dBFS (6 of 39 at 10/20, 2 of 24 at 20/30); superseded by the fix, kept for the record.
- gate-2, clean, fixed detector: neither policy passes, on hard-gate flags only (10/20: 13 and 14 against the whole take's 4 and 1; 20/30: 10 against 4 and 1), all invented words at forced cuts in mid-sentence; WER and term errors pass for both (20/30: 1.3 % against 2.0 % and 1.3 %).
- The -60 dBFS re-run on the fixed detector was stopped by the pause after 100 of 360 items; not reported.
- Pauses in the long samples, as the fixed detector classifies them (14.0 min): clean 132 gaps of 400 ms or more, 15 of 500 ms, none of 600 ms (longest 540 ms), so 0 of 38 and 0 of 23 cuts are pause cuts; at -60 dBFS 132 of 400 ms, 108 of 500 ms, 29 of 600 ms, none of 800 ms (longest 720 ms), 6 of 39 and 2 of 24 pause cuts.
- Finding for the resume: on clean audio the floor still sinks, now to the near-zero decay levels next to the zeros (-64 to -89 dBFS), so breath at -50 to -56 dBFS does not read as quiet; letting the floor also ignore levels at or below the always-quiet level would let those gaps reach 600 ms; not done, per the pause.
- Spend: gate-1 0.587 USD (Polly 0.297 plus Groq 0.290), gate-noise60-1 0.290 USD, gate-2 0.290 USD, the stopped run about 0.08 USD; replays about 0.010 USD and the dev e2e and checks about 0.002 USD of Whisper, plus one refine per final; every run under 3 USD.

Decisions not in the plan:
- The replay is a `cargo test` with the device, overlay and paste faked, not the app driven through its window, so it runs unattended from WSL and needs no stored session.
- The gate takes the cuts from the desktop's own `Detector` through `windows.sh`, not a port, so the gate measures the shipped detector.
- The replay plans, the Polly samples for it, the throwaway users and the summaries are a workspace script (`.verify/replay/`), not committed; the gate tool is committed.

Pending (on "0021 merged, resume"): rebase on develop; the gate on both sets for the three combinations in Reiteration 1 (Parakeet without the previous text); the long buckets of Acceptance 8 with the fixed detector, before and after; the ship decision by the rule in Reiteration 1 (on only if a policy passes both sets); dev again for the replay, then develop's `dictate` restored.
Deferred: none.
`verify.log`'s round 4 blocks were written on 85768c5; the amend adds only them, these notes, Reiteration 1 and `reports/gate-2.md`.
