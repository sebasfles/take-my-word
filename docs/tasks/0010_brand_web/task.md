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

Direction (om-manager, 2026-10-21, after round 1): A "Tinta", because the quote-into-bars mark is ownable and reads at 16 px, and Fraunces with terracotta on paper is the warm, editorial, voice-first brief; B's bubble is the category cliché and blurs at 16 px, C's comma and arcs read as the contactless glyph.
Adjustments: the first screen is composed at 1280x800 and 1440x900 (no empty lower 40%); one full-bleed accent band lower on the landing while the hero stays calm; the demo card's rotation stays crisp at every width or is dropped; optical spacing between "My" and the italic "Word" at nav size; the "Escuchando" overlay pill becomes a brand primitive for 0011.
B and C leave the branch; their screenshots stay in `screenshots/directions/`.

Language (Sebastian, 2026-10-21, after round 1, corrected the same day; adjusts Scope "Spanish and English", the voice guide and the Lighthouse page): the `tmw-lang` cookie set by the switch wins; without it the page follows `Accept-Language` (the highest-weighted of `es` or `en`, any region), and English for anything else or no header. This replaces 0004's "no `Accept-Language` detection".
Landing, sign-in and account follow it; both dictionaries stay complete with the same keys.
The voice and tone guide is written English first, Spanish equally complete.
The hero demo's primary example is English before and after, with a Spanish one as the multilingual example.
The OG image is English (crawlers send no Spanish preference); Lighthouse runs with its default `en-US`.
The e2e covers English with no header or another language, Spanish from an `es` header, and the switch overriding the header across reloads; the behaviors pinned before stay covered.
Dictation languages (Sebastian): if 0008's `dictationLanguages` setting reaches `develop` before the PR, rebase and show it read-only on the Account page, parsed with the `packages/shared` schema; if it has not landed, nothing is built for it.

