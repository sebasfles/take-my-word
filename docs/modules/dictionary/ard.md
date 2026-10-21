---
updated: 2026-10-21
source: 0003_api_features
---

# Dictionary: architecture and debt

## 2026-10-20: One dictionary, two projections, used by both pipeline stages

- Decision: every dictation reads the user's dictionary twice; the top terms by score go into Whisper's `prompt` (capped at 224 tokens), and the full list with aliases goes to the refiner as a correction table.
- Alternatives rejected: correcting only in the refiner, or only steering the transcriber.
- Reason: the prompt fixes spelling at the source; the refiner, with context, handles homophones and near-misses the prompt could not fit or did not prevent (`docs/proposal.md`, "Dictation pipeline").
- Debt created: none.
- Revisit when: the evaluation harness measures WER with and without each projection.
- Source: setup

## 2026-10-20: Rank terms by decayed usage computed at read time

- Decision: each term stores `useCount` and `lastUsedAt`; the score is `useCount * 0.5 ^ (daysSinceLastUse / 30)`, computed when read, with a configurable half-life; new terms start at `useCount = 1`, `lastUsedAt = createdAt`; no stored score.
- Alternatives rejected: a stored score column; ranking by frequency or by recency alone.
- Reason: a decayed score changes every day without any write, so storing it would only go stale; seeding new terms keeps them from starting at the bottom.
- Debt created: none.
- Revisit when: dictionaries grow enough that reading every term per dictation shows in `dictate` latency.
- Source: setup

## 2026-10-20: Update usage asynchronously from the table's stream

- Decision: a dedicated `dictionary-usage` Lambda consumes the DynamoDB Stream of saved `DICTATION#ts` items and updates `useCount` and `lastUsedAt`; `dictate` never writes to dictionary terms.
- Alternatives rejected: updating usage inline in `dictate`.
- Reason: keeps the dictation response path free of extra writes and lets usage failures retry without touching the user's result.
- Debt created: none.
- Revisit when: dictations stop being persisted, since usage depends on the saved item reaching the stream.
- Source: setup

## 2026-10-20: No Transcribe custom vocabularies in v1

- Decision: the dictionary is not mirrored into AWS Transcribe custom vocabularies.
- Alternatives rejected: per-user custom vocabularies created with the dictionary.
- Reason: they are asynchronous account resources per user, not per request, and the `aws-transcribe` adapter itself is not in v1 (bootstrap draft, finding 5).
- Debt created: none.
- Revisit when: the `aws-transcribe` adapter arrives with the evaluation harness.
- Source: setup

## 2026-10-21: Folding strips every accent, so ñ and n are one letter

- Decision: `normalizeTerm` lowercases, collapses spaces and removes every combining mark after NFD, and that folded form is the key, the duplicate check and the matching form.
- Alternatives rejected: keeping ñ (and other letters of the language) apart from their base letter.
- Reason: the plan asked for case and accent folding, and matching a misheard "Raul" or "kubérnetes" matters more than telling "año" from "ano" apart.
- Debt created: two terms that differ only by a tilde or umlaut cannot coexist, and a term with ñ also counts uses of its n spelling.
- Revisit when: a user needs two terms that differ only by ñ or an umlaut.
- Source: 0003_api_features

## 2026-10-21: The Whisper prompt budget counts UTF-8 bytes

- Decision: terms enter the transcriber prompt greedily by decayed score while the comma-joined prompt stays within `STT_PROMPT_TOKEN_BUDGET` (224) bytes; a term that does not fit is skipped and shorter ones may still enter.
- Alternatives rejected: a tokenizer in the Lambda; a characters-per-token heuristic.
- Reason: a byte-level BPE token is at least one byte, so bytes are a strict upper bound; Groq answers 400 past 896 bytes of prompt (measured in dev), which the budget can never reach.
- Debt created: about a quarter to a half of Whisper's 224 tokens stays unused, roughly 20 to 30 terms reach the transcriber.
- Revisit when: users keep more top terms than fit and transcription misses them.
- Source: 0003_api_features
