---
id: "0004"
title: web_landing
type: feature
crew: pair
clearance: full
branch: feat/0004_web_landing
modules: [auth, infra, dictation]
repos: ["."]
phases: 0
depends_on: ["0001"]
ticket:
created: 2026-10-21
updated: 2026-10-21
---

# 0004 Web: hosting, landing and sign-in

## Goal

Anyone can open `takemyword.fless.dev`, read what Take My Word does and download the Windows app; an invited user can sign in and reach their account page.
This task puts `apps/web` on its hosting so 0009 can add the read-only views.

## Scope

- `apps/web`: Next.js App Router in the pnpm workspace, TypeScript, minimal styling with no component library.
  - Landing: product name and tagline, a short pitch (hold a key, speak, release), what v1 does, a "Download for Windows" button pointing to the GitHub Releases latest page of `sebasfles/take-my-word` (the asset itself arrives with 0005), and a sign-in link. Spanish copy first with an English version behind a language switch.
  - Sign-in page: username and password against Cognito (SRP in the browser via the Cognito identity SDK), tokens kept server side in an HttpOnly session cookie through a Next.js route handler and refreshed with the rotated refresh token; "remember me" checkbox deciding whether the cookie survives the browser session (PRD: web gets one).
  - Authenticated shell at `/app`: layout with the account identity (username) and sign-out; the page body says the account views arrive next (0009 fills it). Unauthenticated access to `/app` redirects to sign-in.
  - API client for `GET /me/settings` from `packages/shared` contracts, used once to prove the session reaches the API.
- `infra`: OpenNext build served by a Lambda (Node 24 ARM64) behind CloudFront with an assets bucket, ACM certificate in us-east-1, Route 53 alias `dev.takemyword.fless.dev` (dev) and `takemyword.fless.dev` (prd planned only); modules `cloudfront`, `s3`, `acm` added under `modules/aws`; deploy role extended with the web function, bucket sync and invalidation; applied to dev.
- `.github/workflows`: `deploy-dev` and `deploy-prd` gain a web job (OpenNext build, `update-function-code`, `aws s3 sync` of assets in two passes, CloudFront invalidation) path-filtered to `apps/web`, `packages/shared` and workflows; `ci` covers web lint, typecheck and tests.
- Screenshots in the workspace of landing, sign-in and `/app` at 390, 768 and 1280 px with mocked data, refreshed every round.
- Docs: `docs/TRD.md` web row and section; auth and infra module docs via `document-task`.

## Out of scope

- Read-only views of dictionary, styles, app rules, history: 0009.
- Google sign-in, public sign-up, password reset UI.
- SEO beyond title and description, analytics, cookie banner.
- Deferred: hosting the installer on AWS instead of GitHub Releases; prd apply (0006).

## Acceptance

1. Root `pnpm lint`, `pnpm typecheck`, `pnpm test` pass with web included; `terraform fmt -check` and `validate` pass for core, dev, prd; `ci` green on the PR.
2. `https://dev.takemyword.fless.dev` serves the landing over HTTPS from CloudFront with the Spanish copy, the download button linking to `https://github.com/sebasfles/take-my-word/releases/latest`, and the English switch working; static assets come from the bucket with immutable caching for `_next/static`.
3. Sign-in with `crew-e2e` lands on `/app` showing the username; a wrong password shows one generic error; `/app` without a session redirects to sign-in; sign-out clears the session and `/app` redirects again.
4. The session survives a browser restart only when "remember me" was checked; the access token is refreshed silently when it expires (proven by a short-lived test or by waiting past the expiry in e2e).
5. `/app` performs `GET /me/settings` against the dev API with the session's access token and renders the default style id.
6. After merge, the web job of `deploy-dev` is green and the landing reflects the merged commit; the promotion PR updates.
7. Screenshots for the three pages at the three widths are in the workspace and attached to the PR.
8. Unit tests cover the session cookie handling, the redirect rules and the language switch.

## Approach

- OpenNext on Lambda behind CloudFront, the pattern already used by the API's sibling projects: one server function, one assets bucket, one distribution with behaviors for `_next/static/*` (bucket) and everything else (function); alternative rejected: Vercel, since AWS covers hosting.
- Session in an HttpOnly, Secure, SameSite=Lax cookie holding the Cognito tokens encrypted with a server secret from Secrets Manager (`take-my-word-{env}/web`), refresh performed in a route handler; alternative rejected: tokens in localStorage, exposed to scripts.
- SRP sign-in with the Cognito identity SDK in the browser, posting the resulting tokens to the route handler that sets the cookie; alternative rejected: managed login, which is phase 7 with Google.
- Language: `es` default, `en` via a cookie and a switch; copy in two small dictionaries, no i18n framework.
- Download button targets the Releases latest page so it never breaks; 0005 publishes the asset.

