---
updated: 2026-10-21
source: setup
---

# Architecture and Debt Record

Global decisions, as a dated log, and the index of debt across modules.
Module-level decisions live in `modules/{{module}}/ard.md`.

## Decisions

## 2026-10-20: One public monorepo for every app, the infrastructure and the docs

- Decision: `sebasfles/take-my-word` holds `apps/api`, `apps/web`, `apps/desktop`, `apps/mobile`, `packages/shared`, `infra/` and `docs/`, as a pnpm workspace.
- Alternatives rejected: a docs root plus three code repositories (the first proposal).
- Reason: one set of contracts shared by every client, one place for tasks and docs, one CI with path filters; nothing here deploys separately enough to earn its own repository.
- Debt created: desktop (Rust) and mobile (EAS) tooling live next to Node tooling, and path filters must keep each app's CI independent.
- Revisit when: an app needs a release cadence or contributors the monorepo cannot serve.
- Source: setup

## 2026-10-20: Serverless backend on AWS behind one gate

- Decision: API Gateway HTTP API in front of Lambdas (`api`, `dictate`, `dictionary-usage`), one Lambda authorizer that validates Cognito JWTs, one DynamoDB table per environment, Secrets Manager for provider keys, OpenNext for the web.
- Alternatives rejected: containers or always-on servers; Vercel for the web; a relational database.
- Reason: usage is bursty and tiny, every access is per user, and AWS already covers hosting, auth and storage inside the project's own account.
- Debt created: see the module entries for cold starts and secret rotation.
- Revisit when: a query needs to cross users (admin views, the evaluation dashboard).
- Source: setup

## 2026-10-20: Ports and adapters for speech providers

- Decision: the pipeline depends on a Transcriber port and a Refiner port; each provider is an adapter chosen per request, defaulting to the user's settings. v1 ships `groq-whisper` and `openai` (`gpt-6-luna`).
- Alternatives rejected: calling one provider directly; shipping every adapter in v1.
- Reason: providers will be swapped and compared later without touching the pipeline, and shipping one adapter per port keeps v1 small.
- Debt created: none.
- Revisit when: the evaluation harness adds the remaining adapters.
- Source: setup

## 2026-10-20: Native clients, shared contracts

- Decision: Tauri 2 for desktop, Expo for mobile, Next.js for web, all consuming zod contracts from `packages/shared`.
- Alternatives rejected: Electron; bare React Native; one web app wrapped for every surface.
- Reason: desktop needs OS-level hooks (hotkey, paste, active window) in a small binary; mobile needs store delivery without a hand-made pipeline; contracts keep the three clients honest against one API.
- Debt created: Rust as a second language in the repository.
- Revisit when: the Rust layer grows past OS glue.
- Source: setup

## Debt index

Open debt only: an entry with `Resolved by` leaves the table.
Rebuilt by `write-ard` on every run, kept current by `document-task` on every task.

| Module | Date | Debt | Revisit when |
|---|---|---|---|
| general | 2026-10-20 | Rust and EAS tooling next to Node tooling; CI path filters must keep apps independent | An app needs its own cadence or contributors |
| auth | 2026-10-20 | No Google sign-in until phase 6; password resets by hand until then | Phase 6, or accounts beyond the invited circle |
| auth | 2026-10-20 | A leaked refresh token stays valid until revoked | Accounts open beyond invited users |
| auth | 2026-10-20 | Three login forms to keep in step; PKCE joins them in phase 6 | Phase 6 starts |
| auth | 2026-10-21 | A revoked session works until its access token expires, up to 1 h plus the 5 min authorizer cache | Accounts beyond invited users, or immediate revocation needed |
| auth | 2026-10-21 | Desktop and mobile must confirm their device and send `DeviceKey` on every refresh | Phases 2 and 4 build their logins |
| auth | 2026-10-21 | Web renewals outside a browser with Web Locks can race and lose the session | A non-browser client uses the web session, or two tabs lose it |
| auth | 2026-10-21 | A browser-session web login closed without sign-out leaves its refresh token and device in Cognito | Devices pile up, or accounts open beyond invited users |
| dictation | 2026-10-20 | Cold starts of `dictate` paid by the user | MVP works end to end; measure cold vs warm |
| dictation | 2026-10-21 | Audio part capped at 4 MiB: desktop WAV about 2 min, m4a about 8 | Desktop users hit the cap, or Opus joins |
| dictation | 2026-10-21 | One daily cap for every user; the per-user override is not built | One user needs a different cap |
| dictation | 2026-10-21 | m4a level is not measured, so its ambiguous phrases are always refined | Phase 4, when mobile drops silence with expo-audio metering |
| dictation | 2026-10-21 | Loud noise can make Whisper loop on mixed hallucinations that get refined | A hallucination loop gets pasted in real use |
| dictation | 2026-10-21 | A history page over many expired items costs one Query per batch until TTL deletes them | TTL lag leaves more than a page of expired items in a partition |
| dictionary | 2026-10-21 | Folding merges ñ and umlauts with their base letter; such terms cannot coexist | A user needs two terms that differ only by ñ or an umlaut |
| dictionary | 2026-10-21 | The byte budget leaves part of Whisper's 224 prompt tokens unused | Users keep more top terms than fit and transcription misses them |
| styles | 2026-10-20 | Elevated windows on Windows reject synthetic input (UIPI) | Sebastian needs to dictate into elevated windows |
| styles | 2026-10-21 | A failed release after a style delete leaves a rule naming that style | A client shows a dangling style to a user |
| desktop | 2026-10-20 | Rust toolchain in a TypeScript monorepo | Rust layer grows past OS glue |
| desktop | 2026-10-20 | macOS first run needs the Fn setting changed and Accessibility granted | An OS update breaks the hook, or toggle mode is requested |
| desktop | 2026-10-20 | Larger uploads than Opus; long dictations hit the cap sooner | Payload size shows in latency or users hit the cap |
| desktop | 2026-10-20 | Clipboard managers see the text briefly | Users report missed pastes in an app class |
| mobile | 2026-10-20 | Phone dictation needs an extra copy or share step | v2 keyboard extension |
| infra | 2026-10-20 | Infra changes wait for Sebastian's machine; no drift detection | Someone else needs to change infrastructure |
| infra | 2026-10-20 | A rotated key reaches warm Lambdas only on environment recycle | A key is rotated or leaked |
| infra | 2026-10-20 | Cold starts on the first dictation after idle time | Parked latency work starts |
| infra | 2026-10-21 | Old web chunks stay in the assets bucket forever | The bucket's size shows on the bill |
| infra | 2026-10-21 | The web's CSP restricts framing only, no `script-src` | The web renders others' content or adds third-party scripts |
