---
id: "0009"
title: web_account
type: feature
crew: pair
clearance: full
branch: feat/0009_web_account
modules: [dictation, dictionary, styles, auth]
repos: ["."]
phases: 0
depends_on: ["0003", "0004"]
ticket:
created: 2026-10-21
updated: 2026-10-21
---

# 0009 Web account views

## Goal

A signed-in user opens the web and sees their account the way the PRD states it: read-only views of settings, dictionary, styles, app rules and history, with the only write being deleting a dictation from history.
The web is informative; editing happens in the desktop app.

## Scope

- Under `/app` (the authenticated shell from 0004), five pages with a left navigation: Account (username, default style, locale, default providers, daily quota used today), Dictionary (terms with aliases, use count and last used date, sorted by the same decayed score the API uses, or by name), Styles (built-ins marked as such, then custom ones with their prompt), App rules (app, style, paste keystroke), History (dictations newest first with text, style, date and audio seconds; cursor pagination with "load more"; a delete action per dictation with confirmation).
- Every read goes through the API with the session's access token from the server side (route handlers or server components), using the `packages/shared` contracts; no client-side token.
- Empty states for each page ("no terms yet, add them from the desktop app"), loading states, and one generic error state that keeps the shell.
- Spanish and English copy through the existing language switch.
- Screenshots of the five pages at 390, 768 and 1280 px with mocked data, refreshed every round, in `.workspaces/0009_web_account/screenshots/` and listed by path in the PR.
- Unit tests for the data mapping (score ordering, pagination cursor, date formatting) and the delete flow; e2e against dev with `crew-e2e` seeded through the API.
- Docs: dictation, dictionary, styles and auth module docs via `document-task` (web parts).

## Out of scope

- Creating or editing terms, styles, rules or settings on the web.
- Exporting history, search, filters.
- Charts or usage dashboards.
- Deferred: a "daily quota" bar if the API exposes usage; otherwise show the cap only.

## Acceptance

1. Root `pnpm lint`, `typecheck`, `test` pass; `ci` green on the PR; after merge `deploy-dev` web job green.
2. Signed in as `crew-e2e` on dev, each of the five pages renders the seeded data: 3 terms, 1 custom style plus the 3 built-ins, 1 app rule, 2 dictations; the Account page shows the default style set during seeding.
3. History: "load more" fetches the next page when more than one page exists; deleting a dictation asks for confirmation, removes it from the list and from `GET /dictations`.
4. Every page shows its empty state for a fresh user (a second crew user with no data).
5. Unauthenticated access to any `/app/*` page redirects to sign-in; an expired session is refreshed transparently (covered by 0004's refresh path) and the page renders.
6. No token appears in HTML, client JavaScript or network requests from the browser; the API is called only from the server.
7. Screenshots for the five pages at the three widths are in the workspace and listed in the PR; the layout has no horizontal scroll at 390 px.
8. Spanish and English switch covers every new string.

## Approach

- Server components fetch through a small API client in `apps/web/src/lib/api.ts` that attaches the access token from the sealed session; the delete action is a route handler; alternative rejected: client-side fetches with a proxied token, more surface for leaks.
- Decayed score ordering reuses the formula from `docs/modules/dictionary` (half-life 30 days) computed in the page; alternative rejected: a new API field, since the ranking is not part of the contract.
- Navigation as a simple list in the shell layout; no component library; styles in the existing `globals.css` with a few utility classes.
- Pagination cursor passed as a query string; "load more" is a link that appends, rendered server side.

## Database

None; reads `DICT#`, `STYLE#`, `APPRULE#`, `SETTINGS`, `DICTATION#` through the API; deletes dictations through `DELETE /dictations/{id}`.

## Infra

None; web already hosted. If the API needs a usage endpoint for the quota bar, that is a deferred item, not this task.

## Design

None; the pages are plain lists and tables designed in code and reviewed from the screenshots.

## Risks

- Rendering the full dictionary and history on the server is fine at v1 sizes (500 terms, paginated history).
- Delete through a route handler must carry the `x-amz-content-sha256` lesson from 0004 for browser POSTs.

## Depends on

0003, 0004 (both merged). Runs alongside 0002.

## Context & decisions

Consolidated 2026-10-21; these adjustments override Scope and Acceptance above where they differ.

- Adjusted Scope (Sebastian): the Account page shows no daily quota; the API exposes neither usage nor cap (`DAILY_QUOTA_MINUTES` lives only on `dictate`). The om-manager opens a follow-up for `GET /me/usage`; the "Deferred" item in Out of scope is replaced by that follow-up.
- Adjusted Scope (Sebastian): History shows each dictation's `raw` transcript collapsed under its text, as `docs/modules/dictation/prd.md` states.
- Adjusted Acceptance 2 and 4 (Sebastian): the web e2e creates two throwaway Cognito users per run with the `fless-takemyword` profile, as `apps/web/integration/new-password.int.ts` does; one seeded through the API (3 terms, 1 custom style set as default, 1 app rule, 2 dictations via `POST /dictations` with Polly speech), one left fresh. Both users and every item under their `USER#{sub}` are deleted at the end, even on failure. `crew-e2e` and `crew-e2e-b` are not touched, because the api e2e and 0007 use them.
- Score (om-reviewer): `decayedScore` and `rankTerms` move from `apps/api/src/dictation/dictionary-projection.ts` into `packages/shared`, with the default half-life 30 exported; api and web import the one function, api behavior unchanged.
- Load more (om-reviewer): the history page accepts `?limit=` within `historyQuerySchema` bounds (default 20); the e2e uses `limit=1` to get a second page. Appended pages are rendered server side, survive a delete followed by a refresh, and the number of re-fetched pages is bounded.
- Delete (om-reviewer): a route handler `DELETE /api/dictations/[id]` with the `Origin` check, called through `signedFetch`; no server action, since CloudFront OAC needs `x-amz-content-sha256`. It answers 401 when the access token needs a refresh, so the client renews under the Web Lock and retries once.
- Style names (om-reviewer): built-ins get a localized name by id, custom styles their name from `GET /styles`, a dangling id "deleted style", and a rule without a style "default style".
- Routes (om-reviewer): Account at `/app` replaces the "coming soon" card; then `/app/dictionary`, `/app/styles`, `/app/rules`, `/app/history`.

Constraints:

- Contracts only from `packages/shared`; no schema is redefined in `apps/web` (CLAUDE.md).
- Every page renders `RenewSession` instead of calling the API when the token is in its last minute; the server render never refreshes (`docs/modules/auth/ard.md`, Web Lock decision).
- No token in HTML, the RSC payload or client props: never pass the session object to a client component. The e2e asserts that no browser request goes to the API host and that no response body matches a JWT.
- No horizontal scroll at 390 px; screenshots via `pnpm screenshots` with the mocked API extended to every route, into `.workspaces/0009_web_account/screenshots/`.
- The `es` and `en` dictionaries keep the same keys.

Review focus beyond the Pipeline: token leakage into client components, the renew branch on every page, the delete handler's origin and 401 paths, cleanup of the e2e's throwaway users and their items, and score ordering against the api's tie-breaks.

clearance: full (dev Cognito pool, dev table and Polly through the `fless-takemyword` profile, dev API and web; no Terraform, no prd).

## om-developer notes
