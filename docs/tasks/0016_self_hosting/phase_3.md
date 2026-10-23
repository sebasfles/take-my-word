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

## Result
