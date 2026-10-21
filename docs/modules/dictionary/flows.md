---
updated: 2026-10-20
source: setup
---

# Dictionary: flows

Only flows that deserve a diagram. A CRUD does not.

## Usage and ranking

Runs on every dictation: `dictate` reads and ranks the terms before calling providers, and the saved dictation later feeds usage back through the table stream.

```mermaid
sequenceDiagram
  participant D as dictate Lambda
  participant T as take-my-word-{env}
  participant W as Whisper (groq)
  participant R as Refiner (gpt-6-luna)
  participant S as Table stream
  participant U as dictionary-usage Lambda
  D->>T: read DICT#term items of the user
  D->>D: score = useCount * 0.5^(days/30), sort
  D->>W: audio + prompt with top terms (224 tokens)
  W-->>D: raw transcript
  D->>R: transcript + style + full term list with aliases
  R-->>D: clean text
  D->>T: put DICTATION#ts (text, TTL 90 days)
  T-->>S: INSERT event
  S->>U: batch of new dictations
  U->>T: increment useCount, set lastUsedAt on matched terms
```

The silence guard can end a dictation before the refiner; whether such a dictation is saved and counted is.
