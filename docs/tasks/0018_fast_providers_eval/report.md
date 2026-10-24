# 0018 Evaluation, round 2: report and recommendation

Measured 2026-10-24 from inside us-east-1 (dev eval Lambda, 1024 MB, arm64) through the production adapters, with the fixtures, gates and reports of 0017 plus samples of 30 to 120 s, and dated list prices and plans.
Generated reports, each reproducible with the command printed in it:

- [transcription-1.md](reports/transcription-1.md): 4 transcribers, 78 clips (66 of round 1 plus 12 of 41 to 106 s), one and both languages, 5 runs, 3120 calls.
- [cleanup-1.md](reports/cleanup-1.md): 6 cleanup settings on round 1's 33 cases plus 98 chained raws from suite 1, 3 runs, 2358 calls.
- [end-to-end-1.md](reports/end-to-end-1.md): production's `dictate()` inside the eval Lambda for 7 combinations on the 6 end-to-end cases and the 6 long ones, 5 runs, every call on a fresh connection, 420 dictations.
- [summary-1.md](reports/summary-1.md): every combination with gates, errors after cleanup, release to text and monthly cost.

The code commits the reports and run metas record (6e03bab, 8d9b882, 787a4b1, f494986, adf32ee) are kept as measured; the branch was rebased afterwards, and those commits stay reachable by the `eval/0018/*` tags.

## Spend

| Run | Provider calls, charged | Speech synthesis (Polly, list price) | Total |
|---|---|---|---|
| Suite 1 | 1.488 USD | about 1.19 USD (20,602 characters, synthesized at the start and at two resumes) | about 2.68 USD |
| Suite 2 | 0.518 USD | none | 0.518 USD |
| End to end | 1.053 USD | about 0.33 USD (8,482 characters, twice) | about 1.38 USD |

Every run stayed under 3 USD.
Polly was outside the runner's cost guard since 0017; this task found it and now records each synthesis in the run's spend and checks it against the cap before synthesizing.
The duration checks of the long samples and the smokes synthesized about 26,000 more characters (about 0.50 USD), outside any run.
Together ended at about 14.29 USD and Cerebras at about 14.56 USD of their 15 USD, far above the 5 USD floor.
Groq moved to its paid Developer tier at 2026-10-24T18:25Z (10 USD of credit, 5 USD monthly spend limit shared with production); this task's Groq spend since then is 0.041 USD, and Groq calls before it ran on the free plan.

## What decides it

One dictation language; release to text is production's `dictate()` in the Lambda on cases under 30 s plus round 1's measured client-to-API overhead; term errors and meaning changes are after cleanup, on each transcriber's own raws.

| Combination | Gates | Raw WER | Term errors | Meaning changes | Release to text P50 / P95 | Charged per heavy month |
|---|---|---|---|---|---|---|
| whisper-large-v3-turbo + gpt-5.4-nano (today) | fail: transcription hard gate | 2.6% | 5.9% | 1.9% | 1941 / 2617 ms | 1.20 USD |
| gpt-transcribe + gpt-5.4-nano | pass | 0.2% | 2.9% | 2.8% | 1972 / 3012 ms | 8.10 USD |
| gpt-transcribe + gpt-5.4-nano@none | fail: cleanup relative gate (long samples) | 0.2% | 3.5% | 0.0% | 1956 / 2643 ms | 8.10 USD |
| gpt-transcribe + gpt-5.6-luna@none | fail: cleanup relative gate (long samples) | 0.2% | 2.0% | 0.0% | 2212 / 3357 ms | 8.10 USD |
| gpt-transcribe + cerebras-qwen-3.8-27b@none | fail: cleanup relative gate | 0.2% | 1.6% | 0.0% | 1457 / 2570 ms | 12.03 USD |
| together-parakeet + cerebras-qwen-3.8-27b@none | fail: both stages, and cleanup of its raws | 4.0% | 5.5% | 8.3% | 1044 / 2197 ms | 6.63 USD |
| together-parakeet + cerebras-gpt-oss-120b@low | fail: both stages, and cleanup of its raws | 4.0% | 8.8% | 5.6% | 1004 / 1498 ms | 4.72 USD |

A heavy month is 7200 dictations of 15 s; Groq is now billed at list price, so today's pair is no longer free.

## Recommendation

