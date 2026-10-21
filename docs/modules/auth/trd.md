---
updated: 2026-10-21
source: 0009_web_account
---

# Auth: technical

The pool and the authorizer run in dev since 0001 and in prd since 0006, the web login since 0004; phase 2 brings the desktop login, phase 4 the mobile login.

## Structure

| Path | What |
|---|---|
| `infra/modules/aws/cognito` | User pool (Essentials, admin-created users only) and the `native` app client. |
| `infra/stacks/app` | Instantiates the pool per env and attaches the authorizer to the HTTP API. |
| `apps/api/src/authorizer` | Lambda authorizer: `aws-jwt-verify` against the pool's JWKS, access tokens of the native client only, `userId` from `sub`. |
| `packages/cognito` | Node-only client: SRP sign-in, the new-password challenge, device confirmation, refresh, `ForgetDevice` and `RevokeToken`; used by `apps/web` and by the api scripts and e2e. |
| `apps/api/scripts/sign-in.ts` | `.env` helpers; `pnpm token` prints a `crew-e2e` access token; the e2e also signs in `crew-e2e-b`. |
| `apps/web/src/lib` | `session.ts` (sealed cookies), `auth.ts` (sign-in, new password, the one refresh path, sign-out), `handlers.ts` (route handlers), `refresh-lock.ts` (Web Lock around renewal), `server/account.ts` (every account page reads the API through it, or renders the renewal step). |
| `apps/desktop`, `apps/mobile` | Login forms and token storage (phases 2 and 4). |

## Endpoints owned

None of the API routes; auth gates all of them.
Desktop and mobile go straight to Cognito; the web goes through its own route handlers, so tokens never reach browser JS:

| Route (web) | Purpose |
|---|---|
| `POST /api/session` | Sign in with SRP and confirm the device, or start the new-password step. |
| `POST /api/session/password` | Answer `NEW_PASSWORD_REQUIRED` with the sealed challenge. |
| `POST /api/session/refresh` | Renew an expiring session; called by the browser under a Web Lock. |
| `POST /api/session/sign-out` | Forget the device, revoke the refresh token, clear the cookies. |
| `DELETE /api/dictations/{id}` | Delete a dictation with the session's token; 401 when the session needs renewing, so the browser renews under the Web Lock and retries once. |

Each checks `Origin` against `WEB_ORIGIN`; no page calls the API from the browser.
The authorizer answers HTTP API simple responses, cached 5 minutes per `Authorization` header; a request without the header gets 401 from API Gateway, an invalid token 403.

## Client contract

- Sign in with `USER_SRP_AUTH`; the client allows no other flow.
- After the first sign-in on a device, call `ConfirmDevice` with a device SRP verifier and keep `DeviceKey` and `DeviceGroupKey` with the refresh token.
- Renew with `GetTokensFromRefreshToken`, always passing `DeviceKey`, and store the rotated refresh token it returns; without the confirmed key the answer is `Invalid Refresh Token.`.
- Never resend an old refresh token: inside the 10 s grace it still renews but revokes the access token of the previous renewal, after it Cognito answers `Refresh token reuse detected`.

## Depends on

- Amazon Cognito (Essentials tier); infra for the account, the stacks and the HTTP API.

## Depended on by

- dictation, dictionary, styles: every route reads the authorizer's `userId`; the `api` Lambda answers 401 `unauthorized` itself if that context is ever missing.
- desktop, mobile, web: need a valid access token before calling the API.

## Configuration

- Authorizer environment: `USER_POOL_ID`, `USER_POOL_CLIENT_ID`, set by `infra/stacks/app`.
- Web function environment: `USER_POOL_ID`, `USER_POOL_CLIENT_ID` (the `native` client), `WEB_ORIGIN`, `WEB_SECRET_ID`; the secret `take-my-word-{env}/web` holds `COOKIE_KEY` (32 bytes, base64), written outside Terraform.
- Web session: `__Host-tmw-session` and `__Host-tmw-refresh`, AES-256-GCM sealed, HttpOnly, Secure, SameSite=Lax; Max-Age 400 days with remember me, renewed on every refresh, a browser-session cookie without it; `__Host-tmw-challenge` holds the new-password challenge for 3 minutes.
- Token lifetimes in Terraform: access and id 1 h, refresh 3650 days with rotation (10 s grace).

## Testing

- `apps/api/src/authorizer/authorize.test.ts` signs RS256 tokens locally and runs the real verifier.
- `pnpm e2e` checks 401 and 403 at the gateway, 401 on every route without a token, that `crew-e2e-b` can neither see nor change `crew-e2e`'s items, and the refresh rotation of a confirmed device.
- `apps/web`: unit tests for sealing, cookies, redirect rules, the auth flows and the handlers; `pnpm integration` against the dev pool (refresh past `exp` with `DeviceKey`, a second tab without a second rotation, sign-out, and a throwaway user through the new-password step); `pnpm e2e` with Playwright on dev.
