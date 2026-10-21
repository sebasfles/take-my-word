---
id: "0010"
title: brand_web
type: feature
crew: pair
clearance: full
branch: feat/0010_brand_web
modules: [auth, dictation, dictionary, styles, infra]
repos: ["."]
phases: 0
depends_on: []
ticket:
created: 2026-10-21
updated: 2026-10-21
---

# 0010 Brand system and website redesign

## Goal

Take My Word gets a real identity and a website that looks like a product people want: a distinctive mark and wordmark, a shared design system, and a landing, sign-in and account area designed with care down to the pixel.
The same system will dress the desktop app in 0011, so web and desktop read as one product.

## Scope

- Identity, as source files in the repo:
  - Mark and wordmark for "Take My Word" (SVG), built around a speech bubble or quotation mark that becomes a sound wave; legible at 16 px (favicon, tray) and striking at hero size; monochrome, light and dark variants.
  - App icon set derived from the mark (favicon, apple-touch, PWA sizes, Windows `.ico` sizes up to 256, a 1024 master), and an Open Graph image.
  - Tagline "Your Word, Our Command." and a short voice and tone guide (Spanish first, English second) for product copy.
- `packages/brand`: the single source of the design system, consumed by `apps/web` now and `apps/desktop` in 0011:
  - Tokens for color (one signature accent with a full tonal scale, warm neutrals, semantic success, warning, error, info), light and dark themes, type scale, font families, spacing, radii, shadows, borders, z-index and motion (durations and easings), exported as CSS custom properties and as TypeScript.
  - Fonts: one expressive display face and one highly legible text face from Google Fonts with full Spanish diacritics, self-hosted, with fallbacks tuned to avoid layout shift.
  - The waveform as a reusable React component (animated bars driven by a level value or a demo loop), honoring `prefers-reduced-motion`.
  - A few primitives shared by web and desktop: button, input, select, textarea, checkbox, toggle, dialog, toast, tabs or nav item, badge, empty state, skeleton; accessible (keyboard, focus rings, ARIA) and themed by the tokens. No third-party component library.
  - A `README.md` with the brand rules (logo clear space and misuse, color usage, type pairing, voice).
- Website redesign (`apps/web`) using only `packages/brand`:
  - Landing: hero with the mark, the headline and an animated demo of the product (hold the keys, speak, the waveform moves, release, clean text appears in a mock window, with a real Spanish before and after); how it works in three steps; personal dictionary and styles explained with concrete Spanish examples; per-app rules; privacy (audio never stored, text kept 90 days); download for Windows with the current version from the latest release and a "macOS and Linux soon" note; footer with the tagline and links. Spanish and English.
  - Sign-in and choose-password pages redesigned.
  - Account area: shell and navigation, Account, Dictionary, Styles, App rules and History pages redesigned with real empty, loading and error states; the History list reads well with long texts.
  - Light and dark themes following the system with a manual switch remembered per browser.
  - Metadata: title, description, favicon set, Open Graph and Twitter cards from the brand assets.
- Design process inside the task: the first milestone presents three distinct visual directions (mark, palette, type, hero) as rendered screenshots; the om-reviewer sends them to the om-manager, who chooses one; the rest of the task executes that direction.
- Screenshots of every page at 390, 768 and 1280 px, light and dark, Spanish and English, refreshed every round, in `.workspaces/0010_brand_web/screenshots/` and listed in the PR.
- Docs: a short `docs/modules/web` is not created; brand rules live in `packages/brand/README.md`; module docs touched by the web changes are updated via `document-task`; `docs/TRD.md` lists `packages/brand`.

## Out of scope

- The desktop app (0011).
- New features or copy that changes product behavior; the account pages keep the same data and actions.
- Marketing extras: blog, pricing, analytics, newsletter.
- Deferred: a product video; macOS download once builds exist.

## Acceptance

1. Root `pnpm lint`, `typecheck`, `test` pass with `packages/brand` included; `ci` green on the PR; after merge the web job of `deploy-dev` is green.
2. The three directions are in the PR description as images or paths with the chosen one marked and a one-line reason.
3. Every color pair used for text meets WCAG AA in light and dark (a unit test over the token pairs), focus is always visible, and every interactive element is reachable by keyboard.
4. No page has horizontal scroll at 390 px, nothing overlaps or truncates at 390, 768 and 1280 px, and the hero demo loops smoothly and is static under reduced motion.
5. The mark reads at 16 px (favicon screenshot) and the OG card renders in a social preview check.
6. `apps/web` contains no hard-coded colors, font families, spacing or radii outside `packages/brand` tokens (a lint rule or test enforces it).
7. Lighthouse on the landing (mobile, dev deployment): performance and accessibility at least 90, best practices and SEO at least 95; fonts cause no visible layout shift (CLS under 0.05).
8. Every page renders correctly in both languages and both themes, with screenshots of all of them in the workspace.
9. The account area keeps every behavior from 0009 (e2e from 0009 still green).

## Approach