## Database

None; web reads through the API. References `SETTINGS` through `GET /me/settings`.

## Infra

- dev: web Lambda (512 MB, 30 s), assets bucket (private, OAC), CloudFront distribution with the ACM certificate for `dev.takemyword.fless.dev`, Route 53 alias, secret `take-my-word-dev/web` with the cookie key; deploy role gains `UpdateFunctionCode`/`GetFunction` on the web function, `s3:PutObject`/`ListBucket` on the assets bucket, `cloudfront:CreateInvalidation`.
- prd: same resources planned only, `takemyword.fless.dev`.
- Env for the web function: `API_URL`, `USER_POOL_ID`, `USER_POOL_CLIENT_ID`, `WEB_SECRET_ID`.
- Workflows: web job in `reusable-deploy` or a sibling, path-filtered; Actions variables for the function name, bucket and distribution written by Terraform.

## Design

None; three plain pages designed in code and reviewed from the screenshots.

## Risks

- First CloudFront and ACM apply takes minutes and the DNS validation must land in the account's hosted zone.
- OpenNext version compatibility with the Next.js release chosen; pin both.
- Cognito SRP in the browser needs the app client without a secret, which 0001 created.

## Depends on

0001 (merged). Runs in parallel with 0002 (desktop), which shares no files beyond root workspace config already on develop.

## Context & decisions

Consolidated 2026-10-21 by the om-reviewer with the om-manager.

