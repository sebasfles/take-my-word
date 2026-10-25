# Segmentation quality gate

Generated 2026-10-25T03:03:40.505Z by `pnpm --filter @take-my-word/api eval:segmentation --results ../.verify/gate/r5-together-parakeet-noise60 --report docs/tasks/0019_segmented_transcription/reports/gate-together-parakeet-noise60.md --runs 5` on code `e8b5d33685dd14661c2db718ad4a5c8712b95ee3`.
5 runs of 12 clips (the extended samples, every voice), each language setting, transcribed whole and segment by segment with together-parakeet.
Cuts come from the desktop's detector as a session makes them with no request in flight; later segments use the first segment's language, and segments go through the level floor and the silence guard.
together-parakeet takes no prompt, so its segments carry neither the terms nor the previous text.
White noise at -60 dBFS is added to every clip, like a microphone's floor, before cutting and transcribing both arms.
Spend charged: 0.639 USD.
Groq moved from its free plan to its paid Developer tier at 2026-10-24T18:25:00.000Z, with 10.00 USD of credit and a 5.00 USD monthly spend limit that the account shares with production; its calls from then on are charged at list price and count in the run cap, and pace on its rate-limit headers, keeping 1000 requests, 7200 audio seconds and 20000 tokens of each reported allowance for production; this task's Groq spend since then is 1.548 USD

## Verdict

Neither policy passes on this set.

- 10/20: one: 15 hard-gate flags against the whole take's 10; both: 15 hard-gate flags against the whole take's 10
- 20/30: one: term errors 17.9% above the whole take's 17.3% plus its spread 0.0%; both: term errors 17.9% above the whole take's 17.3% plus its spread 0.0%

Gate: WER away from the cuts and term errors within the whole take's value plus its run-to-run spread, per language setting; no more hard-gate flags or failed takes than the whole take.
Words within two words of a cut are counted apart, for both arms, in the same places.

## Quality

| Policy | Languages | WER whole | WER segmented | Away from cuts, whole (spread) | Away from cuts, segmented | Boundary errors whole | Boundary errors segmented | Term errors whole | Term errors segmented | Flags whole / segmented |
|---|---|---|---|---|---|---|---|---|---|---|
| 10/20 | one | 2.8% | 3.6% | 2.9% (0.0%) | 2.8% | 0 of 780 | 130 of 780 | 17.3% | 16.8% | 10 / 15 |
| 10/20 | both | 2.8% | 3.6% | 2.9% (0.0%) | 2.8% | 0 of 780 | 130 of 780 | 17.3% | 16.8% | 10 / 15 |
| 20/30 | one | 2.8% | 2.6% | 2.7% (0.0%) | 2.3% | 20 of 480 | 45 of 480 | 17.3% | 17.9% | 10 / 0 |
| 20/30 | both | 2.8% | 2.6% | 2.7% (0.0%) | 2.3% | 20 of 480 | 45 of 480 | 17.3% | 17.9% | 10 / 0 |

## Prompt split

| Policy | Languages | Segments sent | Terms bytes per segment | Previous text bytes, mean | Previous text bytes, max |
|---|---|---|---|---|---|
| 10/20 | one | 255 | 0 | 0 | 0 |
| 10/20 | both | 255 | 0 | 0 | 0 |
| 20/30 | one | 180 | 0 | 0 | 0 |
| 20/30 | both | 180 | 0 | 0 | 0 |

## Pauses in the samples

Quiet runs as the detector classifies its levels, counted over every clip.

| Clips | Minutes | 400 ms or more | 600 ms or more | 800 ms or more |
|---|---|---|---|---|
| 12 | 14.0 | 132 (9.4 per minute) | 29 (2.1 per minute) | 0 (0.0 per minute) |

## Cuts

| Clip | Seconds | Policy | Cuts at (s) | Pause cuts | Forced cuts | Spans without speech |
|---|---|---|---|---|---|---|
| extended-en-45/Joanna | 45.7 | 10/20 | 19.8, 30.7, 40.7 | 2 | 1 | 0 |
| extended-en-45/Joanna | 45.7 | 20/30 | 29.9 | 0 | 1 | 0 |
| extended-en-45/Matthew | 41.4 | 10/20 | 19.3, 39.4 | 0 | 2 | 0 |
| extended-en-45/Matthew | 41.4 | 20/30 | 29.9 | 0 | 1 | 0 |
| extended-en-100/Joanna | 105.8 | 10/20 | 19.3, 38.8, 58.2, 78.1, 97.8 | 0 | 5 | 0 |
| extended-en-100/Joanna | 105.8 | 20/30 | 30.0, 60.0, 89.9 | 0 | 3 | 0 |
| extended-en-100/Matthew | 97.7 | 10/20 | 19.6, 39.0, 58.8, 78.4 | 0 | 4 | 0 |
| extended-en-100/Matthew | 97.7 | 20/30 | 29.6, 58.8, 88.1 | 0 | 3 | 0 |
| extended-es-45/Lupe | 49.2 | 10/20 | 15.0, 30.9 | 2 | 0 | 0 |
| extended-es-45/Lupe | 49.2 | 20/30 | 29.9 | 0 | 1 | 0 |
| extended-es-45/Andres | 43.6 | 10/20 | 19.9, 39.1 | 0 | 2 | 0 |
| extended-es-45/Andres | 43.6 | 20/30 | 29.3 | 0 | 1 | 0 |
| extended-es-100/Lupe | 105.0 | 10/20 | 19.1, 38.3, 58.3, 78.0, 97.8 | 0 | 5 | 0 |
| extended-es-100/Lupe | 105.0 | 20/30 | 29.1, 58.9, 82.3 | 1 | 2 | 0 |
| extended-es-100/Andres | 90.4 | 10/20 | 19.5, 38.9, 58.2, 78.2 | 0 | 4 | 0 |
| extended-es-100/Andres | 90.4 | 20/30 | 29.6, 59.3, 88.7 | 0 | 3 | 0 |
| extended-mixed-45/Pedro | 40.8 | 10/20 | 20.0, 39.3 | 0 | 2 | 0 |
| extended-mixed-45/Pedro | 40.8 | 20/30 | 29.1 | 0 | 1 | 0 |
| extended-mixed-45/Mia | 41.8 | 10/20 | 19.6, 39.3 | 0 | 2 | 0 |
| extended-mixed-45/Mia | 41.8 | 20/30 | 29.5 | 0 | 1 | 0 |
| extended-mixed-100/Pedro | 86.6 | 10/20 | 19.9, 39.6, 50.0, 69.3 | 2 | 2 | 0 |
| extended-mixed-100/Pedro | 86.6 | 20/30 | 29.2, 50.0, 79.9 | 1 | 2 | 0 |
| extended-mixed-100/Mia | 90.6 | 10/20 | 19.1, 39.1, 58.7, 78.0 | 0 | 4 | 0 |
| extended-mixed-100/Mia | 90.6 | 20/30 | 29.8, 59.0, 88.9 | 0 | 3 | 0 |
