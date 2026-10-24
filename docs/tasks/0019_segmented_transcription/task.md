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

## om-developer notes
