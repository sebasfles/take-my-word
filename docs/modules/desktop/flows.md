---
updated: 2026-10-21
source: 0008_desktop_features
---

# Desktop: flows

Only flows that deserve a diagram. A CRUD does not.

## Hold to talk

Runs every time the user holds the hotkey.
An error closes after 4 s or on click; a failure that lands while the next hold is open arrives as a notification instead.
Every caller of the session waits on one lock, so only one renewal runs at a time; the hotkey only reads a flag and never waits.

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Idle: hotkey down signed out, "sign in" shown, sign-in window opens
  Idle --> Listening: hotkey down, background renewal starts
  Listening --> Idle: hotkey up under 0.5 s, discarded
  Listening --> Processing: hotkey up
  Processing --> Pasting: text returned
  Processing --> Idle: empty text, nothing pasted
  Processing --> Error: network, daily limit, size, format or microphone failure
  Processing --> Error: session ended, sign-in window opens
  Pasting --> Idle: clipboard restored
  Error --> Idle: 4 s or click
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
  D->>D: access token, renewed under the lock with under 5 min left
  D->>A: WAV, appId, access token
  Note over D,A: 401 or 403 without the error envelope: renew once, retry once
  A-->>D: clean text
  D->>D: save clipboard, offer text (delayed rendering) to F's processes only
  D->>F: paste keystroke from the cached app rule, else Ctrl+V
  F-->>D: reads the text
  D->>D: restore clipboard
  D->>O: hide
```
