---
updated: 2026-10-25
source: 0019_segmented_transcription
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
- Resolved by: 0015_user_context, 2026-10-23
- Revisit when: the follow-up adds `GET /me/usage`.
- Source: 0009_web_account

## 2026-10-21: Dictation languages live in settings and pick the transcription language

- Decision: `SETTINGS` holds `dictationLanguages`, one or both of `en` and `es`, default `["en"]`; with one, Whisper gets that language; with several, Whisper detects it (Groq's `verbose_json`, only English and Spanish names count), and a detected language outside the list, or none, transcribes the audio again in the first one; the quota is charged once, before transcription; the refiner and `DICTATION#` get the language used; meta `locale` is optional and ignored.
- Alternatives rejected: the device's language per request; always letting Whisper detect.
- Reason: the user knows which languages they speak, and a single language keeps Whisper from guessing on short or accented dictations.
- Debt created: with several languages, a dictation detected as neither costs a second transcription.
- Revisit when: re-transcriptions show up in cost or latency.
- Source: 0008_desktop_features

## 2026-10-21: Settings keep dictation languages across older clients

- Decision: a stored item without `dictationLanguages` reads as the language of its `locale`; `GET` keeps returning `locale`, derived from the first dictation language; a `PUT` without `dictationLanguages` keeps the stored ones and ignores any `locale` sent.
- Alternatives rejected: requiring the field on `PUT`; storing `locale` as sent.
- Reason: released desktops and the web replace the settings whole from schemas without the field, and must neither wipe the languages nor fail to parse.
- Debt created: none.
- Revisit when: every client sends `dictationLanguages`.
- Source: 0008_desktop_features

## 2026-10-23: The user's context is stored and shown, not used by dictation until a follow-up proves a gain

- Decision: settings hold up to three pick ids and a detail, captured by the desktop and shown on the web; neither the Whisper prompt nor the refiner instructions read them, so `dictate` behaves the same with any context.
- Alternatives rejected: a short hint after the terms in the Whisper prompt (0015 round 1); the context as a tagged background block for the refiner (0015 round 2).
- Reason: on frozen fixtures, the hint left raw errors unchanged where it fit and, with both languages, lost a whole English sentence under a Spanish hint; the refiner block moved domain-term errors from 35 to 34 under one language and 34 to 34 under both, and changed 3 Spanish verbs' meaning in 12 runs; the failing terms are recognition errors that field labels cannot recover.
- Debt created: the context is collected but unused.
- Revisit when: the per-field vocabulary task lands, measured on held-out fixtures.
- Source: 0015_user_context

## 2026-10-23: Clients show usage rounded up, clamped, and only when the server reports it

- Decision: `usedSeconds` may pass the cap; clients show started minutes (rounded up) capped at the allowance and the reset in local time; desktop hides the card on a 404 and shows an error line on other failures, while the web hides the row on any failure.
- Alternatives rejected: rounding to the nearest minute, which shows 0 after a short dictation; failing the web account page when usage fails.
- Reason: a user who just dictated should see the allowance move; the web account is read-only and must not fail over an informational row; older or self-hosted servers answer 404.
- Debt created: none.
- Revisit when: per-user caps arrive, or users ask for seconds.
- Source: 0015_user_context

## 2026-10-24: Provider latency is measured in a dev eval Lambda through an instrumented undici fetch

- Decision: the eval Lambda gives each adapter a fetch built on userland undici, with a new Agent for a fresh call and a kept-alive one otherwise; it encodes multipart bodies itself, counts new TLS connections through the `undici:client:connected` channel, and records time to headers, status and rate-limit headers; latency is grouped by the connection a call actually got.
- Alternatives rejected: measuring from the laptop or through `dictate`; the global fetch, which cannot force a fresh connection.
- Reason: production's numbers come from us-east-1, and whether a call paid a TLS handshake changes them; userland undici sends Node's global FormData as text, hence the encoding.
- Debt created: none.
- Revisit when: production adopts a dispatcher of its own, or Node's bundled undici exposes per-call agents.
- Source: 0017_eval_harness

## 2026-10-24: Evaluation gates are deterministic and relative to today's models

- Decision: the hard gate fails a candidate on any output that would paste wrong after production's level and phrase guards: 3 or more new words in a row, a known hallucination phrase, any text on noise, or text whose function words read as the other language; the relative gate compares WER, domain-term errors, meaning changes, single new words and failed attempts (429s apart) with today's models plus the spread of their per-run values.
- Alternatives rejected: an LLM judge; failing on any single new word, which measured how complete the allowed lists were.
- Reason: checks a reviewer can read in the report, the same definition of invented content in both suites, and a bar set by what users get today.
- Debt created: none.
- Revisit when: a suite needs judgments these checks cannot express, such as tone.
- Source: 0017_eval_harness

## 2026-10-24: Transcripts may carry the usage they were billed by

- Decision: `Transcript` has an optional `usage` (seconds or input and output tokens); `openai-transcribe` fills it and tolerates an unknown shape, production ignores it, and the evaluation prices token-billed models from it.
- Alternatives rejected: per-minute estimates for every model.
- Reason: the gpt-4o transcription models bill audio tokens, and the cost of a choice should come from measured use.
- Debt created: none.
- Revisit when: production records transcription cost per dictation.
- Source: 0017_eval_harness

## 2026-10-24: The evaluation paces itself to keep production's share of every free plan

- Decision: a ledger shared by every run counts the runner's own calls; per model it keeps half of each per-minute, hourly and daily limit free, daily ones over any trailing 24 hours, and Groq's own headers pause it further; Groq chat models, which production does not call, keep 10K tokens a day instead of half; a one-off `--whisper-daily-kept` lets Whisper go down to 10% left and is recorded in the run's report; a run seeds its 3 USD budget with what it already spent and resumes only when a digest of its requests and the eval bundle's hash match.
- Alternatives rejected: daily limits per UTC day, which Groq does not use; resuming by code commit, which refused resumes after changes that do not touch a request.
- Reason: dev, prd and the evaluation share one Groq and one OpenAI account; an unpaced attempt of this task hit turbo's per-minute limit.
- Debt created: none.
- Revisit when: production moves off Groq's free plan, or the evaluation gets accounts of its own.
- Source: 0017_eval_harness

## 2026-10-24: The eval request contract stays in `apps/api`

- Decision: the zod contract between the runner and the eval Lambda lives in `apps/api/src/eval/contract.ts`, not in `packages/shared`.
- Alternatives rejected: `packages/shared`, the home of client contracts.
- Reason: only `apps/api` uses it, on both sides, and no client calls the eval Lambda.
- Debt created: none.
- Revisit when: anything outside `apps/api` invokes the eval Lambda.
- Source: 0017_eval_harness

## 2026-10-24: Production's transcriber shares one per-minute limit across every user and environment

- Decision: no change in this task; the evaluation measured and reported that Groq's free plan allows 20 transcriptions a minute per account, shared by every user of prd and by dev.
- Alternatives rejected: none in this task; the switch to `gpt-transcribe` recommended by its report would move transcription to OpenAI's per-account limits.
- Reason: switching models is a separate task, and the limit is a property of the provider plan.
- Debt created: a few users dictating at once, or one `pnpm e2e` run on dev, can make prd dictations fail with 429.
- Revisit when: prd moves off `whisper-large-v3-turbo`, or a 429 from the transcriber in prd logs.
- Source: 0017_eval_harness

## 2026-10-24: The eval Lambda reads its provider keys through a loader of its own

- Decision: `src/eval/keys.ts` requires the four keys of the providers secret (Groq, OpenAI, Together, Cerebras) through a generic `cachedSecretJson` in `lib/secrets.ts`, which `cachedProviderKeys` now also uses with production's two-key schema unchanged.
- Alternatives rejected: adding the new keys to `providerKeysSchema`, which would make `dictate` fail on a secret without them.
- Reason: evaluation-only providers must not change what production requires or reads.
- Debt created: none.
- Revisit when: production registers a Together or Cerebras adapter.
- Source: 0018_fast_providers_eval

## 2026-10-24: Evaluation failure rates count only provider failures

- Decision: a failed attempt counts in a candidate's failure rate only when its message comes from an adapter (`<adapter>:<model> ...`); the harness's own failed calls to the eval Lambda, such as request-signing errors from a drifting clock, are listed apart in the reports.
- Alternatives rejected: counting every failed attempt, as 0017 did.
- Reason: two signing failures in suite 1 would have raised today's baseline failure rate and loosened that gate for every candidate.
- Debt created: none.
- Revisit when: an adapter's error message stops carrying its label.
- Source: 0018_fast_providers_eval

## 2026-10-24: On a paid plan the evaluation keeps fixed floors of each reported allowance

- Decision: a provider dated as paid in `prices.ts` (`paidPlans`; Groq since 2026-10-24T18:25Z) has no free-plan windows; its calls are charged at list price into the run cap, and the runner waits when a reported remaining count falls under a fixed floor (1000 requests, 7200 audio seconds, 20,000 tokens) or on `retry-after`; providers without a paid plan keep the half rule.
- Alternatives rejected: keeping half of every reported limit, which blocked turbo for 23 h 43 m on the first paid call; waiting only at zero, which could drain a budget prd shares.
- Reason: Groq's paid-tier headers reported 2320 of 200,000 requests left, so a share of the limit is meaningless, while the floors cover more than twice a heavy production day and two hours of audio per window.
- Debt created: none.
- Revisit when: Groq's paid-tier limits are confirmed in its console, or production's volume approaches the floors.
- Source: 0018_fast_providers_eval

## 2026-10-24: Speech synthesis counts in each evaluation run's cap

- Decision: before synthesizing clips, a run checks the Polly cost of its characters at list price against the 3 USD cap with what it already spent, and records each synthesis in its results.
- Alternatives rejected: leaving Polly outside the cost guard, as since 0017 (its price constant was unused).
- Reason: suite 1 synthesizes at its start and at every resume, about 0.40 USD each time, which can carry a run over its cap unseen.
- Debt created: none.
- Revisit when: clips are cached between resumes.
- Source: 0018_fast_providers_eval

## 2026-10-24: Candidate lists hold the current round; measured commits stay reachable by tags

- Decision: `evaluation/harness/candidates.ts` lists only round 2's candidates, with the dropped ones cited to 0017's report; every commit a report or run meta records keeps an `eval/0018/<sha>` tag, since rebases rewrite them.
- Alternatives rejected: keeping every round's candidates, which reruns retired models; rewriting the recorded hashes after a rebase.
- Reason: a report must reproduce from the commit it names, and a round's runs cost money only for the models it chose.
- Debt created: round 1's reports re-render only from their recorded commit.
- Revisit when: a round needs an earlier round's candidates again.
- Source: 0018_fast_providers_eval

## 2026-10-24: Production's transcriber now bills on Groq's paid tier and its daily allowance is unexplained

- Decision: no change in this task; the evaluation recommends moving to `gpt-transcribe` with `gpt-5.4-nano` as called today, and records that Groq moved to its paid Developer tier (5 USD monthly spend limit shared with production), whose first headers reported 2320 of 200,000 daily requests left while this task had made 761 in the 24 hours before.
- Alternatives rejected: none in this task.
- Reason: the switch is its own task, and the limits belong to the provider plan.
- Debt created: prd's turbo dictations are now billed (about 1.20 USD in a heavy month) and run against a daily allowance this task cannot explain.
- Revisit when: prd moves off `whisper-large-v3-turbo`, or Groq's console shows the paid-tier limits.
- Source: 0018_fast_providers_eval


## 2026-10-24: Provider choice is server-side only; each environment runs one pair

- Decision: `dictate` runs the transcriber and refiner named by `TRANSCRIBER` and `REFINER`, set per environment from `deployment.json` through Terraform; settings and the dictation meta no longer carry providers, old fields are accepted and ignored, and stored `providers` are dropped on the user's next save; this supersedes the per-request and per-user choice of 2026-10-20.
- Alternatives rejected: per-user providers in `SETTINGS`; a per-request override; an SSM parameter read at cold start.
- Reason: the pair is an operator's cost and quality choice, kept in one recorded config and switched without a code change.
- Debt created: both settings routes answer a fixed `providers` (`groq-whisper`, `openai`) because released desktops require it to parse.
- Revisit when: no released desktop older than 0021's build remains.
- Source: 0021_provider_switch

## 2026-10-24: One registry of ids and adapters for production and the evaluation, selected at cold start

- Decision: `packages/shared/src/providers.ts` lists the ids and the provider key each one needs; `providers/registry.ts` maps each id to an adapter, model, effort and temperature, and the eval Lambda and runner build candidates from it; `dictate` selects its pair during init with a top-level await, reading the secret once, and requires only the selected pair's keys; this revises "The eval Lambda reads its provider keys through a loader of its own" (2026-10-24), whose trigger fired.
- Alternatives rejected: eval-only adapter copies; selecting on the first request; requiring every key of the secret.
- Reason: a provider is written once and is both measurable and selectable; a wrong id or key fails visibly before any dictation, and the ids in shared let `deployment.json` refuse an unknown one before any apply.
- Debt created: none.
- Revisit when: a provider needs settings per environment beyond the id.
- Source: 0021_provider_switch

## 2026-10-24: With Parakeet selected, the dictionary reaches only the refiner

- Decision: `together-parakeet` is registered unprompted, so the Whisper prompt of top terms is not sent; the refiner still gets the full dictionary.
- Alternatives rejected: holding Parakeet out of the registry until it takes a vocabulary.
- Reason: 0018 measured it without a prompt; the 2026-10-20 entry on the two dictionary projections names this case as its trigger.
- Debt created: rare terms depend on the refiner alone under Parakeet.
- Revisit when: Parakeet is chosen for prd, or a user's terms go missing under it.
- Source: 0021_provider_switch

## 2026-10-25: Segments are transcribed by a stateless route and paid for with signed receipts

- Decision: `POST /dictations/segments` transcribes one segment of a take without refining or saving and answers its raw text with an HMAC receipt over user, text hash, seconds, language and issue time; the final `POST /dictations` sends the earlier texts with their receipts, which are verified before any charge; a segment checks the cap before transcribing and is charged with an unconditional `ADD` only after the provider answers (a provider failure charges nothing, a hallucinated segment is charged); the final charges only its own audio and passes the cap when its receipts are valid; receipts live 180 s, a final may not repeat one, and the take may not pass 120 s plus 2.
- Alternatives rejected: keeping segments server-side between requests; trusting the client's claimed seconds; charging the whole take in the final.
- Reason: the API stays stateless per request and every second is still charged from its bytes ("The charge comes from the bytes"), once, while a take started under the cap finishes.
- Debt created: inside 180 s a user can replay their own valid receipts in another final for one more refine without charge; a segment re-sent as audio after answering late is charged twice, at most one per take.
- Revisit when: refines without charge show up in usage, or the desktop sends more than one segment in flight.
- Source: 0019_segmented_transcription

## 2026-10-25: A requested language is honoured only within the user's dictation languages

- Decision: the final and segment meta may carry `language` (the first segment's detected language), and it is used only when it is one of the user's dictation languages; otherwise the request transcribes as if none was sent; this amends "Dictation languages live in settings and pick the transcription language", whose meta `locale` stays ignored.
- Alternatives rejected: detecting each segment's language anew; trusting any language a client sends.
- Reason: a take must not switch language mid-way, and a client may not widen the user's settings.
- Debt created: none.
- Revisit when: a third dictation language arrives.
- Source: 0019_segmented_transcription

## 2026-10-25: The segmentation gate cuts with the desktop's own detector

- Decision: `pnpm eval:segmentation` runs the desktop's `Detector` over each clip through an ignored cargo test on the Windows host, as a session drives it with nothing in flight, and transcribes each segment through the eval Lambda with production's adapter, prompt and language rule; words within two of a cut are counted apart for the whole take and the segments alike, and the relative gate of 0017 applies to the rest.
- Alternatives rejected: a port of the detector to TypeScript.
- Reason: a port measured a detector that does not ship; the gate's verdict is only worth what its cuts are.
- Debt created: none.
- Revisit when: the detector runs anywhere but the desktop.
- Source: 0019_segmented_transcription

