---
phase: 3
branch: feat/0016_self_hosting
updated: 2026-10-23
---

# Phase 3: Landing, SEO and the root README

## Scope

- Public pages at `/en` and `/es`, each canonical with hreflang en, es and x-default; `/` is the x-default and redirects (307) by the `tmw-lang` cookie, then Accept-Language; sign-in, account and gallery keep today's language choice and are noindex and out of the sitemap.
- "Run your own" section in the 0010 design: open source (MIT), your own AWS account, the steps with the skill first, link to `self-host/` on GitHub, real dated cost with links (about 1.30 USD per month for prd on AWS, Groq and OpenAI list prices, an example month at 15 minutes a day, free tiers), the same numbers as `self-host/README.md`.
- FAQ section (what it is, privacy, cost, how to run your own).
- `robots.txt` and `sitemap.xml` from the web app (public pages in es and en, `lastmod`, sitemap linked from robots); titles, descriptions, Open Graph and Twitter on every public page; JSON-LD `SoftwareApplication`, `WebSite`, author `Person`, `FAQPage`; semantic HTML.
- Indexing: the official prd is indexed; the official dev and self-hosted deployments are noindex by default through a config flag (meta and `X-Robots-Tag`, crawling allowed).
- Root `README.md`: what it is, screenshots, a visible "Run your own" part that recommends the skill over the command and links to `self-host/`, license.

## Acceptance

1. Landing screenshots of the new sections, es and en, light and dark, at 390, 768 and 1280 px.
2. From dev, while the om-manager hands it out: `robots.txt` and `sitemap.xml` responses, the JSON-LD validator output, Lighthouse with crawlability as the only miss; dev is redeployed with develop's code when freed.
3. Lighthouse SEO 100 on the public pages on a local production build with indexing on, and 0010's performance bar kept.
4. The private pages answer noindex and are not in the sitemap.

## om-developer notes

### Round 1

Code is commit 8f3a3c4, which the verify blocks name; this commit carries only these notes and verify.log.

Done:

- Routes: `app/en` and `app/es` are static segments, each with a small root layout, sharing `components/landing/landing.tsx`; sign-in, account and gallery moved to the route group `app/(account)` with today's cookie-then-Accept-Language root layout and `noindex, follow` metadata.
  `app/global-not-found.tsx` (`experimental.globalNotFound`) and `(account)/not-found.tsx` render one bilingual 404, since there is no single root layout any more.
- `src/proxy.ts` (`lib/site-proxy.ts`): `/` answers 307 to `/en` or `/es` by `tmw-lang`, then Accept-Language, keeping the query, with `Vary: Cookie, Accept-Language`; every response except `/en` and `/es` on the indexed origin gets `X-Robots-Tag: noindex`.
- Indexing: the build bakes `WEB_INDEXED_ORIGIN` (empty means none); a page is indexed only when the runtime `WEB_ORIGIN` equals it, so one build serves dev and prd and a copy of the official build elsewhere stays noindex. Meta robots follows the same rule.
  `deployment.json` gains `indexed` (default false; `https://<domain>` when true), passed by `pnpm selfhost` and `pnpm deploy:web build`; CI reads the repository variable `WEB_INDEXED_ORIGIN`.
- `robots.txt` (allow all but `/api/`, sitemap link) and `sitemap.xml` (`/en` and `/es`, hreflang alternates with x-default, `lastmod` from the build time in `WEB_BUILT_AT`), both from the runtime origin.
- Metadata: per-locale title "Take My Word · Voice dictation for Windows", description, canonical, hreflang en, es and x-default, Open Graph with `alternateLocale`, Twitter card.
  JSON-LD `@graph` with `WebSite`, `Person` (Sebastian Flores), `SoftwareApplication` (Windows 10 and 11, price 0, installer URL, latest release version when readable, MIT license) and `FAQPage` built from the visible FAQ copy, escaped against `</script>`, streamed in a Suspense boundary so the release lookup never blocks the page.
- Landing: "Run your own" (open source, MIT, four steps with the skill recommended, guide link to `self-host/` on GitHub and the license, the cost card with dated prices and links) and a four-question FAQ, es and en, in the 0010 design; "Run your own" joins the header and footer navigation, the footer links the source code.
  A test holds every number the landing quotes to `self-host/README.md`, and both locales to the same numbers.
