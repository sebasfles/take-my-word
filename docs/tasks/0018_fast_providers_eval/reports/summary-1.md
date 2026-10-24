# Transcription and cleanup combinations

Generated 2026-10-24T19:14:05.811Z from the transcription results in `../results/transcription-1`, the cleanup results in `../results/cleanup-1` and the end-to-end results in `../results/dictate-1`; prices and plans as checked on 2026-10-23 (Groq, OpenAI) and 2026-10-24 (Together, Cerebras).
A combination passes when its transcriber passes suite 1's hard and relative gates (over every case and over the 30 to 120 s samples alone), its cleanup passes suite 2's, and its cleanup of its own transcriber's raws has no more meaning changes or dictionary term errors than today's pair (`whisper-large-v3-turbo` raws cleaned by `gpt-5.4-nano` as production calls it) plus that pair's run-to-run spread.
Groq moved from its free plan to its paid Developer tier at 2026-10-24T18:25:00.000Z, with 10.00 USD of credit and a 5.00 USD monthly spend limit that the account shares with production; its calls from then on are charged at list price and count in the run cap, and pace on its rate-limit headers, keeping 1000 requests, 7200 audio seconds and 20000 tokens of each reported allowance for production; this task's Groq spend since then is 0.041 USD.
WER is the transcriber's raw WER; term errors and meaning changes are measured after cleanup, on the transcriber's own raws.
Release to text, in ms, on the fresh connection a normal dictation gets: `dictate()`'s total inside the eval Lambda where the end-to-end run measured the combination (cases under 30 s), otherwise the provider calls of both suites, each plus the client-to-API overhead of round 1's dev run (end-to-end-1, 2026-10-24T04:21:19.043Z: per warm dictation through the dev API, release to text on the client minus dictate's own total, plus that dictation's storage stages (the larger of the quota and profile reads, and the save), which the eval Lambda fakes: the client's network to us-east-1, API Gateway, the authorizer, the Lambda invoke and DynamoDB); P50 / P95 come from the distribution of every sum, never from adding percentiles.
Cost per 15 s dictation at list price; a light month is 480 dictations (2 hours of audio), a heavy month 7200 (1 hour a day); "charged" counts only stages whose free allowance would not cover that volume. Together bills per started second of audio at its per-minute list price, an assumption of this harness.

## Passing combinations, fastest first, one dictation language

| Rank | Transcriber | Cleanup | Release to text P50 / P95 | Measured from | In the Lambda P50 / P95 | WER | Term errors after cleanup | Meaning changes | Per dictation | Light month list / charged | Heavy month list / charged |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | gpt-transcribe | gpt-5.4-nano | 1972 / 3012 | end to end in the Lambda | 1253 / 2128 | 0.2% | 2.9% | 2.8% | 0.0013 USD | 0.62 / 0.54 USD | 9.25 / 8.10 USD |

## Every combination, one dictation language

| Transcriber | Cleanup | Gates | WER | Term errors after cleanup | Meaning changes | Release to text P50 / P95 | Per dictation | Light month list / charged | Heavy month list / charged |
|---|---|---|---|---|---|---|---|---|---|
| whisper-large-v3-turbo | gpt-5.4-nano | fail (transcription hard gate) | 2.6% | 5.9% | 1.9% | 1941 / 2617 | 0.0003 USD | 0.16 / 0.08 USD | 2.35 / 1.20 USD |
| whisper-large-v3-turbo | gpt-5.4-nano@none | fail (transcription hard gate, cleanup relative gate) | 2.6% | 5.7% | 0.0% | 1804 / 3593 | 0.0003 USD | 0.16 / 0.08 USD | 2.35 / 1.20 USD |
| whisper-large-v3-turbo | gpt-5.6-luna@none | fail (transcription hard gate, cleanup relative gate) | 2.6% | 3.8% | 0.0% | 2148 / 4073 | 0.0003 USD | 0.16 / 0.08 USD | 2.33 / 1.20 USD |
| whisper-large-v3-turbo | cerebras-qwen-3.8-27b@none | fail (transcription hard gate, cleanup relative gate) | 2.6% | 3.3% | 0.0% | 1226 / 2063 | 0.0007 USD | 0.34 / 0.34 USD | 5.13 / 5.13 USD |
| whisper-large-v3-turbo | cerebras-gpt-oss-120b@low | fail (transcription hard gate, cleanup relative gate) | 2.6% | 6.0% | 2.8% | 1301 / 2166 | 0.0004 USD | 0.21 / 0.21 USD | 3.22 / 3.22 USD |
| whisper-large-v3-turbo | gpt-oss-20b@low | fail (transcription hard gate, cleanup relative gate) | 2.6% | 4.0% | 0.0% | 1487 / 2417 | 0.0002 USD | 0.11 / 0.11 USD | 1.72 / 1.72 USD |
| gpt-transcribe | gpt-5.4-nano | pass | 0.2% | 2.9% | 2.8% | 1972 / 3012 | 0.0013 USD | 0.62 / 0.54 USD | 9.25 / 8.10 USD |
| gpt-transcribe | gpt-5.4-nano@none | fail (cleanup relative gate) | 0.2% | 3.5% | 0.0% | 1956 / 2643 | 0.0013 USD | 0.62 / 0.54 USD | 9.25 / 8.10 USD |
| gpt-transcribe | gpt-5.6-luna@none | fail (cleanup relative gate) | 0.2% | 2.0% | 0.0% | 2212 / 3357 | 0.0013 USD | 0.62 / 0.54 USD | 9.23 / 8.10 USD |
| gpt-transcribe | cerebras-qwen-3.8-27b@none | fail (cleanup relative gate) | 0.2% | 1.6% | 0.0% | 1457 / 2570 | 0.0017 USD | 0.80 / 0.80 USD | 12.03 / 12.03 USD |
| gpt-transcribe | cerebras-gpt-oss-120b@low | fail (cleanup relative gate) | 0.2% | 1.6% | 2.8% | 1424 / 2338 | 0.0014 USD | 0.67 / 0.67 USD | 10.12 / 10.12 USD |
| gpt-transcribe | gpt-oss-20b@low | fail (cleanup relative gate) | 0.2% | 1.8% | 0.0% | 1608 / 2579 | 0.0012 USD | 0.57 / 0.57 USD | 8.62 / 8.62 USD |
| together-parakeet | gpt-5.4-nano | fail (transcription hard gate, cleanup of its own raws) | 4.0% | 7.7% | 10.2% | 1538 / 3427 | 0.0005 USD | 0.26 / 0.18 USD | 3.85 / 2.70 USD |
| together-parakeet | gpt-5.4-nano@none | fail (transcription hard gate, cleanup relative gate, cleanup of its own raws) | 4.0% | 7.3% | 11.1% | 1537 / 3393 | 0.0005 USD | 0.26 / 0.18 USD | 3.85 / 2.70 USD |
| together-parakeet | gpt-5.6-luna@none | fail (transcription hard gate, cleanup relative gate) | 4.0% | 4.2% | 3.7% | 1875 / 3820 | 0.0005 USD | 0.26 / 0.18 USD | 3.83 / 2.70 USD |
| together-parakeet | cerebras-qwen-3.8-27b@none | fail (transcription hard gate, cleanup relative gate, cleanup of its own raws) | 4.0% | 5.5% | 8.3% | 1044 / 2197 | 0.0009 USD | 0.44 / 0.44 USD | 6.63 / 6.63 USD |
| together-parakeet | cerebras-gpt-oss-120b@low | fail (transcription hard gate, cleanup relative gate, cleanup of its own raws) | 4.0% | 8.8% | 5.6% | 1004 / 1498 | 0.0007 USD | 0.31 / 0.31 USD | 4.72 / 4.72 USD |
| together-parakeet | gpt-oss-20b@low | fail (transcription hard gate, cleanup relative gate, cleanup of its own raws) | 4.0% | 8.8% | 6.5% | 1238 / 2083 | 0.0004 USD | 0.21 / 0.21 USD | 3.22 / 3.22 USD |
| together-whisper-large-v3 | gpt-5.4-nano | fail (transcription hard gate, transcription relative gate, no cleanup of this transcriber's raws) | 14.0% | n/a | n/a | 1639 / 3515 | 0.0005 USD | 0.26 / 0.18 USD | 3.85 / 2.70 USD |
| together-whisper-large-v3 | gpt-5.4-nano@none | fail (transcription hard gate, transcription relative gate, cleanup relative gate, no cleanup of this transcriber's raws) | 14.0% | n/a | n/a | 1641 / 3481 | 0.0005 USD | 0.26 / 0.18 USD | 3.85 / 2.70 USD |
| together-whisper-large-v3 | gpt-5.6-luna@none | fail (transcription hard gate, transcription relative gate, cleanup relative gate, no cleanup of this transcriber's raws) | 14.0% | n/a | n/a | 1976 / 3917 | 0.0005 USD | 0.26 / 0.18 USD | 3.83 / 2.70 USD |
| together-whisper-large-v3 | cerebras-qwen-3.8-27b@none | fail (transcription hard gate, transcription relative gate, cleanup relative gate, no cleanup of this transcriber's raws) | 14.0% | n/a | n/a | 1058 / 1839 | 0.0009 USD | 0.44 / 0.44 USD | 6.63 / 6.63 USD |
| together-whisper-large-v3 | cerebras-gpt-oss-120b@low | fail (transcription hard gate, transcription relative gate, cleanup relative gate, no cleanup of this transcriber's raws) | 14.0% | n/a | n/a | 1143 / 2001 | 0.0007 USD | 0.31 / 0.31 USD | 4.72 / 4.72 USD |
| together-whisper-large-v3 | gpt-oss-20b@low | fail (transcription hard gate, transcription relative gate, cleanup relative gate, no cleanup of this transcriber's raws) | 14.0% | n/a | n/a | 1334 / 2196 | 0.0004 USD | 0.21 / 0.21 USD | 3.22 / 3.22 USD |

## Passing combinations, fastest first, both (es, en)

| Rank | Transcriber | Cleanup | Release to text P50 / P95 | Measured from | In the Lambda P50 / P95 | WER | Term errors after cleanup | Meaning changes | Per dictation | Light month list / charged | Heavy month list / charged |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | gpt-transcribe | gpt-5.4-nano | 1923 / 3785 | suites' provider calls | n/a | 0.2% | 2.9% | 2.8% | 0.0014 USD | 0.66 / 0.58 USD | 9.87 / 8.72 USD |

## Every combination, both (es, en)

| Transcriber | Cleanup | Gates | WER | Term errors after cleanup | Meaning changes | Release to text P50 / P95 | Per dictation | Light month list / charged | Heavy month list / charged |
|---|---|---|---|---|---|---|---|---|---|
| whisper-large-v3-turbo | gpt-5.4-nano | fail (transcription hard gate) | 2.5% | 5.9% | 1.9% | 1818 / 3665 | 0.0003 USD | 0.16 / 0.08 USD | 2.35 / 1.20 USD |
| whisper-large-v3-turbo | gpt-5.4-nano@none | fail (transcription hard gate, cleanup relative gate) | 2.5% | 5.7% | 0.0% | 1816 / 3618 | 0.0003 USD | 0.16 / 0.08 USD | 2.35 / 1.20 USD |
| whisper-large-v3-turbo | gpt-5.6-luna@none | fail (transcription hard gate, cleanup relative gate) | 2.5% | 3.8% | 0.0% | 2162 / 4092 | 0.0003 USD | 0.16 / 0.08 USD | 2.33 / 1.20 USD |
| whisper-large-v3-turbo | cerebras-qwen-3.8-27b@none | fail (transcription hard gate, cleanup relative gate) | 2.5% | 3.3% | 0.0% | 1238 / 2076 | 0.0007 USD | 0.34 / 0.34 USD | 5.13 / 5.13 USD |
| whisper-large-v3-turbo | cerebras-gpt-oss-120b@low | fail (transcription hard gate, cleanup relative gate) | 2.5% | 6.0% | 2.8% | 1319 / 2181 | 0.0004 USD | 0.21 / 0.21 USD | 3.22 / 3.22 USD |
| whisper-large-v3-turbo | gpt-oss-20b@low | fail (transcription hard gate, cleanup relative gate) | 2.5% | 4.0% | 0.0% | 1505 / 2423 | 0.0002 USD | 0.11 / 0.11 USD | 1.72 / 1.72 USD |
| gpt-transcribe | gpt-5.4-nano | pass | 0.2% | 2.9% | 2.8% | 1923 / 3785 | 0.0014 USD | 0.66 / 0.58 USD | 9.87 / 8.72 USD |
| gpt-transcribe | gpt-5.4-nano@none | fail (cleanup relative gate) | 0.2% | 3.5% | 0.0% | 1923 / 3743 | 0.0014 USD | 0.66 / 0.58 USD | 9.87 / 8.72 USD |
| gpt-transcribe | gpt-5.6-luna@none | fail (cleanup relative gate) | 0.2% | 2.0% | 0.0% | 2263 / 4198 | 0.0014 USD | 0.66 / 0.58 USD | 9.85 / 8.72 USD |
| gpt-transcribe | cerebras-qwen-3.8-27b@none | fail (cleanup relative gate) | 0.2% | 1.6% | 0.0% | 1344 / 2214 | 0.0018 USD | 0.84 / 0.84 USD | 12.65 / 12.65 USD |
| gpt-transcribe | cerebras-gpt-oss-120b@low | fail (cleanup relative gate) | 0.2% | 1.6% | 2.8% | 1421 / 2306 | 0.0015 USD | 0.72 / 0.72 USD | 10.74 / 10.74 USD |
| gpt-transcribe | gpt-oss-20b@low | fail (cleanup relative gate) | 0.2% | 1.8% | 0.0% | 1613 / 2528 | 0.0013 USD | 0.62 / 0.62 USD | 9.24 / 9.24 USD |
| together-parakeet | gpt-5.4-nano | fail (transcription hard gate, cleanup of its own raws) | 4.0% | 7.7% | 10.2% | 1548 / 3438 | 0.0005 USD | 0.26 / 0.18 USD | 3.85 / 2.70 USD |
| together-parakeet | gpt-5.4-nano@none | fail (transcription hard gate, cleanup relative gate, cleanup of its own raws) | 4.0% | 7.3% | 11.1% | 1549 / 3399 | 0.0005 USD | 0.26 / 0.18 USD | 3.85 / 2.70 USD |
| together-parakeet | gpt-5.6-luna@none | fail (transcription hard gate, cleanup relative gate) | 4.0% | 4.2% | 3.7% | 1890 / 3829 | 0.0005 USD | 0.26 / 0.18 USD | 3.83 / 2.70 USD |
| together-parakeet | cerebras-qwen-3.8-27b@none | fail (transcription hard gate, cleanup relative gate, cleanup of its own raws) | 4.0% | 5.5% | 8.3% | 962 / 1706 | 0.0009 USD | 0.44 / 0.44 USD | 6.63 / 6.63 USD |
| together-parakeet | cerebras-gpt-oss-120b@low | fail (transcription hard gate, cleanup relative gate, cleanup of its own raws) | 4.0% | 8.8% | 5.6% | 1046 / 1891 | 0.0007 USD | 0.31 / 0.31 USD | 4.72 / 4.72 USD |
| together-parakeet | gpt-oss-20b@low | fail (transcription hard gate, cleanup relative gate, cleanup of its own raws) | 4.0% | 8.8% | 6.5% | 1248 / 2109 | 0.0004 USD | 0.21 / 0.21 USD | 3.22 / 3.22 USD |
| together-whisper-large-v3 | gpt-5.4-nano | fail (transcription hard gate, transcription relative gate, no cleanup of this transcriber's raws) | 18.2% | n/a | n/a | 1635 / 3517 | 0.0005 USD | 0.26 / 0.18 USD | 3.85 / 2.70 USD |
| together-whisper-large-v3 | gpt-5.4-nano@none | fail (transcription hard gate, transcription relative gate, cleanup relative gate, no cleanup of this transcriber's raws) | 18.2% | n/a | n/a | 1632 / 3485 | 0.0005 USD | 0.26 / 0.18 USD | 3.85 / 2.70 USD |
| together-whisper-large-v3 | gpt-5.6-luna@none | fail (transcription hard gate, transcription relative gate, cleanup relative gate, no cleanup of this transcriber's raws) | 18.2% | n/a | n/a | 1969 / 3917 | 0.0005 USD | 0.26 / 0.18 USD | 3.83 / 2.70 USD |
| together-whisper-large-v3 | cerebras-qwen-3.8-27b@none | fail (transcription hard gate, transcription relative gate, cleanup relative gate, no cleanup of this transcriber's raws) | 18.2% | n/a | n/a | 1060 / 1851 | 0.0009 USD | 0.44 / 0.44 USD | 6.63 / 6.63 USD |
| together-whisper-large-v3 | cerebras-gpt-oss-120b@low | fail (transcription hard gate, transcription relative gate, cleanup relative gate, no cleanup of this transcriber's raws) | 18.2% | n/a | n/a | 1143 / 2019 | 0.0007 USD | 0.31 / 0.31 USD | 4.72 / 4.72 USD |
| together-whisper-large-v3 | gpt-oss-20b@low | fail (transcription hard gate, transcription relative gate, cleanup relative gate, no cleanup of this transcriber's raws) | 18.2% | n/a | n/a | 1333 / 2200 | 0.0004 USD | 0.21 / 0.21 USD | 3.22 / 3.22 USD |

Free allowances at these volumes:

- cerebras-gpt-oss-120b@low, heavy month: prepaid balance, billed at list price
- cerebras-gpt-oss-120b@low, light month: prepaid balance, billed at list price
- cerebras-qwen-3.8-27b@none, heavy month: prepaid balance, billed at list price
- cerebras-qwen-3.8-27b@none, light month: prepaid balance, billed at list price
- gpt-5.4-nano, heavy month: complimentary tokens: 102240 of 2500000 per day
- gpt-5.4-nano, light month: complimentary tokens: 6816 of 2500000 per day
- gpt-5.4-nano@none, heavy month: complimentary tokens: 102240 of 2500000 per day
- gpt-5.4-nano@none, light month: complimentary tokens: 6816 of 2500000 per day
- gpt-5.6-luna@none, heavy month: complimentary tokens: 102240 of 2500000 per day
- gpt-5.6-luna@none, light month: complimentary tokens: 6816 of 2500000 per day
- gpt-oss-20b@low, heavy month: paid Developer tier since 2026-10-24T18:25:00.000Z, billed at list price
- gpt-oss-20b@low, light month: paid Developer tier since 2026-10-24T18:25:00.000Z, billed at list price
- gpt-transcribe, heavy month: no free allowance
- gpt-transcribe, light month: no free allowance
- together-parakeet, heavy month: prepaid balance, billed at list price
- together-parakeet, light month: prepaid balance, billed at list price
- together-whisper-large-v3, heavy month: prepaid balance, billed at list price
- together-whisper-large-v3, light month: prepaid balance, billed at list price
- whisper-large-v3-turbo, heavy month: paid Developer tier since 2026-10-24T18:25:00.000Z, billed at list price
- whisper-large-v3-turbo, light month: paid Developer tier since 2026-10-24T18:25:00.000Z, billed at list price

Not re-run in this round:

- `whisper-large-v3 (Groq)`: not re-run; it failed round 1's hard gate on noise (docs/tasks/0017_eval_harness/report.md).
- `gpt-4o-mini-transcribe`: not re-run; it failed round 1's hard gate on noise and retires on 2027-02-26 (docs/tasks/0017_eval_harness/report.md).
- `gpt-4o-transcribe`: not re-run; it failed round 1's hard gate on noise and language and retires on 2027-02-26 (docs/tasks/0017_eval_harness/report.md).

## Models

- `whisper-large-v3-turbo` (groq): price from https://console.groq.com/docs/models.
- `gpt-transcribe` (openai): price from https://developers.openai.com/api/docs/pricing.
- `nvidia/parakeet-tdt-0.6b-v3` (together): price from https://www.together.ai/pricing.
- `openai/whisper-large-v3` (together): price from https://www.together.ai/pricing.
- `gpt-5.4-nano` (openai): price from https://developers.openai.com/api/docs/pricing; retires 2027-04-01 (https://developers.openai.com/api/docs/deprecations).
- `gpt-5.6-luna` (openai): price from https://developers.openai.com/api/docs/pricing.
- `qwen-3.8-27b` (cerebras): price from https://inference-docs.cerebras.ai/models/qwen-3.8-27b.
- `gpt-oss-120b` (cerebras): price from https://inference-docs.cerebras.ai/models/openai-oss.
- `openai/gpt-oss-20b` (groq): price from https://console.groq.com/docs/models.

