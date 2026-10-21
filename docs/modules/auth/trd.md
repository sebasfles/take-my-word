---
updated: 2026-10-20
source: setup
---

# Auth: technical

Planned; no code yet, phase 1 builds the pool and the authorizer, phase 2 the desktop login, phase 4 the mobile login.

## Structure

| Path | What |
|---|---|
| `infra/modules/aws/cognito` | Terraform module for the user pool and its app clients. |
| `infra/stacks/app` | Instantiates the pool per env and attaches the authorizer to the HTTP API. |
| `apps/api` | Lambda authorizer that validates the Cognito JWT and passes the user id to `api` and `dictate`; separate function from both. |
| `apps/desktop` | Login form against Cognito (SRP), token storage in the OS keychain, silent refresh. |
| `apps/mobile` | Login form against Cognito (SRP), token storage in `expo-secure-store`, silent refresh. |
| `apps/web` | Login form for settings, history and account; session handling on the Next.js side. |

## Endpoints owned

None of the API routes; auth gates all of them.
Sign-in, refresh and sign-out go straight from the clients to Cognito, not through `apps/api`.
The authorizer runs on every route of the HTTP API and its result is cached 5 minutes.

Jobs, listeners or scheduled work: none.

## Depends on

- Amazon Cognito (Essentials tier): user pool, SRP sign-in, refresh token rotation, device tracking.
- infra: account, Terraform stacks, the HTTP API the authorizer attaches to.

## Depended on by

- dictation: every `POST /dictations` and `GET /dictations` call carries the user id from the authorizer.
- dictionary, styles: their CRUD routes are scoped to the authorizer's user id.
- desktop, mobile: both need a valid access token before recording.

## Configuration

- User pool id and app client id per env, exposed by Terraform to the authorizer and baked into each client build.
- Token lifetimes live in Terraform: access 1 h, refresh 10 years with rotation.

## Testing

- Not written yet; phase 1 verifies the gate with curl and a token from a Cognito user.
- Module-specific run: see TRD.
