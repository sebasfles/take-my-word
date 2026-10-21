---
updated: 2026-10-20
source: setup
---

# Auth: flows

Only flows that deserve a diagram. A CRUD does not.

## Client session

Runs in desktop, mobile and web from launch to sign-out.

```mermaid
stateDiagram-v2
  [*] --> SignedOut
  SignedOut --> SignedIn: SRP sign-in succeeds
  SignedIn --> SignedIn: access token expires, refresh rotates
  SignedIn --> SignedOut: user signs out
  SignedIn --> SignedOut: refresh rejected (device or global revocation)
```

## Sign-in and authorized call

Runs on first sign-in on a device and on every API call after it.

```mermaid
sequenceDiagram
  participant C as Client (desktop, mobile, web)
  participant K as Keychain or secure store
  participant G as Cognito
  participant H as HTTP API
  participant Z as Lambda authorizer
  participant L as api or dictate
  C->>G: SRP sign-in (username, password)
  G-->>C: access 1 h, refresh, device key
  C->>K: store tokens
  C->>H: request with access token
  H->>Z: validate JWT (cached 5 min)
  Z-->>H: allow with user id
  H->>L: request with user id
  L-->>C: response
  C->>G: refresh when access expires
  G-->>C: new access and new refresh
  C->>K: overwrite refresh token
```
