# 0017 Evaluation, round 1: report and recommendation

Measured 2026-10-23 from inside us-east-1 (dev eval Lambda, 1024 MB, arm64) through the production adapters, with dated list prices and plans.
Generated reports, each reproducible with the command printed in it:

- [transcription-1.md](reports/transcription-1.md): 5 transcribers, 66 clips (Polly neural, 6 voices, es, en, mixed, about 15 s dictations, quiet speech, noise), one and both languages, 5 runs, 3300 calls.
- [cleanup-1.md](reports/cleanup-1.md): 5 models in 2 settings each, 33 raws (13 captured from suite 1), 3 runs, 990 calls.
- [summary-1.md](reports/summary-1.md): every transcriber and cleanup combination with gates, error rates, combined latency and monthly cost.
- [end-to-end-1.md](reports/end-to-end-1.md): 6 sentences through the dev API with today's pipeline.
- [reproduction-1.md](reports/reproduction-1.md): a second transcription run against the first.

Spend of all runs so far: 1.59 USD charged (OpenAI and Polly); Groq on its free plan.

## What decides it

| Combination | Gates | WER | Term errors | Meaning changes | Provider latency P50 / P95, reused | Charged per heavy month |
|---|---|---|---|---|---|---|
| whisper-large-v3-turbo + gpt-5.4-nano (today) | fail both | 3.6% | 10.1% | 2.0% | 1104 / 1577 ms | 0.00 USD |
| gpt-transcribe + gpt-5.4-nano, effort none, temperature 0 | pass | 0.5% | 0.6% | 0.0% | 1335 / 1696 ms | 8.10 USD |
| gpt-transcribe + gpt-5.6-luna, effort none, temperature 0 | pass | 0.5% | 0.6% | 0.0% | 1544 / 2291 ms | 8.10 USD |

One dictation language; under both languages gpt-transcribe stays at 0.8% WER and 1.1% term errors.
A heavy month is 7200 dictations of 15 s (30 hours); a light month (480) costs 0.54 USD charged.

## Recommendation

1. Transcription: move to `gpt-transcribe`.
   It is the only transcriber that passes the hard gate: it returned nothing on any noise take, while today's turbo pasted invented phrases on all six ("and the other side of the screen.") and both gpt-4o models pasted the dictionary prompt itself.
   It cuts WER from 3.6% to 0.5% and domain-term errors from 10.1% to 0.6%, reports the detected language (so "both" rarely transcribes twice), and is not scheduled for retirement.
   It costs about 200 ms more at P50 (545 against 336 ms per call) and has no free allowance: 0.0011 USD per dictation, about 8 USD in a heavy month.
2. Cleanup: keep `gpt-5.4-nano`, called with effort `none` and temperature 0.
   Production already runs at effort none, so temperature 0 is the only change: that setting had no invented content and no meaning change in its 99 outputs, against one invented-content case (numerals made up for "a secto 193") and two meaning changes in the production call's, at the same cost and latency.
   `gpt-5.4-nano` retires on 2027-04-01: `gpt-5.6-luna` at effort none also passes every gate (about 200 ms slower at P50) and is the planned successor, inside the same complimentary token group.
3. Not recommended:
   - `gpt-6-luna`, OpenAI's named replacement for nano: more dictionary term errors and a long tail (P95 3.8 to 13 s).
   - `gpt-oss-120b` and `gpt-oss-20b`: fastest (20b at effort low: 305 ms P50) but more term errors and meaning changes, and 120b answered a dictated "ignore the previous instructions" with a refusal that would be pasted.
   - `whisper-large-v3`, `gpt-4o-transcribe` and `gpt-4o-mini-transcribe`: hard-gate failures on noise; the gpt-4o models also retire on 2027-02-26, and `gpt-4o-transcribe` translated an English sentence into Spanish in 7 of 10 runs.

The production switch is a separate task: a `gpt-transcribe` adapter is now in the code but not registered; the switch adds it to `transcriberIds` and the registry and sets temperature 0 on the refiner.

## Other findings

- Whisper's hallucinations on noise survive today's silence guard because the phrases are new; the phrase list cannot keep up with them, which is the 0001 debt this run measured.
- Groq's free plan is per account and shared by dev and prd: an unpaced end-to-end attempt of this task sent dictations 1.6 s apart and 9 of 33 got 429 from turbo's 20 requests per minute, for about a minute at 21:28 UTC on 2026-10-23; the suite now paces itself, and the attempt is kept out of the reports.
  Whether prd dictations failed in that minute is not verified, since prd logs are outside this task's clearance; prd's `dictate` logs show it, as "provider failed" lines with status 429 between about 21:27 and 21:30 UTC on 2026-10-23.
- That limit is account-wide: 20 transcriptions per minute across every user and both environments, so a few users dictating at once, or one `pnpm e2e` run on dev, can make prd dictations fail with 429 today; the switch task should weigh it, since `gpt-transcribe` runs under OpenAI's per-account limits instead.
- Latency a user feels on dev (client to us-east-1, warm Lambda): 1.6 to 1.8 s P50 release to text; in the unpaced attempt's three cold requests a cold `dictate` added about 1.4 s, with 430 to 570 ms of init; the paced run found the Lambdas warm, and its cold rerun is pending.
  A normal dictation pays fresh provider connections, since Node's default keep-alive drops them after about 4 s; on fresh connections turbo was 385 ms and gpt-transcribe 592 ms at P50.

## Reproduction

The second transcription run reproduces the quality numbers: gpt-transcribe 0.5% and 0.8% WER in both runs, gpt-4o-mini within 0.2 points, Whisper within 0.3 points on the calls done so far, the same hard-gate failures and the same language flips.
`gpt-4o-transcribe` under both languages moved from 1.8% to 0.7% WER, inside the 0.1% to 1.8% per-run spread of the first run.

## Pending

- The second run's Groq calls (205) and a cold-start end-to-end run resume after 2026-10-24 19:08 UTC, when Whisper's 24-hour share allows; both update `reproduction-1.md` and `end-to-end-1.md`.
