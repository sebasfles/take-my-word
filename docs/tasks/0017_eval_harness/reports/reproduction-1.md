# Transcription run-to-run reproduction

Compares the results in `../results/transcription-1` and `../results/transcription-2` on the runs both have (1 to 3), with the same fixtures and checks; a candidate missing calls in either run is marked incomplete.
Reproduce from the repository root: `pnpm --filter @take-my-word/api eval:reproduce --first ../results/transcription-1 --second ../results/transcription-2 --report docs/tasks/0017_eval_harness/reports/reproduction-1.md`.

| Candidate | Languages | Complete | WER first / second | Domain-term errors first / second | Hard-gate flags first / second | Language flips first / second |
|---|---|---|---|---|---|---|
| whisper-large-v3-turbo | one | incomplete | 3.6% / 3.7% | 10.1% / 10.1% | 18 / 12 | 0 / 0 |
| whisper-large-v3-turbo | both | incomplete | 3.6% / 3.9% | 10.1% / 9.8% | 18 / 6 | 0 / 0 |
| whisper-large-v3 | one | incomplete | 2.8% / 2.8% | 6.5% / 6.5% | 15 / 15 | 0 / 0 |
| whisper-large-v3 | both | incomplete | 2.8% / 2.8% | 6.5% / 6.5% | 12 / 4 | 0 / 0 |
| gpt-transcribe | one | yes | 0.5% / 0.5% | 0.6% / 0.6% | 0 / 0 | 0 / 0 |
| gpt-transcribe | both | yes | 0.8% / 0.8% | 1.0% / 1.2% | 0 / 0 | 0 / 0 |
| gpt-4o-mini-transcribe | one | yes | 0.7% / 0.9% | 1.8% / 1.8% | 18 / 18 | 0 / 0 |
| gpt-4o-mini-transcribe | both | yes | 0.7% / 0.9% | 1.8% / 2.0% | 18 / 18 | 72 / 72 |
| gpt-4o-transcribe | one | yes | 1.2% / 1.3% | 0.4% / 0.6% | 22 / 22 | 0 / 0 |
| gpt-4o-transcribe | both | yes | 1.8% / 0.7% | 0.6% / 0.6% | 24 / 20 | 72 / 72 |

