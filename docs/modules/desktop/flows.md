---
updated: 2026-10-20
source: setup
---

# Desktop: flows

Only flows that deserve a diagram. A CRUD does not.

## Hold to talk

Runs every time the user holds the hotkey.
How the error state is dismissed (timeout or click) is not decided.

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Listening: hotkey down
  Listening --> Idle: hotkey up under 0.5 s, discarded
  Listening --> Processing: hotkey up
  Processing --> Pasting: text returned
  Processing --> Idle: empty text, nothing pasted
  Processing --> Error: network or quota failure
  Pasting --> Idle: clipboard restored
  Error --> Idle: overlay dismissed
```

```mermaid
sequenceDiagram
  participant U as User
  participant D as Desktop (Rust shell)
  participant O as Overlay
  participant A as API (POST /dictations)
  participant F as Focused app
  U->>D: hold hotkey
  D->>O: show listening
  D->>D: record WAV, read active window
  U->>D: release hotkey
  D->>O: show processing
  D->>A: WAV, appId, styleId, access token
  A-->>D: clean text
  D->>D: save clipboard, put text
  D->>F: paste keystroke from app rule
  D->>D: restore clipboard
  D->>O: hide
```