1. Combination: `gpt-transcribe` with `gpt-5.4-nano` called as production calls it today.
   It is the only combination that passes every gate, and its release to text (1972 ms P50) is within 31 ms of today's pair at P50.
   It confirms round 1's transcriber choice: 0.2% raw WER against today's 2.6%, no invented content, hallucination or wrong language in 780 outputs.
2. Transcription: `gpt-transcribe`, as round 1 recommended; the faster candidates fail the hard gate.
   - `together-parakeet` is about three times faster per call (176 ms P50 on a fresh connection against 549 ms) and a third of the price (0.09 against 0.27 USD per hour), but it fails on its own garble alone: in all 10 outputs of extended-es-100 with one voice it turned "y dejar claro quién es responsable" into "y dejarlo en la vida. Claro quién es responsable", and end to end `gpt-oss-120b@low` pasted it unchanged in all 5 runs.
     Its other 20 flags are dev-en-1, where it writes "CI/CD" as "C slash C D", a spelled-out symbol more than invention.
     It takes no prompt, so its raw term errors are 20.3%; after cleanup its raws still carry 3.7% to 11.1% meaning changes against today's 1.9%, and under both languages it chose the wrong language for 25 of 360 dictations.
   - `together-whisper-large-v3` translated Spanish and mixed speech into English under both languages (25 outputs) and has 14.0% WER.
   - Today's `whisper-large-v3-turbo` fails the hard gate as in round 1 (60 hallucinations on noise), and on the 100 s English sample it invents whole sentences: 4 of its 5 end-to-end runs added text such as "so you can see the same link in the description below", and cleanup kept the invented text of one of them in what it pasted.
3. Cleanup: keep `gpt-5.4-nano` as production calls it; round 1's suggestion to call it at effort none and temperature 0 is not confirmed.
   - `gpt-5.4-nano@none` and `gpt-5.6-luna@none` fail only one check: on the chained raws of the 30 to 120 s samples, 15 of 54 outputs (27.8%) have a word outside the raw, the expected text and the allowed words, against 11 of 54 (20.4%) for the production call plus its 5.6% run-to-run spread.
     Those words are mostly English the speaker chose, rendered in Spanish: "El team de diseño" became "El equipo de diseño" (9 outputs of nano@none on extended-mixed-45), and "échale un look" became "échale un vistazo" (6 outputs on extended-mixed-100).
     Both have no meaning changes on any transcriber's raws (0.0% on gpt-transcribe's, against 2.8% for the production call), so this is a style difference measured on 54 outputs; `gpt-5.6-luna` stays nano's successor for 2027-04-01 once its loanword handling passes the long samples.
   - Cerebras is the fastest cleanup (`qwen-3.8-27b` at 117 ms P50 on a fresh connection against 654 ms for nano), and with gpt-transcribe it would release text in 1457 ms P50, about 500 ms sooner; but it changes meaning on round 1's cases (6.1% against 1.0% plus 3.0%), while `gpt-oss-120b@low` on Cerebras and `gpt-oss-20b@low` on Groq get dictionary terms wrong (7.7% and 5.8% against 2.6% plus 1.9%).

## What the production switch would need

- Register `openai-transcribe` with `gpt-transcribe` (the adapter exists since 0017): add it to `transcriberIds` and the registry, make it the default transcriber, keep production's 15 s timeout, and send `languages[]` as the eval did; the refiner stays as production calls it.
- Cost: about 8.10 USD charged in a heavy month and 0.54 USD in a light one (transcription at 0.27 USD per hour; nano inside OpenAI's complimentary tokens), against 1.20 and 0.08 USD for today's pair now that Groq is billed.
- Limits: transcription moves from Groq's account-wide limits, shared with dev and the 5 USD spend limit, to OpenAI's per-account limits.
- Long dictations: release to text on 30 to 120 s samples was 5501 ms P50 for the recommended pair (3915 ms in the Lambda), and the switch removes the invented sentences turbo pastes on long English audio.

## Other findings

- The in-Lambda end-to-end path reproduces the real one: today's pair measured 1941 ms P50 release to text against 1921 ms in round 1's dev end-to-end run.
- Groq's paid tier reports daily allowances nearly used (2320 of 200,000 requests left on the first paid call); the runner keeps fixed production floors of each reported allowance instead of half, which would have blocked it for a day.
- Two Lambda invocations failed request signing because the measuring machine's clock drifted; both retried, and failure rates now count only provider failures.
