# 0019 Segmented transcription: report

Measured 2026-10-24 and 25 on dev and in the dev eval Lambda, through production's adapters.

## Decision

Segmentation ships off by default (`Policy::default()`: off, 20/30, pause 600 ms).
The desktop default follows the transcriber prd runs at publish time, whisper-large-v3-turbo, and no policy passes the gate on both sample sets with it.
A transcriber whose verdict is "pass on both" below can turn it on through the `segmentation` setting without a new task; none does today.

## Quality gate (Acceptance 7)

The 12 extended clips (41 to 106 s, Spanish, English, mixed, every voice), both language settings, 5 runs, whole take against each policy, cuts from the desktop's own detector with nothing in flight.
"Clean" is the fixtures as Polly speaks them; "-60 dBFS" adds white noise like a microphone's floor.

| Transcriber | Set | 10/20 | 20/30 | Report |
|---|---|---|---|---|
| whisper-large-v3-turbo | clean | fail: 13 and 15 flags against the whole take's 1 and 4 | fail: 10 flags against 1 and 4 (WER 1.3% against 1.8% and 2.1%) | [gate](reports/gate-whisper-large-v3-turbo-clean.md) |
| whisper-large-v3-turbo | -60 dBFS | fail: 7 and 9 flags against 0, WER away from the cuts 1.3% against 1.2% | fail: 1 flag against 0 (WER 1.0% against 1.2%) | [gate](reports/gate-whisper-large-v3-turbo-noise60.md) |
| together-parakeet | clean | fail: 15 flags against 5, WER away from the cuts 3.0% against 2.8% | fail: 10 flags against 5, WER away from the cuts 2.7% against 2.5% | [gate](reports/gate-together-parakeet-clean.md) |
| together-parakeet | -60 dBFS | fail: 15 flags against 10 | fail: term errors 17.9% against 17.3% (0 flags against 10, WER 2.6% against 2.8%) | [gate](reports/gate-together-parakeet-noise60.md) |
| gpt-transcribe | both | not measured: OpenAI ran out of credit mid-run | | |

Every flag is invented content at a cut that lands mid-sentence: the long samples have no pause of 600 ms on the clean set and 29 in 14 minutes at -60 dBFS, so nearly every cut is forced.
Parakeet takes no prompt, so its segments carry neither the terms nor the previous text; it repeats exactly across runs, so its spread is 0 and any increase fails.
[gate-1](reports/gate-1.md) and [gate-noise60-1](reports/gate-noise60-1.md) are the runs before the detector fix (floor dragged down by digital zeros) and are kept only as its evidence.

## Release to paste (Acceptance 8)

[release-to-paste.md](reports/release-to-paste.md): with 20/30, takes of 30 to 120 s are always cut, and today's prd pair answers in 1.2 s instead of 2.8 s at P50 for 30 to 60 s and in 2.0 s instead of 6.2 s for 60 to 120 s; under 30 s nothing changes.

## Other acceptance

- Segment failures and delays (Acceptance 4), on dev: a segment refused with 429 and one held 30 s past release each end in one final carrying the whole take, every word pasted.
- Quota and receipts (Acceptance 5), on dev: a segment at the cap 429; a final with a valid receipt at the cap 200, charged only its own audio; receipts of another user, repeated, forged, past the take limit or older than 180 s 400.
- Idle RAM and CPU (Acceptance 9), release builds against develop, five pairs interleaved: working set 436 to 443 MB against 428 to 444 MB, CPU 0.147 to 0.168% against 0.139 to 0.173%; the app's own process used no CPU while idle.

## Spend

Gates: whisper-large-v3-turbo 0.290 USD per set; together-parakeet 0.641 and 0.639 USD (Together prepaid); the interrupted gpt-transcribe runs 1.548 and 0.548 USD; before the detector fix 0.587, 0.290 and 0.290 USD and about 0.08 USD for a stopped run; Polly 0.297 USD once.
Replays and dev checks: about 0.1 USD of transcription plus one refine per final.
Every run stayed under 3 USD.
