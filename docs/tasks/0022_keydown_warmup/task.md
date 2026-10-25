---
id: "0022"
title: keydown_warmup
type: feature
crew: pair
clearance: full
branch: feat/0022_keydown_warmup
modules: [dictation, desktop, infra]
repos: ["."]
phases: 0
depends_on: []
ticket:
created: 2026-10-25
updated: 2026-10-25
---

# 0022 Warm the dictation path when a take starts

## Goal

A cold `dictate` Lambda adds about 1.5 s to the first dictation after a quiet spell (0017: release to text 3.4 s cold against 1.9 s warm), and half of the production dictations are under 10 s, where segmented transcription (0019) does not help.
When a take starts, the desktop app wakes the dictation path while the user speaks, so on release the Lambda is warm and its provider connections are open.

## Scope

- Key down (hold and hands-free) sends a small authenticated warm-up request; it wakes `dictate` and opens TLS to the environment's configured transcriber and refiner (0021) while the user speaks.
- Fire and forget: a failed, slow or refused warm-up never delays, blocks or fails the take; at most one in flight.
- Provider clients live outside the handler, so a warm `dictate` reuses its connections across dictations; if they already do, keep and test it.
- The warm-up charges no quota, saves nothing, never touches audio or text, and logs one line without user content.
- Old servers: a 404 on the warm-up route turns warm-ups off for that server (`docs/modules/desktop/ard.md` "A self-hosted server older than the app may miss routes").
- Measure release-to-paste on the desktop, cold and warm, before and after, by audio length bucket, with the measurement tooling 0019 left; the cold case is a Lambda left idle long enough to go cold.

## Out of scope

- Mobile (its own decision later).
- A scheduled ping, provisioned concurrency, or an always-on server.
- Provider or prompt changes, and turning segmentation on.
- The desktop release (the operator ships it).

## Acceptance

1. Key down sends one warm-up request per take; hold and hands-free both; none for a tap shorter than the existing debounce.
2. With the Lambda cold, the first take's release-to-paste drops by at least the cold-start difference measured before, within the run-to-run spread; warm takes do not get slower.
3. A warm-up that fails, times out or answers 404 leaves the take exactly as today (tested with injected failures and delays); after a 404 no more warm-ups go to that server.
4. The warm-up is authenticated, charges no quota, writes nothing to the table, and its log line carries no user content.
5. Provider connections are reused across warm dictations (test on the adapters' HTTP agent or equivalent).
6. Idle RAM and CPU of the desktop app do not rise.
7. The task report has release-to-paste P50 and P95, cold and warm, before and after, by bucket.

## Approach

- Module and layers touched: desktop dictation worker and API client (Rust), a warm-up route served by `dictate`, shared contracts in `packages/shared` and the desktop mirror, the HTTP API routes in Terraform.
- Entities, endpoints, tables: one warm-up route on the HTTP API, served by `dictate`; no tables.
- Decisions:
  - Warm-up on key down from the client, chosen over a scheduled ping because it warms exactly when needed, costs one tiny request per take, and also opens provider connections inside the instance that will serve the take.

## Database

None.

## Infra

- New route on the HTTP API served by `dictate`; dev apply for the measurements; `pnpm tf prd plan` only.
- No new secrets.

## Design

None (no visible change).

## Risks

- API Gateway may route the warm-up and the dictation to different Lambda instances; concurrency 1 per user is the common case, but the measurement must show it.
- Too-early warm-ups on accidental taps waste invocations; the debounce gates them.
- The Windows host is shared with the operator; runs go under the idle guard.

## Depends on

None. 0019 (merged) left the replay tooling this task measures with.

## Context & decisions

- Gesture (Sebastian): the warm-up fires at the first press, with no gate, for hold and hands-free alike; the 0.5 s head start matters most for short holds against a cold start of about 1.5 s, and an accidental tap costs one tiny invocation.
  At most one warm-up in flight, and none again until that take ends.
- Acceptance 1 adjusted (Sebastian): "The first press of a take sends one warm-up request; hold and hands-free both; a discarded tap may have sent one; never a second while one is in flight or before the take ends."
- Scope adjusted (Sebastian): the warm-up also does one GetItem on the user's `QUOTA#today` (a number, nothing written; `dictate`'s role already allows GetItem) to open the DynamoDB connection and pay the SDK's first-call cost; it also warms the authorizer and fills its 5 min cache.
- Keep-alive (om-reviewer): 0017's report found Node's default keep-alive drops provider connections after about 4 s, and none of the four providers sends a keep-alive hint, so Scope 3 is not already met.
  Provider calls get a dispatcher of their own whose keep-alive covers a 2 min take plus processing; a call that fails on a reused connection before any response is retried once on a new connection, so a socket left stale by a Lambda freeze never fails a take.
  This revises `docs/modules/dictation/ard.md` 2026-10-24 "Provider latency is measured in a dev eval Lambda through an instrumented undici fetch" and, if userland undici joins production, `src/eval/production-bundles.test.ts` (eval code stays out); shared with the eval's fetch, never a copy.