clearance: full (dev only: web code and assets deployed to dev from this machine with `reusable-deploy-web`'s steps, throwaway Cognito users, dev table and Polly via `fless-takemyword`; no Terraform, no api deploy, no prd).

## om-developer notes

### Round 1

Did:

- Three directions as real code in `packages/brand/src/directions/{a,b,c}/` (tokens, generated `tokens.css`, mark, app icon, wordmark, hero, fonts with OFL), sharing `board.tsx`, `demo.tsx`, `header.tsx` and `copy.ts`.
  A "Tinta": Fraunces and Instrument Sans, terracotta on paper, a quotation mark that turns into three bars.
  B "Pulso": Bricolage Grotesque and Figtree, marigold on cream, a speech bubble with the waveform inside.
  C "Eco": Instrument Serif and Schibsted Grotesk, laurel green on ivory, a comma that ripples into sound waves.
- `packages/brand` foundations meant to stay: the `Tokens` schema (`tokens.ts`), `tokensCss` generator (`css.ts`, `scripts/generate.ts`), WCAG contrast (`color.ts`) and the pair list for Acceptance 3 (`contrast.ts`), the `Waveform` component (`waveform.tsx`, `waveform.css`; level or demo loop, static under reduced motion in demo mode, no transition in level mode).
- Tests: generated CSS equals the generator output per direction; every text pair of `contrast.ts` meets AA in light and dark for all three directions; contrast math against WCAG reference values; the gallery gate in `apps/web`.
- Gallery routes `/directions/[id]` (board) and `/directions/[id]/hero` in `apps/web`, behind `TMW_GALLERY=1`, which only `pnpm screenshots` sets; `noindex`.
- `pnpm screenshots <dir> directions` renders, per direction, board and hero at 390 and 1280 in light and dark, a listening frame of the hero, and the 16 px favicon, tray and size row at device scale 1; it fails on horizontal overflow.
  The hero frames are frozen with the Web Animations API at fixed points of the 9 s loop.
- Wiring: `@take-my-word/brand` in `apps/web` (`transpilePackages`), `packages/brand/` in the `reusable-changes` web filter and in the `deploy-dev` and `deploy-prd` path triggers, `brand` rows in `docs/TRD.md` (components and verification), react-hooks lint on `packages/brand/**/*.tsx`, generated `tokens.css` excluded from Prettier.

Screenshots: `.workspaces/0010_brand_web/screenshots/directions/{a,b,c}/`, files `board-{light,dark}-{390,1280}.png`, `hero-{light,dark}-{390,1280}.png`, `hero-listening-{light,dark}-{390,1280}.png`, `favicon-16-*-1x.png`, `tray-16-*-1x.png`, `mark-sizes-*-1x.png`.

Pending, after the direction is chosen: everything else in Scope, starting with promoting the chosen direction to the package root and deleting the other two with their fonts.

Decisions not in the plan:

- Token CSS custom properties are unprefixed and grouped by kind (`--color-*`, `--accent-*`, `--neutral-*`, `--font-*`, `--text-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--z-*`, `--duration-*`, `--ease-*`); the generator scopes them to a selector so the same code serves `:root` later.
- Theme selectors are `[data-theme="dark"]` and `:not([data-theme="light"])` under `prefers-color-scheme`, matching the cookie-driven attribute on `<html>` from Context & decisions.
- Semantic success, warning, error and info colors are shared across directions; only accent, neutrals, surfaces, fonts, weights, tracking and radii vary.
- Fonts are the Google Fonts latin subset (covers every Spanish diacritic and «» ¿ ¡); subsetting and fallback metrics are tuned only for the chosen direction.
- The hero demo is pure CSS keyframes on one 9 s loop (`--duration-demo`), no JavaScript.

External actions:

- Deployed `6592c0a` to dev with `reusable-deploy-web`'s steps from this machine (`fless-takemyword`, us-east-1): `_next/static` synced immutable to `take-my-word-dev-web-assets-115891590483`, `take-my-word-dev-web` code updated (CodeSha256 `kn/6b8IGSbFn0jwrdbr4XEmh5DgDUxTiUPUfGXbTxCI=`), remaining assets synced, CloudFront `EMI6CYP83OTMO` invalidated (`I1HXO3YALK6ULZN3DDR9M2P7NT`).
  Checked after: `/` and `/sign-in` 200, `/directions/a` and `/directions/a/hero` 404.
- `pnpm integration` and `pnpm e2e` ran against that deployment with throwaway users; all green.

Verified targets: `brand`, `web` (with integration and e2e) and `workflows`, the ones this diff touches; `api`, `desktop`, `shared`, `cognito` and `infra` are untouched.

### Round 2

Did, per the om-reviewer's round 1 message and the Language block:

- Direction A promoted to the root of `packages/brand`: tokens in `tokens.ts`, `tokens.css` generated at `:root`, fonts, mark, app icon and an outlined wordmark; B, C, their fonts and OFL files, `directions/`, the board, `views.ts` and the `/directions` routes deleted. `screenshots/directions/` left untouched.
- Adjustment 1: the hero sits under the header without a forced height, so at 1280x800 and 1440x900 the first screen is the hero plus the start of "How it works"; shots in `screenshots/hero/first-screen-*-{1280x800,1440x900,390x844}.png`.
- Adjustment 2: the dictionary section is a full-bleed accent band; its text is `on-accent` on `accent`, already a contrast pair.
- Adjustment 3: the demo card's rotation is dropped (rotated text always resamples); a flat offset sheet behind it keeps the paper feel and the text stays crisp.
- Adjustment 4: the wordmark is now outlined paths generated from Fraunces with the spacing before the italic "Word" set by hand, so it renders the same at nav size, in the OG card and on desktop, and never shifts with font loading.
- Adjustment 5: `OverlayPill` in `packages/brand/src/ui/overlay-pill.tsx`: listening (level or demo loop), processing, done, error; `role="status"`; reduced motion honored through the waveform; ink-dark in both themes through new `overlay`, `on-overlay`, `overlay-accent` roles. The hero demo uses it.
- Instruction 8: the version comes from the latest release's `latest.json`, parsed with `desktopReleaseManifestSchema` in `packages/shared`, cached 15 minutes, 2.5 s timeout, streamed in a Suspense boundary so it never blocks; without it the button shows "For Windows 10 and 11".
- Instruction 9: resting frames show the struck words in `muted` on `surface` (5.9:1 light, 7.9:1 dark); only mid-animation chunks fade.
- Language: English default; cookie, then `Accept-Language` (highest q of `es` or `en`, any region, `*` ignored, malformed entries skipped), else English; `<html lang>` follows the rendered locale. Copy lives in `src/lib/copy/{en,es}.ts` with a test that both have the same keys. The hero demo leads with the page language and the bilingual block shows the other one. Voice and tone guide in `packages/brand/README.md`, English first.
- Scope: primitives (button, text input, select, textarea, checkbox, toggle, dialog, toast, tabs, nav item, badge, empty state, skeleton, overlay pill) with keyboard and ARIA tests, shown in `/gallery` behind `TMW_GALLERY=1`; asset generator (`pnpm assets`): SVG masters, favicon `.ico` 16/32/48, favicon SVG, apple-touch, PWA 192/512/maskable, Windows `app.ico` up to 256, 1024 master, English OG card; font subsetter (`pnpm fonts`): Latin plus Spanish, SOFT, WONK and opsz pinned, 78 KB for three faces; landing (hero, how it works, bilingual example, dictionary band, styles, per-app rules, privacy, download, footer), sign-in and choose-password, account shell and the five pages with empty, loading and error states; theme switch (system, light, dark) in a `tmw-theme` cookie rendered as `data-theme` on `<html>`, no inline script; metadata with favicons, manifest, Open Graph and Twitter cards from `WEB_ORIGIN`.
- Acceptance 6: `src/lib/token-lint.ts` and its test reject literal colors, font families, font sizes, spacing, insets, radii, shadows and durations in `apps/web` CSS and TSX; breakpoints are exempt. A second test fails when a stylesheet references a custom property nobody defines; it caught the generator omitting the `size` group.
- E2E: the 0004 and 0009 suites now run in English and switch to Spanish where they pinned Spanish; every assertion kept. New: no header or another language gets English, an `es` header gets Spanish, the switch overrides the header across reloads, and the theme choice is remembered and rendered on the server.
- `dictationLanguages` from 0008 is not on `develop` (checked 2026-10-21 23:05 UTC); nothing built for it.

Evidence, in `.workspaces/0010_brand_web/`:

- `screenshots/{en,es}/{light,dark}/{page}-{390,768,1280}.png` for landing, sign-in, sign-in-error, choose-password, account, dictionary, styles, rules, history, history-open, and each account page `-empty`, `-loading`, `-error`; the script fails on horizontal overflow.
- `screenshots/hero/`: first screens, listening frames, `reduced-motion-{390,1280}.png`, `loop-{390,1280}.webm`, `favicon-16.png`.
- `screenshots/gallery/`: primitives and the open dialog, both themes, three widths.
- `screenshots/social/opengraph-xyz.png`: the dev URL in a public social preview.
- `lighthouse/landing-run-{1,2,3}.json`: mobile preset, en-US, after a warm-up request; performance 98, 98, 99; accessibility 100; best practices 100; SEO 100; CLS 0.000, 0.002, 0.000.

Decisions not in the plan:

- Fonts reach the web through `next/font/local` over the brand's woff2 files: it serves them from `/_next/static`, preloads them with `Link` headers and sets `--font-face-display` and `--font-face-text`, which the font tokens read first; desktop keeps `index.css` with the brand's `@font-face`. The first deploy without preload measured CLS 0.112 from the swap.
- The mark has two glyphs: the full one (quote and three bars) and a pixel-aligned one (quote and two bars) for 48 px and below; components and icons switch on their own.
- Primitives use `tmw-` prefixed classes in plain CSS (`ui/ui.css`) so they never collide with app styles.
- The release manifest schema lives in `packages/shared`, since the web consumes a contract the desktop release produces.
- The theme switch is a radio group shown in the header from 480 px and always in the footer, so it is reachable on phones.
- The hero demo and the landing examples follow the page language; the bilingual block shows the other language.
- Brand assets are copied into `apps/web/public/static` by `pnpm --filter @take-my-word/web static`; a test fails if the copies differ from the brand's.

Deferred:

- `public/static/icon.svg` from 0004 is deleted from the repo but stays in the dev bucket, since the deploy syncs without `--delete`; harmless.
- `desktop-ci` does not watch `packages/brand/` yet; 0011 adds it when the desktop consumes the package.

External actions:

- Deployed `aa77dae`, then `5ef1197`, to dev with `reusable-deploy-web`'s steps (`fless-takemyword`, us-east-1): static assets to `take-my-word-dev-web-assets-115891590483`, `take-my-word-dev-web` code updated (final CodeSha256 `RJHAM59hFlsgb4yav2Hsx4FYfH+loKtwyS019wHtrss=`), CloudFront `EMI6CYP83OTMO` invalidated (`I48OA6OK6JMLGT7AIUQ7DX44V`, `I6ISLLONMSH3OIGMLL2SRVJ1ID`).
- The SDK's SSO token expired mid-run; integration and e2e ran with the profile's still-valid role credentials exported through `aws configure export-credentials`, same account and role.
- Lighthouse and the opengraph.xyz preview read the public dev URL only.

Verified targets: `brand`, `shared`, `web` (with integration and e2e against `5ef1197` on dev) and `workflows`.

### Round 3

Did, one per finding:

1. Version note: `font-variant-numeric: tabular-nums` on `.download-note` (Instrument Sans ships `tnum`, kept by the subset), so "0.1.1" no longer reads "0.11"; both facts end in a period ("Version 0.1.1 for Windows 10 and 11. macOS and Linux soon." and the Spanish twin), which separates them on one line and when they wrap. The e2e pins the period.
2. `generateViewport` reads `currentTheme()`; `themeColor()` in `lib/theme.ts` returns the forced theme's `bg` or the media pair for system, from `tokens`. The switch also repaints the `theme-color` meta, so the chrome changes without a reload. Unit test for both cases; the e2e theme test checks the server-rendered meta after forcing dark on a light system.
3. Token lint: local custom properties now get the color, length (percent allowed) and duration checks, and `var()` fallbacks are checked instead of stripped (nested fallbacks too). Eight new rejects in the table; the accepted sample now includes `--skeleton-width: 40%` and a fallback to another token.
4. `Checkbox` merges a caller's `aria-describedby` with its hint, like the other fields; test in `controls.test.tsx` covers it and `TextInput`.

Evidence refreshed: all screenshots, `lighthouse/landing-run-{1,2,3}.json` on 83c5b03 (performance 99, 99, 98; the rest 100; CLS 0.000).

Blocked, not by this round's code: the account e2e asserts the seeded user's language is "Spanish", and dev's API now answers "English" for every user.
`take-my-word-dev-api` and `-dictate` were redeployed at 23:21 UTC from code that is not on `develop` (most likely 0008): `GET /me/settings` returns `dictationLanguages` and `PUT` ignores `locale`.
The other twelve e2e pass against 83c5b03, the two that the failure skipped included.
Per the Language decision, `dictationLanguages` is shown only once it reaches `develop`; nothing built for it.

External actions:

- Deployed 83c5b03 to dev the same way (CodeSha256 `QJykBgsIm2HkrwGJWfDkmziJzQMW7IsPLVPlXQ3y8tM=`, invalidation `I154MF8JU30KG0MRYBBJZ7G9T3`).
- Created and removed one throwaway Cognito user to read dev's `/me/settings` before and after a `PUT`.

### Between rounds 3 and 4

Dev web restored to `develop` at the om-manager's request (0008 owns the dev web until it merges):

- Built from a temporary detached worktree of `origin/develop` at `8fe11f1` inside `.workspaces/0010_brand_web/`, removed afterwards; `pnpm install --frozen-lockfile`, then `reusable-deploy-web`'s steps.
- `take-my-word-dev-web` CodeSha256 `9bK84HudywmJKGRuyNrFgWCcHJ/Jx7IF8V8rj55jHpA=`, CloudFront `EMI6CYP83OTMO` invalidation `IBNQW52LICLU15CTW2WCPM7B04`.
- Checked: `/` and `/sign-in` answer 200 with develop's markup (`lang="es"`, "Tu palabra, nuestra orden.", `/static/icon.svg`, `<h1>Inicia sesión</h1>`, no brand tokens).
- No web deploy to dev from 0010 until the om-reviewer says 0008 is on `develop`.

### Round 4

Did:

- Rebased on `origin/develop` at `e11dfaa` (0008, PR #14); no conflicts. 0008's settings contract (`dictationLanguages`, `settingsSchema` in `packages/shared`) and its e2e helper (throwaway users on `["es"]`) come from develop; no schema duplicated in `apps/web`.
- Account shows "Dictation languages" / "Idiomas de dictado" read-only, from `settings.dictationLanguages` parsed by the shared schema, as a localized list in the page's language (`languageList` in `lib/account.ts`: "Spanish and English", "Inglés y español"), with a unit test. The e2e asserts it reads "Spanish" in English and "Español" after the switch, next to the unchanged `account-language` assertion.
- Screenshot mocks follow the new contract: the seeded user dictates in `["es", "en"]` (the two-language case), the new user in `["en"]`; every page and state refreshed in `screenshots/{en,es}/{light,dark}/`.
- The landing is unchanged, so Lighthouse was not rerun; the round 3 reports stand.

Checked before the e2e: deploy-dev run 39707543518 for `e11dfaa` succeeded; dev's Lambdas match the hashes it logged: api `6uG5v2vOf2Jw+GJHtwOvPjeWE24UobDM7SAN5+HIoHc=`, dictate `7PPsk0De4KoXNhxfoSvPDKGfdFmtaAjo3QNBrXfn2Hw=`, authorizer `7eAJ/cr1URhZ7QpNeAGhD/ZH8uOchWF5UWvg0yehZdo=`, dictionary-usage `Gww06rIfOuHnNgoywsScrTue8VojbhfHKNSzp/c5bsM=`.

External actions:

- Deployed `1dc7c2e`'s web to dev with `reusable-deploy-web`'s steps after that run (web CodeSha256 `zRTmT/BM8LGLYJ39auTxe2L19rTdSOjBpbbumsPLEdg=`, invalidation `I6SN0Q2NFBJM2MFFLHD7NFBRET`); no api or dictate deploy from 0010.
- Integration and the 13 web e2e ran green against that deployment.
