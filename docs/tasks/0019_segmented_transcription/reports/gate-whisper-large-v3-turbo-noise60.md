# Segmentation quality gate

Generated 2026-10-25T02:41:50.698Z by `pnpm --filter @take-my-word/api eval:segmentation --results ../.verify/gate/r5-whisper-large-v3-turbo-noise60 --report docs/tasks/0019_segmented_transcription/reports/gate-whisper-large-v3-turbo-noise60.md --runs 5` on code `e8b5d33685dd14661c2db718ad4a5c8712b95ee3`.
5 runs of 12 clips (the extended samples, every voice), each language setting, transcribed whole and segment by segment with whisper-large-v3-turbo.
Cuts come from the desktop's detector as a session makes them with no request in flight; later segments use the first segment's language, and segments go through the level floor and the silence guard.
Each segment is prompted with today's terms plus the previous raw text's tail within 224 bytes.
White noise at -60 dBFS is added to every clip, like a microphone's floor, before cutting and transcribing both arms.
Spend charged: 0.290 USD.
Groq moved from its free plan to its paid Developer tier at 2026-10-24T18:25:00.000Z, with 10.00 USD of credit and a 5.00 USD monthly spend limit that the account shares with production; its calls from then on are charged at list price and count in the run cap, and pace on its rate-limit headers, keeping 1000 requests, 7200 audio seconds and 20000 tokens of each reported allowance for production; this task's Groq spend since then is 1.548 USD

## Verdict

Neither policy passes on this set.

- 10/20: one: 7 hard-gate flags against the whole take's 0; both: WER away from the cuts 1.3% above the whole take's 1.2% plus its run-to-run spread 0.0%; both: 9 hard-gate flags against the whole take's 0
- 20/30: one: 1 hard-gate flags against the whole take's 0; both: 1 hard-gate flags against the whole take's 0

Gate: WER away from the cuts and term errors within the whole take's value plus its run-to-run spread, per language setting; no more hard-gate flags or failed takes than the whole take.
Words within two words of a cut are counted apart, for both arms, in the same places.

## Quality

| Policy | Languages | WER whole | WER segmented | Away from cuts, whole (spread) | Away from cuts, segmented | Boundary errors whole | Boundary errors segmented | Term errors whole | Term errors segmented | Flags whole / segmented |
|---|---|---|---|---|---|---|---|---|---|---|
| 10/20 | one | 1.2% | 1.9% | 1.2% (0.1%) | 1.3% | 12 of 780 | 105 of 780 | 6.9% | 5.1% | 0 / 7 |
| 10/20 | both | 1.2% | 2.1% | 1.2% (0.0%) | 1.3% | 11 of 780 | 130 of 780 | 6.9% | 5.3% | 0 / 9 |
| 20/30 | one | 1.2% | 1.0% | 1.2% (0.1%) | 0.9% | 7 of 480 | 19 of 480 | 6.9% | 6.1% | 0 / 1 |
| 20/30 | both | 1.2% | 1.0% | 1.2% (0.0%) | 0.9% | 6 of 480 | 19 of 480 | 6.9% | 6.1% | 0 / 1 |

## Prompt split

| Policy | Languages | Segments sent | Terms bytes per segment | Previous text bytes, mean | Previous text bytes, max |
|---|---|---|---|---|---|
| 10/20 | one | 255 | 156 | 49 | 69 |
| 10/20 | both | 255 | 156 | 49 | 69 |
| 20/30 | one | 180 | 156 | 42 | 69 |
| 20/30 | both | 180 | 156 | 42 | 69 |

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
