---
updated: 2026-10-25
source: 0019_segmented_transcription
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
  participant S as Transcriber of the environment
  participant R as Refiner of the environment
  C->>G: POST /dictations, audio and Cognito JWT
  G->>D: request with user id
  alt WAV under the level floor
    D-->>C: empty text, nothing charged
  end
  par
    D->>T: charge the day's quota
  and
    D->>T: read settings, app rule, styles, dictionary
  end
  alt day already at the cap
    D-->>C: 429
  end
  alt one dictation language
    D->>S: audio, that language, top dictionary terms as prompt
  else several
    D->>S: audio and prompt, language detected
    opt detected language not in the list
      D->>S: audio again in the first language
    end
  end
  S-->>D: raw transcript in the language used
  alt empty, hallucination, or ambiguous phrase on quiet WAV
    D-->>C: empty text, nothing saved
  end
  D->>R: raw transcript, editing rules, resolved style, full dictionary, language used
  R-->>D: clean text
  D->>T: save DICTATION with styleId and TTL 90 days
  D-->>C: raw and clean text, styleId
  T-)T: stream to dictionary-usage
```

## Segmented take

The desktop cuts a long take at pauses while the user speaks; at most one segment is in flight.

```mermaid
sequenceDiagram
  participant C as Desktop
  participant D as dictate Lambda
  participant T as Table
  loop each closed segment while recording
    C->>D: POST /dictations/segments, audio, previous raw text, first language
    D->>T: read the day's usage
    alt at the cap
      D-->>C: 429, segmenting stops for the take
    end
    D->>D: transcribe with terms and the previous text's tail
    D->>T: ADD the segment's seconds
    D-->>C: raw text, language, receipt
  end
  C->>D: POST /dictations, last audio, earlier texts and receipts
  D->>D: verify every receipt, or 400
  D->>T: ADD the last part's seconds, no cap condition
  D->>D: transcribe the last part, join, refine once
  D->>T: save one DICTATION with the take's seconds
  D-->>C: raw and clean text
```

