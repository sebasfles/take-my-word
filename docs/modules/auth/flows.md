---
updated: 2026-10-21
source: 0004_web_landing
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

## Web session renewal

Runs when a page of `/app` finds the access token in its last minute.
Cognito keeps only the refresh token of the renewal that finished last, so tabs renew one at a time.

```mermaid
sequenceDiagram
  participant P as Page (server render)
  participant T as Tab (RenewSession)
  participant L as Web Lock tmw-session-refresh
  participant R as POST /api/session/refresh
  participant G as Cognito
  P-->>T: render "renewing", no API call
  T->>L: request lock
  L-->>T: granted (other tabs wait)
  T->>R: sealed cookies
  alt cookie already renewed by another tab
    R-->>T: 200, no Set-Cookie
  else expiring
    R->>G: GetTokensFromRefreshToken with DeviceKey
    G-->>R: new access and rotated refresh
    R-->>T: 200 with resealed cookies
  end
  T->>L: release
  T->>P: router.refresh()
```

A rejected or reused refresh token answers 401 and the tab goes to sign-in; Cognito unreachable answers 503 and keeps the cookies.
