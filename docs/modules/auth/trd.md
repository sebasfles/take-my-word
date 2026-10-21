---
updated: 2026-10-21
source: 0001_platform_skeleton
---

# Auth: technical

The pool and the authorizer run in dev since 0001; phase 2 brings the desktop login, phase 4 the mobile login.

## Structure

| Path | What |
|---|---|
| `infra/modules/aws/cognito` | User pool (Essentials, admin-created users only) and the `native` app client. |
| `infra/stacks/app` | Instantiates the pool per env and attaches the authorizer to the HTTP API. |
| `apps/api/src/authorizer` | Lambda authorizer: `aws-jwt-verify` against the pool's JWKS, access tokens of the native client only, `userId` from `sub`. |
| `apps/api/scripts/srp.ts`, `sign-in.ts` | SRP sign-in, device confirmation and refresh on the AWS SDK; `pnpm token` prints a `crew-e2e` access token. |
| `apps/desktop`, `apps/mobile`, `apps/web` | Login forms and token storage (phases 2, 4, 5). |

## Endpoints owned

None of the API routes; auth gates all of them.
Sign-in, refresh and sign-out go straight from the clients to Cognito.
The authorizer answers HTTP API simple responses, cached 5 minutes per `Authorization` header; a request without the header gets 401 from API Gateway, an invalid token 403.

## Client contract

- Sign in with `USER_SRP_AUTH`; the client allows no other flow.
- After the first sign-in on a device, call `ConfirmDevice` with a device SRP verifier and keep `DeviceKey` and `DeviceGroupKey` with the refresh token.
- Renew with `GetTokensFromRefreshToken`, always passing `DeviceKey`, and store the rotated refresh token it returns; without the confirmed key the answer is `Invalid Refresh Token.`.
- Never resend an old refresh token: inside the 10 s grace it still renews but revokes the access token of the previous renewal, after it Cognito answers `Refresh token reuse detected`.

## Depends on

- Amazon Cognito (Essentials tier); infra for the account, the stacks and the HTTP API.

## Depended on by

- dictation, dictionary, styles: every route reads the authorizer's `userId`.
- desktop, mobile, web: need a valid access token before calling the API.

## Configuration

- Authorizer environment: `USER_POOL_ID`, `USER_POOL_CLIENT_ID`, set by `infra/stacks/app`.
- Token lifetimes in Terraform: access and id 1 h, refresh 3650 days with rotation (10 s grace).

## Testing

- `apps/api/src/authorizer/authorize.test.ts` signs RS256 tokens locally and runs the real verifier.
- `pnpm e2e` checks 401 and 403 at the gateway and the refresh rotation of a confirmed device.
