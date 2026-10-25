# Release to paste

Measured on dev on 2026-10-25 with the debug replay (`apps/desktop/src-tauri/src/replay.rs`).
Each sample plays in real time through the desktop's capture buffer, session, detector, segment thread and worker on the Windows host, against dev's `dictate` built from this branch, with a throwaway user whose dictation languages are Spanish and English.
Release to paste runs from the key's release to the API's answer with the text; the paste itself is faked.
Samples: 10 Spanish takes under 10 s and 10 of 10 to 30 s (Polly, Lupe and Andres), and the 12 extended clips of 41 to 106 s in Spanish, English and mixed, all with white noise at -60 dBFS like a microphone's floor; the same samples for every pair.
Each sample is replayed once with segmentation off and once on at 20/30 (pause 600 ms), the order alternating per sample, 5 s apart.
The pair is switched by `providers.dev` in `deployment.json` and `pnpm tf dev apply`, which changes only `dictate`'s `TRANSCRIBER` and `REFINER`.

| Pair | Bucket | Takes per arm | Off P50 / P95 ms | 20/30 P50 / P95 ms | Takes that used a segment |
|---|---|---|---|---|---|
| whisper-large-v3-turbo + cerebras-qwen-3.8-27b@none | under 10 s | 11 | 985 / 1936 | 739 / 941 | 0 of 11 |
| whisper-large-v3-turbo + cerebras-qwen-3.8-27b@none | 10 to 30 s | 9 | 1463 / 2412 | 1613 / 2038 | 0 of 9 |
| whisper-large-v3-turbo + cerebras-qwen-3.8-27b@none | 30 to 60 s | 6 | 2814 / 3565 | 1206 / 2067 | 6 of 6 |
| whisper-large-v3-turbo + cerebras-qwen-3.8-27b@none | 60 to 120 s | 6 | 6216 / 7328 | 1958 / 3280 | 6 of 6 |
| together-parakeet + cerebras-qwen-3.8-27b@none | under 10 s | 11 | 497 / 1448 | 577 / 1442 | 0 of 11 |
| together-parakeet + cerebras-qwen-3.8-27b@none | 10 to 30 s | 9 | 756 / 1240 | 682 / 858 | 0 of 9 |
| together-parakeet + cerebras-qwen-3.8-27b@none | 30 to 60 s | 6 | 971 / 2322 | 668 / 836 | 6 of 6 |
| together-parakeet + cerebras-qwen-3.8-27b@none | 60 to 120 s | 6 | 2607 / 3669 | 758 / 1124 | 6 of 6 |

whisper-large-v3-turbo + cerebras-qwen-3.8-27b@none: 64 takes, every one pasted; segments still in flight at release: 1.
together-parakeet + cerebras-qwen-3.8-27b@none: 64 takes, every one pasted; segments still in flight at release: 0.

Under 30 s no take reaches a cut at 20/30, so both arms send the same single request and their gap is run-to-run spread.
From 30 s on every take is cut, and only the last segment is left to transcribe at release: today's prd pair goes from 2.8 to 1.2 s at P50 for 30 to 60 s and from 6.2 to 2.0 s for 60 to 120 s.
gpt-transcribe + gpt-5.4-nano is not measured: OpenAI ran out of credit during this round.
