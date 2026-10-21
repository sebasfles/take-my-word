---
updated: 2026-10-21
source: 0003_api_features
---

# Dictionary: flows

Only flows that deserve a diagram. A CRUD does not.

## Usage and ranking

`dictate` reads and ranks the terms before calling providers; the saved dictation later feeds usage back through the table stream.
Skipped silence is never saved, so it never counts.

```mermaid
sequenceDiagram
  participant D as dictate Lambda
  participant T as take-my-word-{env}
  participant W as Whisper (groq)
  participant R as Refiner (openai)
  participant U as dictionary-usage Lambda
  D->>T: Query DICT# of the user (with the quota charge)
  D->>D: score = useCount * 0.5^(days/30), top terms within 224 bytes
  D->>W: audio + prompt with top terms
  W-->>D: raw transcript
  D->>R: transcript + style + every term with aliases
  R-->>D: clean text
  D->>T: put DICTATION#ts
  T-->>U: INSERT of DICTATION# (filtered stream)
  U->>T: Query DICT# of that user
  U->>T: ADD useCount 1, SET lastUsedAt, if lastUsedAt < dictation time
```
