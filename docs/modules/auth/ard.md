---
updated: 2026-10-20
source: setup
---

# Auth: architecture and debt

## 2026-10-20: Cognito with username and password from phase 1, closed sign-up

- Decision: a Cognito user pool on the Essentials tier is the identity from the first phase; Sebastian creates every user, there is no sign-up and no captcha.
- Alternatives rejected: a static API token until a later Cognito phase with Google, as the original proposal ordered it; Google sign-in in v1.
- Reason: per-user quota, settings and data need a real user from the first `POST /dictations`; Essentials is free under 10k MAU, and AWS covers identity so no third-party vendor is added.
- Debt created: no Google sign-in until phase 6; password resets are done by hand until then.
- Revisit when: phase 6 starts, or anyone outside the invited circle needs an account.
- Source: setup

## 2026-10-20: One Lambda authorizer in front of every route

- Decision: a single Lambda authorizer validates the Cognito JWT on the HTTP API and hands the user id to `api` and `dictate`; its result is cached 5 minutes.
- Alternatives rejected: the HTTP API's built-in JWT authorizer.
- Reason: one gate that will later accept a second credential kind, the `x-api-key` service credential for integrations, as Sebastian asked.
- Debt created: none.
- Revisit when: the `x-api-key` credential lands.
- Source: setup

## 2026-10-20: Long-lived revocable sessions

- Decision: access token 1 h; refresh token 10 years with rotation, the client overwrites the stored refresh token on every renewal; device tracking on, so sessions can be revoked per device or globally; no remember-me on desktop and mobile.
- Alternatives rejected: short refresh tokens that force periodic re-login.
- Reason: a dictation tool must work the moment the hotkey is pressed; revocation per device replaces expiry as the safety net.
- Debt created: a leaked refresh token stays valid until someone revokes it.
- Revisit when: accounts open beyond invited users.
- Source: setup

## 2026-10-20: Native login forms with SRP, no managed login yet

- Decision: desktop, mobile and web show their own username and password form against Cognito (SRP); tokens live in the OS keychain on desktop and in `expo-secure-store` on mobile.
- Alternatives rejected: Cognito managed login with PKCE through the system browser and a `takemyword://` deep link, as the original proposal planned.
- Reason: managed login needs a custom domain, an ACM certificate in us-east-1, a parent A record and a verified consent screen, all of which only pay off with Google sign-in.
- Debt created: three login forms to keep in step; phase 6 adds the PKCE path next to them.
- Revisit when: phase 6 (Google sign-in) starts.
- Source: setup