- Language switch on the landing is a real link to the other language page (crawlable, `hreflang`) that still stores `tmw-lang`; its accessible name now starts with the visible text ("ES, ver en español", "EN, view in English"), which Lighthouse flagged on `/en` (WCAG 2.5.3).
- `pnpm selfhost` redeploys when `releases` or `indexed` change, not only the commit: the deployed marker records the web build inputs. Before, a changed `releases` was never deployed.
- Root `README.md` with two screenshots in `.github/readme/`, the "Run your own" part recommending the skill, and the license.

Evidence (workspace, outside the repo):

- `screenshots/{en,es}/{light,dark}/landing-{390,768,1280}.png` and the crops `landing-self-host-*` and `landing-faq-*`, plus every other page refreshed.
- `lighthouse/local-{en,es}-run-{1,2,3}.json` and `summary.txt`: local production build with indexing on, mobile preset, Lighthouse 13.5.0, after a warm-up: SEO, accessibility and best practices 100 on every run, performance 97 to 99, CLS 0; the only miss is bf-cache (Next's `no-store`, not actionable).
- `seo/schema-validator-local-{en,es}.json`: validator.schema.org, 0 errors and 0 warnings for `SoftwareApplication`, `WebSite` and `FAQPage`.
- `seo/opennext-invoke.txt`: the OpenNext server function invoked locally with Function URL events: the 307s, indexed `/en` and `/es` on the indexed origin, noindex on dev's origin with the same build, noindex on private pages, robots, sitemap, the 404.
- `seo/local-robots.txt.txt`, `seo/local-sitemap.xml.txt`.

Pending:

- Acceptance 2 on dev (robots and sitemap responses, the validator on the dev URL, Lighthouse with crawlability as the only miss) and web `integration` and `e2e` (updated for `/en` and `/es` and a new SEO test): dev is held by 0015 until the om-reviewer passes "dev available".
- The core, dev and prd plans after the rebase on 0015, once it merges.

Actions variable for the om-manager before merge (repository level): `WEB_INDEXED_ORIGIN` = `https://<official prd domain>`; dev builds read it too and stay noindex because their origin differs.

Decisions not in the plan:

- Static `en/` and `es/` segments with their own root layouts instead of a dynamic `[lang]`: Next renders a 404 under a dynamic root segment as an empty client shell, so `/fr` served a blank page.
- Indexing decided by comparing a build-time origin with the runtime `WEB_ORIGIN`, not by a Lambda variable, so the Terraform plans stay empty and the one-build-many-envs selfhost path works.
- robots.txt does not disallow the private pages, so crawlers can read their noindex.
- `/` is a 307 from the proxy rather than a page, and the landing switch is a link, so both language pages are reachable without cookies or JS.

Deferred:

- None.

### Round 2

Code is commit bc0f15f, which the verify block names; this commit carries only these notes and verify.log.
Only `apps/web` changed, so web is the only target re-run.

Done, one per finding:

1. `robotsTag` lets `/` through on the indexed origin, so the x-default's 307 carries no noindex there; dev and self-hosted still answer noindex on `/`. Covered in `seo.test.ts` and `site-proxy.test.ts`.
2. The landing's sign-in links (header, "Already have an account?") and the footer's go to `/sign-in?lang=<page language>`; the proxy stores `tmw-lang` with the same cookie as the switch (`lib/preference.ts`, now shared with `localeHandler`) and answers 307 to `/sign-in` without `lang`, keeping any other parameter; an unknown language is dropped without a cookie.
   Those links are plain anchors now, since they cross root layouts and the proxy redirects them.
   Unit tests in `site-proxy.test.ts`; a new e2e ("signs in from /es in Spanish for an English browser with no language cookie") runs on dev; the same flow passed locally on a production build: `/es`, header sign-in, `/sign-in` with `lang="es"` and "Inicia sesión".
3. Landing inline code keeps `white-space: nowrap` (applied after round 1's screenshots were taken); every page screenshot is refreshed, including the 390 crops.

Evidence refreshed: `seo/opennext-invoke.txt` (the `/` 307 without noindex on the indexed origin, noindex on dev's).

## Result
