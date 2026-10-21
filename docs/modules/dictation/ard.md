---
updated: 2026-10-20
source: setup
---

# Dictation: architecture and debt

## 2026-10-20: Transcriber and Refiner are ports; v1 ships one adapter each

- Decision: speech to text and cleanup sit behind two ports chosen per request, defaulting to user settings; v1 adapters are `groq-whisper` (whisper-large-v3-turbo) and `openai` with `gpt-6-luna`.
- Alternatives rejected: `bedrock-claude` (Claude Haiku 5.5) as default refiner, `openai` STT, `aws-transcribe` and `groq` refine in v1.
- Reason: two adapters are enough to ship; Bedrock is not needed in v1 and may lag on model availability; the ports keep the switch open for the evaluation harness.
- Debt created: none.
- Revisit when: the evaluation harness (phase 7) adds the remaining adapters.
- Source: setup

## 2026-10-20: The API accepts WAV and m4a only

- Decision: desktop sends WAV 16 kHz mono 16-bit, mobile sends m4a; uploads are capped at 5 MB, about 2.5 minutes of WAV.
- Alternatives rejected: Opus from desktop, as the proposal had.
- Reason: both formats come straight from the recorders (cpal, expo-audio) with no encoder on the client.
- Debt created: WAV payloads are several times larger than Opus, which costs upload time and caps a desktop dictation at about 2.5 minutes.
- Revisit when: desktop payload size or upload time shows up in the per-stage latency.
- Source: setup

## 2026-10-20: Audio is never persisted; dictations keep text for 90 days

- Decision: audio is processed in memory; `DICTATION#ts` stores text and measurements with a 90-day TTL; dev may keep audio in a debug bucket with a one-day lifecycle.
- Alternatives rejected: storing audio for replay or evaluation.
- Reason: privacy and storage cost.
- Debt created: none.
- Revisit when: the evaluation harness needs real audio, which comes from its own golden set.
- Source: setup

## 2026-10-20: Per-user daily quota of 60 audio minutes

- Decision: `dictate` enforces a configurable daily cap per user before calling any provider.
- Alternatives rejected: relying on the account budget alarm alone.
- Reason: providers bill per use (Groq bills at least 10 s per request) and the account budget is 5 USD a month.
- Debt created: none.
- Revisit when: users other than Sebastian and his invitees, or pricing.
- Source: setup

## 2026-10-20: Silence never reaches the refiner

- Decision: clients drop recordings under 0.5 s; the server returns empty text without refining when the transcript is empty or a known silence hallucination.
- Alternatives rejected: refining every transcript.
- Reason: Whisper invents text on silence, and refining it would paste that text.
- Debt created: none.
- Revisit when: a hallucination gets pasted in real use.
- Source: setup

## 2026-10-20: No latency target in v1, only per-stage measurement

- Decision: each dictation records latency per stage and tokens; there is no target and no warm-keeping.
- Alternatives rejected: the proposal's target of under 1.5 s for a 10 s utterance.
- Reason: set the target from real numbers once the product works.
- Debt created: cold starts of `dictate` are paid by the user.
- Revisit when: the MVP works end to end; then measure cold versus warm per provider and consider a scheduled warm ping (provisioned concurrency would exceed the budget).
- Source: setup

## 2026-10-20: The dictionary feeds both stages as two projections

- Decision: the transcriber gets the top-ranked terms in Whisper's 224-token prompt; the refiner gets the full list with aliases as a correction table.
- Alternatives rejected: dictionary only in the refiner.
- Reason: the prompt fixes spelling at the source; the refiner handles homophones and near-misses with context.
- Debt created: none.
- Revisit when: an STT adapter without a prompt (Transcribe custom vocabularies are async per-user resources) joins.
- Source: setup
