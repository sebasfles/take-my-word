---
updated: 2026-10-23
source: 0014_desktop_ux
---

# Desktop: flows

Only flows that deserve a diagram. A CRUD does not.

## Hold to talk and hands-free

Runs every time the user presses the shortcut; the recording starts at the first press and runs through a double tap.
An error closes after 4 s or on click; a failure that lands while the next hold is open arrives as a notification instead.
Every caller of the session waits on one lock, so only one renewal runs at a time; the hotkey only reads a flag and never waits.

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Idle: press signed out, "sign in" shown, sign-in opens in the main window
  Idle --> Listening: press, background renewal starts
  Listening --> Tapped: release under 0.5 s
  Tapped --> Idle: no second press within 300 ms, discarded
  Tapped --> Second: second press within 300 ms
  Second --> HandsFree: release under 0.5 s
  Second --> Processing: release after 0.5 s
  HandsFree --> Processing: release of the next tap, or stop in the overlay
  HandsFree --> Idle: Esc, cancelled
  Listening --> Idle: another key, cancelled
  Listening --> Processing: release after 0.5 s, or the keys read up with no key-up seen
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
  U->>D: hold the shortcut
  D->>O: show listening
  D->>D: record WAV, read active window
  U->>D: release the shortcut
  D->>O: show processing
  D->>D: access token, renewed under the lock with under 5 min left
  D->>A: WAV, appId, access token
  Note over D,A: 401 or 403 without the error envelope: renew once, retry once
  A-->>D: clean text
  D->>D: save clipboard, offer text (delayed rendering), withhold every read until the keystroke
  D->>F: paste keystroke from the cached app rule, else Ctrl+V
  F-->>D: first read after the keystroke, proven to be F's
  D->>D: restore clipboard once readers are quiet
  D->>O: hide
```