- Approach adjusted (om-manager): SRP runs server side in the sign-in route handler, not in the browser; no Cognito browser SDK. The proven code in `apps/api/scripts/srp.ts` and `sign-in.ts` moves to a small Node-only workspace package imported by the api scripts and e2e and by web. Tokens never reach browser JS; the password crosses TLS to the Lambda and is never logged or stored.
- Device (om-reviewer, from `docs/modules/auth/ard.md` 2026-10-21): after each sign-in the handler calls `ConfirmDevice`; the sealed session holds access token, refresh token and `DeviceKey`; every refresh passes `DeviceKey` and stores the rotated refresh token.
- Scope added (om-manager): `NEW_PASSWORD_REQUIRED` is answered with a "choose your password" step in the sign-in flow (Sebastian's dev user is still FORCE_CHANGE_PASSWORD); no reset UI.
- Remember me (om-manager): checked sets a persistent cookie, Max-Age 400 days, renewed on every refresh; unchecked sets a browser-session cookie. `document-task` updates `docs/modules/auth/prd.md` (its "later" and its open question).
- Sign-out (om-manager): a POST that calls `RevokeToken` and `ForgetDevice`, then clears the cookie. Debt recorded by `document-task`: an unchecked session closed without sign-out leaves a live refresh token and a device in Cognito.
- App client (om-reviewer): web reuses the `native` client, the only one the authorizer accepts; the API is called server side only, so CORS is unchanged.
- Hosting reference (om-manager): copy `/home/fless/dev/personal/projects/my-napkin` (`infra/modules/aws/cloudfront`, `infra/stacks/app/cdn.tf`, `.github/workflows/reusable-deploy.yml`) with its lessons: OAC to an `AWS_IAM` Function URL with both Lambda permissions (`InvokeFunctionUrl` and `InvokeFunction`); every same-origin browser request carries `x-amz-content-sha256` through one signed-fetch helper, so sign-in, new password, sign-out and the language switch never use a plain form post or a Server Action; `public/static/` is the only public folder, served with `_next/static/*` from the bucket.
- Scope adjusted (om-reviewer): `infra/modules/aws/acm` exists and the stack is in us-east-1, so only `cloudfront` and `s3` are added, plus a Function URL option in `lambda`.
- Acceptance 4 (om-reviewer): proven by a unit test with an injected clock for the refresh decision, and an integration test against the dev pool that seals a real `crew-e2e` session, moves the clock past `exp`, refreshes through the request path with `DeviceKey`, sees the refresh token rotate and gets 200 from `GET /me/settings` with the new access token. No hour-long wait.
- Acceptance 7 reworded (om-manager): screenshots of the three pages at 390, 768 and 1280 px live in `.workspaces/0004_web_landing/screenshots/`, refreshed every round, and are listed by path in the PR description.
- Language (om-reviewer): the `es`/`en` cookie applies to all three pages and sets `<html lang>`; no `Accept-Language` detection.
- Pre-merge (om-reviewer): dev is applied and the web code and assets are pushed from this machine with the same commands as the web job, as 0001 and 0003 did; Acceptances 2, 3 and 5 are proven on `https://dev.takemyword.fless.dev` before the PR. The web job in `deploy-prd` fails on `main` until prd is applied (0006), like the api job.

Constraints:

- Contracts only from `packages/shared` (`CLAUDE.md`); `GET /me/settings` parsed with `settingsSchema`.
- Terraform owns infra and CI only swaps code (`docs/modules/infra/ard.md`); the Lambda module keeps ignoring code fields; the deploy role gains only the web function, the bucket and the invalidation; Actions variables written by `stacks/app`.
- The cookie key lives in `take-my-word-{env}/web` (placeholder in Terraform, value put by the crew, never printed); OpenNext with incremental and tag caches off, images unoptimized, Next.js and OpenNext pinned.
- Deploy jobs path-filtered per job, so an api-only merge does not redeploy web and vice versa; `ci` also builds web; `package.json` and `pnpm-lock.yaml` trigger both.
- TRD web verification row set (lint, typecheck, unit, e2e with `--workers=1`); e2e signs out at the end so it leaves no device behind.

Review focus beyond the Pipeline:

- Refresh happens in one code path; two concurrent requests with an expired token do not sign the user out.
- Session cookies: HttpOnly, Secure, SameSite=Lax, AES-GCM sealed, each under 4096 bytes measured with real tokens; a tampered cookie reads as signed out.
- Sign-in, sign-out and new-password POSTs check `Origin`; no auth bypass or mock switch reachable in the deployed build.
- CloudFront never caches a per-user or per-language response; security headers policy (HSTS, nosniff, frame-ancestors none).
- Errors: wrong credentials show one generic message, an unreachable service its own; the password never appears in logs.

clearance: full: AWS profile `fless-takemyword` (apply dev, plan prd, push dev web code and assets, write the dev web secret), `crew-e2e` in the dev pool including forgetting its devices, GitHub `sebasfles/take-my-word`.

## om-developer notes

### Round 1

Did:

- `packages/cognito` (`@take-my-word/cognito`, Node only): `srp.ts` moved from `apps/api/scripts` with `git mv`, plus `signIn` (now returns `signed-in` or `new-password-required`), `completeNewPassword`, `confirmDevice`, `forgetDevice`, `refresh`, `revokeToken`; one Cognito client per region.
  `apps/api/scripts/sign-in.ts` keeps only the `.env` helpers and imports the package; the api e2e imports it directly.
- `apps/web`: Next.js 16.3.8, React 19.3.1, `@opennextjs/aws` 4.1.10, all pinned; landing, `/sign-in` (credentials step and choose-password step), `/app` shell with username, sign-out and `GET /me/settings` parsed with `settingsSchema`; `es` default and `en` through the `tmw-lang` cookie on all three pages and `<html lang>`.
- Session: two cookies, `__Host-tmw-session` (access token, `DeviceKey`, remember flag) and `__Host-tmw-refresh` (refresh token), each AES-256-GCM sealed with its cookie name as associated data, HttpOnly, Secure, SameSite=Lax, Path=/; Max-Age 400 days only when remember me was checked, renewed on every refresh.
  Measured with real `crew-e2e` tokens: 1767 and 2610 bytes per `Set-Cookie` header.
  The `NEW_PASSWORD_REQUIRED` challenge lives in a third sealed cookie, `__Host-tmw-challenge`, for 3 minutes; the password and the Cognito session never reach browser JS.
- Route handlers: `POST /api/session`, `/api/session/password`, `/api/session/refresh`, `/api/session/sign-out`, `/api/locale`; every one checks `Origin` against `WEB_ORIGIN` and every browser call goes through `signedFetch`; no Server Action, no form post, no middleware.
- Infra: modules `s3` and `cloudfront` (security headers policy: HSTS 2 years, nosniff, `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`), `function_url` option in `lambda`, `stacks/app/web.tf` (certificate, secret `take-my-word-{env}/web` with `COOKIE_KEY`, web Lambda 512 MB 30 s, assets bucket, distribution, both Lambda permissions), deploy role and Actions variables `WEB_FUNCTION_NAME`, `WEB_ASSETS_BUCKET`, `WEB_DISTRIBUTION_ID`.
  Applied to dev (27 added, 1 changed); prd planned only (107 to add); dev `COOKIE_KEY` written, never printed.
- Workflows: `reusable-changes` diffs the push against its previous head and gives `api` and `web` booleans; `deploy-dev` and `deploy-prd` run `reusable-deploy` (api) and the new `reusable-deploy-web` per job; the promotion PR waits for both and runs unless one failed; `ci` also runs the OpenNext build.
- Dev deployed from this machine with the web job's commands; integration (3) and e2e (6) green on `https://dev.takemyword.fless.dev`; api e2e green after the move.
- Screenshots: `.workspaces/0004_web_landing/screenshots/` holds landing, sign-in, sign-in with the error and `/app`, in `es` and `en`, at 390, 768 and 1280, from `pnpm screenshots` (mocked API, local cookie key, sealed fake session).
- TRD verification rows for `web` and `cognito` set, since `verify-task` reads them; the rest of the TRD web section waits for `document-task`.

Decisions not in the plan:

- Cognito keeps only the refresh token issued by the call that finished last: two refreshes of one token both succeed inside the grace period, then renewing the earlier one fails with `RefreshTokenReuseException` (reproduced 4 of 4 against the dev pool).
  The browser keeps whichever `Set-Cookie` arrives last, so two server-side refreshes racing would sometimes leave a dead token and sign the user out an hour later.
  So refresh is never triggered by a server render: a page that finds the access token in its last minute renders `RenewSession`, which calls `POST /api/session/refresh` inside a Web Lock (`navigator.locks`, name `tmw-session-refresh`) shared by every tab of the origin; the second tab then carries the renewed cookies and the handler returns without calling Cognito.
  `refreshSession` in `src/lib/auth.ts` is the one code path, also used by sign-out; `RefreshTokenReuseException` and `NotAuthorizedException` sign out, anything else answers 503 and keeps the cookies.
  A browser without Web Locks still renews, unserialized; two concurrent requests from outside a browser can still race, which is debt for `document-task`.
- `WEB_ORIGIN` joins the function's environment: the `Origin` check needs the public origin, and the `Host` the function sees is the Function URL's (`AllViewerExceptHostHeader`).
- `WEB_COOKIE_KEY` (base64) replaces `WEB_SECRET_ID` when set, only for `pnpm screenshots`; Terraform never sets it, so the deployed function always reads Secrets Manager.
- Sign-out refreshes an expiring session first, then `ForgetDevice` (it needs a live access token), then `RevokeToken`, and clears the cookies even if Cognito fails.
- The deploy zips the server function with `zip -y`: pnpm's symlinked `node_modules` resolve only if the links are kept; without it the function failed with `Cannot find module '@swc/helpers/...'` (seen on dev).
- `/_next/static/*` is synced before the function update and the rest after it, so new HTML never points at missing chunks; nothing is deleted from the bucket.
- `@next/eslint-plugin-next` and `eslint-plugin-react-hooks` live at the root because the root `eslint.config.js` loads them for `apps/web/**`.
- In the `/app` header below 768 px the brand shows only its mark so the username fits.

Pending: none for round 1.
Acceptance 6 (deploy-dev web job green after merge) can only be proven after merge.

Deferred:

- Next's image optimization and revalidation functions are built by OpenNext and never deployed; harmless, skipped.

External actions (clearance full, profile `fless-takemyword`, us-east-1, dev):

- `infra/scripts/tf dev apply`: 27 added, 1 changed, 0 destroyed.
- `infra/scripts/tf prd plan -lock=false`: 107 to add, not applied.
- `secretsmanager put-secret-value` on `take-my-word-dev/web` with a random 32-byte `COOKIE_KEY`.
- `aws s3 sync` to `take-my-word-dev-web-assets-115891590483` (two passes), `lambda update-function-code` on `take-my-word-dev-web` (twice, the second with `zip -y`), `cloudfront create-invalidation` on `EMI6CYP83OTMO`.
- `cognito-idp admin-forget-device` on five `crew-e2e` devices left by my refresh-race experiment and one failed integration run; the pool now holds none.