- Provider preconnect (om-reviewer): opens each origin of the environment's pair without the provider key (an unauthenticated request answered 401 keeps the connection), so it never bills and never counts against any limit; the warm-up handler awaits it within a short bound so the instance is not frozen mid-handshake, and always answers success to the client.
- Route (om-reviewer): one authenticated route on the HTTP API served by `dictate`, path and response in `packages/shared` and the desktop mirror (`pnpm contract`); no quota, no write, no audio, no text; one log line with ids, timings, new connections and whether the instance was cold.
- Old servers (om-reviewer): a 404 turns warm-ups off in memory until the server is switched or the app restarts, like segments' `Support`; the PR asks the operator to run `pnpm tf prd apply` before the desktop release.
- Measurement (Sebastian on method, om-reviewer on detail): the 0019 replay (`replay.rs`), driving the same warm-up code the app runs, not a replay-only copy; before is develop's `dictate` with warm-ups off, after is the branch's with warm-ups on; buckets of 0019 (under 10, 10 to 30, 30 to 60, 60 to 120 s), the under-10 one with takes of 1 to 3 s.
  Cold samples are forced by swapping the same code to `dictate` and the authorizer plus a fresh token (missing the authorizer cache), with 3 truly idle cold takes per arm to show the forced ones fall within their spread; every cold sample is proven by the REPORT line's `Init Duration`.
  Per take the report says whether the dictation ran in the warm-up's instance (log stream) and whether the warm-up had answered by release; such takes are counted and reported, never dropped (Risk 1); Acceptance 2 is judged per bucket.
- Pair (Sebastian): `providers.dev` set to prd's pair (`whisper-large-v3-turbo` + `cerebras-qwen-3.8-27b@none`), `pnpm tf dev apply`, restored afterwards; OpenAI is out of credit, nothing in this task may call OpenAI.
- Constraints: contracts first and ports and adapters (`docs/TRD.md` Conventions); the warm-up never blocks the session thread or the dictation worker (`docs/modules/desktop/trd.md`); no text or audio in logs (`docs/modules/dictation/trd.md`); Groq pacing per `docs/modules/dictation/ard.md`.
- Review beyond the Pipeline: injected warm-up failures, delays and 404 leave the take as today (Acceptance 3); the reuse test must fail on today's code, that is reuse after an idle longer than 4 s (Acceptance 5); the stale-socket retry is tested; idle RAM and CPU against the base build (Acceptance 6); `document-task` resolves or revises the cold-start debts (dictation and infra, 2026-10-20) and the desktop old-server entry.
- clearance: full: `pnpm tf dev plan` and `apply` for the route and `providers.dev`, `pnpm tf prd plan` only; branch and develop `dictate` and authorizer swapped on dev, then develop's build and dev's pair restored; dev CloudWatch logs read for REPORT lines; desktop debug builds and the replay on the Windows host against dev under the idle guard, with a throwaway user deleted afterwards; no prd apply, no desktop release, no OpenAI calls.

## om-developer notes