- One package `packages/brand` for tokens, fonts, assets and primitives; alternative rejected: separate token and UI packages, more indirection for two consumers.
- Tokens authored once in TypeScript and generated to CSS custom properties at build time; alternative rejected: hand-maintained CSS and TS in parallel.
- Primitives written in-house on the tokens; alternative rejected: a component library, which would fight the identity and the desktop WebView budget.
- Directions explored as real rendered pages, not abstract boards, so the choice is made on the actual product.

## Database

None.

## Infra

- Web assets and fonts served from the existing assets bucket through CloudFront with long cache; no new AWS resources.
- Pre-merge deployment to dev for the Lighthouse run follows the 0004 pattern.

## Design

The direction is delegated by Sebastian to the om-manager (2026-10-21): confident and warm, editorial rather than techy, voice-first, Spanish first; the waveform is the brand's signature. Hard requirement: web and desktop share the same essence.

## Risks

- Taste is the risk: the three-direction step exists to choose deliberately.
- Font weight and the hero animation can hurt performance; Acceptance 7 guards it.
- The account pages from 0009 must not regress while being restyled.

## Depends on

None. Runs in parallel with 0008, which touches only `apps/desktop`; 0011 waits for both.

## Context & decisions

Consolidated 2026-10-21; these override Scope, Acceptance and Approach above where they differ.

- Direction gate (om-manager): round 1 delivers only three directions as real code; per direction, mark and wordmark at hero size and 16 px, palette with the accent scale, Spanish type specimen, landing hero at 390 and 1280, light and dark, in `.workspaces/0010_brand_web/screenshots/directions/{a,b,c}/`.
  The om-reviewer reviews them, sends the paths to the om-manager, who answers `direction X: reason` plus optional adjustments; one choice round only.
  The losing directions are deleted from the branch before the PR; Acceptance 2 is met by paths.
- Acceptance 7 (om-manager): Lighthouse mobile preset on `https://dev.takemyword.fless.dev/` (es, system theme) after one warm-up request, median of 3 runs, JSON reports in `.workspaces/0010_brand_web/lighthouse/`; a cold start is not counted.
- Tokens (om-reviewer, adjusts Approach): `packages/brand` exports TypeScript source like `packages/shared`, with no build step; the token CSS is generated by a script from the TS tokens, committed with a generated marker, and a unit test fails if it differs from the generator output.
- Assets (om-reviewer): icons, `.ico` and the OG image are generated from the SVG master by a committed script, outputs committed; fonts are woff2 with their OFL license next to them.
- Theme (om-reviewer): system, light or dark, default system, kept in a cookie and rendered server side as an attribute on `<html>`, so there is no flash and no inline script.
- Download version (om-reviewer): read server side from the latest release's `latest.json`, cached in memory with a short timeout, never blocking the page; on failure the button shows without the version.
- Primitives not used by the web (om-reviewer): built as Scope says, with keyboard and ARIA unit tests, and shown in a gallery route that only exists when the screenshot script enables it.
- OG (om-reviewer): one image matching the default `es` page, absolute URLs from `WEB_ORIGIN`; the social preview check is a screenshot of a public preview of the dev URL, saved in the workspace.
- Hero loop (om-reviewer): a recorded video of one full loop at 390 and 1280 and a reduced-motion screenshot, in the workspace.

Constraints:

- Contracts only from `packages/shared`; the auth flows, `RenewSession`, the Web Lock, the `Origin` checks and no tokens in client props stay as they are (`docs/modules/auth/ard.md`).
- The 0009 and 0004 e2e may change selectors or copy, never drop or weaken an assertion; e2e runs against the round's commit deployed to dev, the deployed sha logged next to it.
- Every asset the pages load is inlined or bundled under `/_next/static` (immutable); `/static/` only for fixed-URL files (favicons, manifest icons, OG). Primitives' styles work in Next and Vite with no runtime CSS-in-JS.
- `reusable-changes` adds `packages/brand/` to the web filter; `docs/TRD.md` gets a `brand` verification row in round 1, since `verify-task` reads it.
- Acceptance 6 is enforced by a test over `apps/web` CSS and TSX: color literals (including SVG fills and `themeColor`), font families, font sizes, margin, padding, gap, inset, radii, shadows and durations come from tokens; media query breakpoints are exempt.
- Acceptance 3 pairs: each text role against each surface it can sit on, 4.5:1 body, 3:1 large text, icons, borders of inputs and focus rings.
- The screenshot script covers every page and state (data, empty, loading, error, sign-in error, choose-password) at 390, 768, 1280, light and dark, es and en, and fails on horizontal overflow.

Review focus beyond the Pipeline: e2e assertions kept, no token leakage, contrast pairs complete, font bytes and the hero animation's cost, the losing directions gone.

clearance: full (dev only: web code and assets deployed to dev from this machine with `reusable-deploy-web`'s steps, throwaway Cognito users, dev table and Polly via `fless-takemyword`; no Terraform, no api deploy, no prd).

## om-developer notes
