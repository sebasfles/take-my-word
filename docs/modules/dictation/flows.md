---
updated: 2026-10-20
source: setup
---

# Dictation: flows

Only flows that deserve a diagram. A CRUD does not.

## Dictation pipeline

Runs on every `POST /dictations`, from desktop on hotkey release or from mobile on button release.

```mermaid
sequenceDiagram
  participant C as Desktop or mobile
  participant G as API Gateway and authorizer
  participant D as dictate Lambda
  participant T as Table take-my-word-env
  participant S as Groq whisper
  participant R as OpenAI gpt-6-luna
  C->>G: POST /dictations, audio and Cognito JWT
  G->>D: request with user id
  D->>T: check daily quota, read settings, dictionary, style
  alt over quota
    D-->>C: refused
  end
  D->>S: audio and top dictionary terms as prompt
  S-->>D: raw transcript
  alt empty or silence hallucination
    D-->>C: empty text
  end
  D->>R: raw transcript, style prompt, full dictionary, locale
  R-->>D: clean text
  D->>T: save DICTATION with TTL 90 days
  D-->>C: raw and clean text
  T-)T: stream to dictionary-usage
```
