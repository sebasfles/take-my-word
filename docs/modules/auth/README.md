---
updated: 2026-10-21
source: 0004_web_landing
---

# Auth

Decides who may use Take My Word and proves it on every request.
Sebastian invites users into a Cognito user pool; each signs in with username and password on desktop, mobile or web and stays signed in until sign-out or revocation.
A Lambda authorizer validates the token on every API route so every other module works on one known user.

## Boundaries

- Owns: the user pool and its app clients, token lifetimes and revocation, the authorizer, the login forms and token storage in every client.
- Does not own: user settings, quota and provider defaults (dictation), hotkey and recording (desktop, mobile), the HTTP API itself (infra).
- Code: `infra/modules/aws/cognito`, `infra/stacks/app`, `apps/api/src/authorizer`, `packages/cognito`, `apps/web/src/lib` (session, handlers); `apps/desktop` and `apps/mobile` later.

## Documents

- [prd.md](prd.md): product behavior
- [trd.md](trd.md): structure and endpoints
- [ard.md](ard.md): decisions and debt
- [database.md](database.md): tables and invariants
- [flows.md](flows.md): sign-in and silent refresh
