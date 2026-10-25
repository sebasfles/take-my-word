# Segmentation quality gate

Generated 2026-10-24T21:34:18.269Z by `pnpm --filter @take-my-word/api eval:segmentation --results ../.verify/gate/run-2 --report docs/tasks/0019_segmented_transcription/reports/gate-2.md --runs 5` on code `833c38a18502cd8803d71f4cb94845f34aab9a44`.
5 runs of 12 clips (the extended samples, every voice), each language setting, transcribed whole and segment by segment with whisper-large-v3-turbo.
Cuts come from the desktop's detector as a session makes them with no request in flight; each segment is prompted with today's terms plus the previous raw text's tail within 224 bytes, later segments use the first segment's language, and segments go through the level floor and the silence guard.
The clips are the fixtures as Polly speaks them, with digital silence between words.
Spend charged: 0.290 USD.
Groq moved from its free plan to its paid Developer tier at 2026-10-24T18:25:00.000Z, with 10.00 USD of credit and a 5.00 USD monthly spend limit that the account shares with production; its calls from then on are charged at list price and count in the run cap, and pace on its rate-limit headers, keeping 1000 requests, 7200 audio seconds and 20000 tokens of each reported allowance for production; this task's Groq spend since then is 0.871 USD

## Verdict

Neither policy passes on this set.

- 10/20: one: 13 hard-gate flags against the whole take's 4; both: 14 hard-gate flags against the whole take's 1
- 20/30: one: 10 hard-gate flags against the whole take's 4; both: 10 hard-gate flags against the whole take's 1

Gate: WER away from the cuts and term errors within the whole take's value plus its run-to-run spread, per language setting; no more hard-gate flags or failed takes than the whole take.
Words within two words of a cut are counted apart, for both arms, in the same places.

## Quality

| Policy | Languages | WER whole | WER segmented | Away from cuts, whole (spread) | Away from cuts, segmented | Boundary errors whole | Boundary errors segmented | Term errors whole | Term errors segmented | Flags whole / segmented |
|---|---|---|---|---|---|---|---|---|---|---|
| 10/20 | one | 2.0% | 2.7% | 1.9% (1.9%) | 1.3% | 23 of 760 | 214 of 760 | 6.9% | 6.0% | 4 / 13 |
| 10/20 | both | 1.3% | 2.8% | 1.2% (0.5%) | 1.3% | 15 of 760 | 214 of 760 | 6.8% | 6.0% | 1 / 14 |
| 20/30 | one | 2.0% | 1.3% | 2.0% (1.9%) | 0.9% | 15 of 460 | 60 of 460 | 6.9% | 6.6% | 4 / 10 |
| 20/30 | both | 1.3% | 1.3% | 1.2% (0.5%) | 0.9% | 10 of 460 | 60 of 460 | 6.8% | 6.6% | 1 / 10 |

## Prompt split

| Policy | Languages | Segments sent | Terms bytes per segment | Previous text bytes, mean | Previous text bytes, max |
|---|---|---|---|---|---|
| 10/20 | one | 250 | 156 | 48 | 69 |
| 10/20 | both | 250 | 156 | 48 | 69 |
| 20/30 | one | 175 | 156 | 41 | 69 |
| 20/30 | both | 175 | 156 | 41 | 69 |

## Pauses in the samples

Quiet runs as the detector classifies its levels, counted over every clip.

| Clips | Minutes | 400 ms or more | 600 ms or more | 800 ms or more |
|---|---|---|---|---|
| 12 | 14.0 | 132 (9.4 per minute) | 0 (0.0 per minute) | 0 (0.0 per minute) |

## Cuts

| Clip | Seconds | Policy | Cuts at (s) | Pause cuts | Forced cuts | Spans without speech |
|---|---|---|---|---|---|---|
| extended-en-45/Joanna | 45.7 | 10/20 | 19.7, 39.7 | 0 | 2 | 0 |
| extended-en-45/Joanna | 45.7 | 20/30 | 29.9 | 0 | 1 | 0 |
| extended-en-45/Matthew | 41.4 | 10/20 | 19.3, 39.4 | 0 | 2 | 0 |
| extended-en-45/Matthew | 41.4 | 20/30 | 29.5 | 0 | 1 | 0 |
| extended-en-100/Joanna | 105.8 | 10/20 | 19.0, 38.1, 57.9, 77.2, 96.4 | 0 | 5 | 0 |
| extended-en-100/Joanna | 105.8 | 20/30 | 30.0, 60.0, 89.5 | 0 | 3 | 0 |
| extended-en-100/Matthew | 97.7 | 10/20 | 19.6, 39.0, 58.8, 78.4 | 0 | 4 | 0 |
| extended-en-100/Matthew | 97.7 | 20/30 | 29.6, 58.8, 88.1 | 0 | 3 | 0 |
| extended-es-45/Lupe | 49.2 | 10/20 | 19.3, 39.1 | 0 | 2 | 0 |
| extended-es-45/Lupe | 49.2 | 20/30 | 30.0 | 0 | 1 | 0 |
| extended-es-45/Andres | 43.6 | 10/20 | 19.7, 39.1 | 0 | 2 | 0 |
| extended-es-45/Andres | 43.6 | 20/30 | 29.4 | 0 | 1 | 0 |
| extended-es-100/Lupe | 105.0 | 10/20 | 19.1, 38.2, 57.5, 76.8, 96.6 | 0 | 5 | 0 |
| extended-es-100/Lupe | 105.0 | 20/30 | 29.1, 58.8, 88.2 | 0 | 3 | 0 |
| extended-es-100/Andres | 90.4 | 10/20 | 19.5, 38.9, 58.1, 78.2 | 0 | 4 | 0 |
| extended-es-100/Andres | 90.4 | 20/30 | 29.4, 59.1, 88.2 | 0 | 3 | 0 |
| extended-mixed-45/Pedro | 40.8 | 10/20 | 19.9, 39.3 | 0 | 2 | 0 |
| extended-mixed-45/Pedro | 40.8 | 20/30 | 29.1 | 0 | 1 | 0 |
| extended-mixed-45/Mia | 41.8 | 10/20 | 19.6, 39.3 | 0 | 2 | 0 |
| extended-mixed-45/Mia | 41.8 | 20/30 | 29.5 | 0 | 1 | 0 |
| extended-mixed-100/Pedro | 86.6 | 10/20 | 19.9, 39.4, 59.2, 78.7 | 0 | 4 | 0 |
| extended-mixed-100/Pedro | 86.6 | 20/30 | 29.0, 58.4 | 0 | 2 | 0 |
| extended-mixed-100/Mia | 90.6 | 10/20 | 19.1, 39.1, 58.7, 78.0 | 0 | 4 | 0 |
| extended-mixed-100/Mia | 90.6 | 20/30 | 29.6, 58.7, 88.6 | 0 | 3 | 0 |
