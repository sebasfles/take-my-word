---
updated: 2026-10-21
source: 0009_web_account
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
- Resolved by: 2026-10-21 "The audio part is capped at 4 MiB, replacing 5 MB" (0001_platform_skeleton)
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

## 2026-10-21: The audio part is capped at 4 MiB, replacing 5 MB

- Decision: `dictate` answers 413 for an audio part over 4 MiB (4,194,304 bytes); API Gateway itself answers 413 above about 4.7 MB, where the base64 body passes the 6 MiB Lambda payload.
- Alternatives rejected: a presigned S3 upload, which would persist audio.
- Reason: the synchronous Lambda payload is the real ceiling, and one request keeps every client simple.
- Debt created: a desktop WAV dictation is capped at about 2 minutes (m4a at about 8).
- Revisit when: desktop users hit the cap, or Opus joins the accepted formats.
- Source: 0001_platform_skeleton

## 2026-10-21: The charge comes from the bytes, not from what the header claims

- Decision: WAV must be 16 kHz mono 16-bit PCM and is charged by the bytes after its data chunk header; m4a is charged the larger of its declared duration and its size at 320 kbps; under 0.5 s answers 400.
- Alternatives rejected: trusting the header's duration; answering 400 when an m4a header claims less than its size allows.
- Reason: a header claiming zero seconds would reach Groq uncharged; the floor keeps a legitimate high-bitrate m4a working.
- Debt created: none.
- Revisit when: a client needs another WAV layout.
- Source: 0001_platform_skeleton

## 2026-10-21: The daily quota is one conditional counter per UTC day

- Decision: `QUOTA#YYYY-MM-DD` under the user gets an atomic `ADD seconds` while the stored value is under the cap; the real duration is charged before transcription, never refunded, and the last allowed recording may overshoot the cap.
- Alternatives rejected: counting dictations; reserving the duration first and refunding failures; a per-user cap stored on `SETTINGS`, deferred until one user needs it.
- Reason: providers bill minutes; DynamoDB serializes the condition, so concurrent requests overshoot by at most one recording (six parallel requests at the cap let two through).
- Debt created: `DAILY_QUOTA_MINUTES` is one cap for every user; the prd's per-user override is not built.
- Revisit when: one user needs a different cap.
- Source: 0001_platform_skeleton

## 2026-10-21: Silence on WAV is decided by measuring the audio

- Decision: the WAV probe measures the RMS of the fifth-loudest 30 ms frame (the level at least 150 ms reaches); under `SILENCE_FLOOR_DBFS` (-55) the request answers empty text before the quota and any provider, and is not charged; known hallucinations always answer empty text; ambiguous phrases ("Gracias.", "Thank you.") do only on WAV under `SPEECH_LEVEL_DBFS` (-40). Silence is never saved.
- Alternatives rejected: Whisper's `no_speech_prob`, which Groq reports as 0 on `whisper-large-v3-turbo` even for digital silence; the loudest frame, which one click lifts to about -27 dBFS; a phrase list alone, which drops real one-word replies.
- Reason: measured in dev, near-silence sits at -70.6 dBFS, the quietest spoken sample at -47.9 and normal speech at -17.9; WAV needs no decoder to measure.
- Debt created: m4a is not measured, so its ambiguous phrases are always refined and only unambiguous hallucinations drop; loud non-speech noise can make Whisper loop on mixed hallucination phrases, which the whole-transcript guard misses and the refiner turns into text.
- Revisit when: phase 4, when mobile drops silent recordings with expo-audio metering; or a hallucination loop gets pasted in real use.
- Source: 0001_platform_skeleton

## 2026-10-21: The refiner defaults to `gpt-5.4-nano`; models are adapter settings

- Decision: `openai` defaults to `gpt-5.4-nano` through the Responses API and `groq-whisper` to `whisper-large-v3-turbo`, each changeable by `OPENAI_MODEL` and `GROQ_WHISPER_MODEL`; labels carry the model (`openai:gpt-5.4-nano`) in responses, saved items and metrics.
- Alternatives rejected: `gpt-6-luna` as the default, as the setup entry has it.
- Reason: the project's OpenAI credits cover `gpt-5.4-nano`, and the label keeps a model switch visible in data.
- Debt created: none.
- Revisit when: the evaluation harness compares refiners.
- Source: 0001_platform_skeleton

## 2026-10-21: Dictations keep the raw transcript next to the clean text

- Decision: `DICTATION#ts` stores `raw` and `text`, written once with `attribute_not_exists` under an ISO-time plus request-id sort key; skipped silence is not saved.
- Alternatives rejected: storing only the clean text.
- Reason: raw shows what the refiner changed, for history and for the evaluation harness, at no audio cost.
- Debt created: none.
- Revisit when: history needs to hide raw from the user.
- Source: 0001_platform_skeleton


## 2026-10-21: Settings are replaced whole and read with per-field defaults

- Decision: `PUT /me/settings` replaces the whole `SETTINGS` item and refuses a default style that does not exist; on read, any stored field that no longer parses (a removed provider, a malformed locale) falls back to that field's default instead of failing.
- Alternatives rejected: a partial update on `PUT`; failing the read on an invalid field.
- Reason: clients read the settings before editing them, so a full replace keeps one shape and one validation; per-field defaults keep `dictate` and the settings screen working when a provider is retired.
- Debt created: none.
- Revisit when: two clients edit settings at the same time and overwrite each other.
- Source: 0003_api_features

## 2026-10-21: History hides expired dictations and refills short pages

- Decision: the history Query filters `expiresAt > now`; since DynamoDB applies `Limit` before the filter, the store queries again from `LastEvaluatedKey` for the remaining count until the page is full or the partition ends, and the cursor is the last returned item's sort key; `limit` is 1 to 100, default 20; ids and cursors are unpadded base64url and a malformed one answers 400.
- Alternatives rejected: trusting TTL, which deletes days after expiry; a single Query that may return a short or empty page with a cursor.
- Reason: the product promises text for 90 days, not 90 days plus TTL lag, and a client should never get an empty page while older items exist.
- Debt created: a page over many expired items costs one Query per item batch until TTL catches up.
- Revisit when: TTL lag leaves more than a page of expired items in a partition.
- Source: 0003_api_features

## 2026-10-21: The web history re-reads every shown page and stops at 1000 dictations

- Decision: `/app/history?limit=&pages=` renders `limit * pages` dictations on the server, read from the API in requests of at most 100, asking for one more than it shows to know whether "load more" applies; at 1000 shown the link disappears.
- Alternatives rejected: rendering only the page after a cursor, which loses the earlier pages on refresh; appending pages in the browser, which needs the API from client code.
- Reason: the list survives a delete and a refresh exactly as the user left it, every read stays on the server, and one render costs at most 11 requests.
- Debt created: dictations past the newest 1000 are not reachable on the web.
- Revisit when: a user keeps more than 1000 dictations in 90 days.
- Source: 0009_web_account

## 2026-10-21: The web shows no daily quota until the API exposes usage

- Decision: the Account page leaves the daily quota out; the cap lives only in `dictate`'s `DAILY_QUOTA_MINUTES` and no route returns the minutes used.
- Alternatives rejected: hardcoding the cap in the web; reading `QUOTA#date` from the web function.
- Reason: the web reads only through the API and its shared contracts.
- Debt created: users cannot see how much of the day's allowance is left.
- Revisit when: the follow-up adds `GET /me/usage`.
- Source: 0009_web_account
