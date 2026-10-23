import type { Metadata, Viewport } from "next";
import type { Dictionary, Locale } from "../i18n.ts";
import { indexedOrigin, isIndexed, languageAlternates, publicPath } from "../seo.ts";
import { themeColor, type Theme } from "../theme.ts";
import { webConfig } from "./config.ts";
import { currentDictionary } from "./request.ts";

const buildIndexedOrigin = indexedOrigin(process.env.WEB_INDEXED_ORIGIN);

export function deploymentIndexed(): boolean {
  return isIndexed(webConfig().webOrigin, buildIndexedOrigin);
}

export function siteMetadata(t: Dictionary, locale: Locale, path: string): Metadata {
  const og = { url: "/static/og.png", width: 1200, height: 630, alt: t.meta.ogAlt };
  return {
    metadataBase: new URL(webConfig().webOrigin),
    title: t.meta.title,
    description: t.meta.description,
    applicationName: t.meta.title,
    icons: {
      icon: [
        { url: "/static/favicon.ico", sizes: "16x16 32x32 48x48" },
        { url: "/static/favicon.svg", type: "image/svg+xml" },
      ],
      apple: "/static/apple-touch-icon.png",
    },
    openGraph: {
      type: "website",
      url: path,
      siteName: t.meta.title,
      title: t.meta.title,
      description: t.meta.description,
      locale: locale === "es" ? "es_MX" : "en_US",
      alternateLocale: locale === "es" ? "en_US" : "es_MX",
      images: [og],
    },
    twitter: {
      card: "summary_large_image",
      title: t.meta.title,
      description: t.meta.description,
      images: [og],
    },
  };
}

export function landingMetadata(t: Dictionary, locale: Locale): Metadata {
  const path = publicPath(locale);
  const base = siteMetadata(t, locale, path);
  return {
    ...base,
    title: t.meta.landingTitle,
    alternates: { canonical: path, languages: languageAlternates() },
    openGraph: { ...base.openGraph, title: t.meta.landingTitle },
    twitter: { ...base.twitter, title: t.meta.landingTitle },
    robots: deploymentIndexed() ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export function siteViewport(theme: Theme): Viewport {
  return { themeColor: themeColor(theme) };
}

export async function sectionMetadata(title: (t: Dictionary) => string): Promise<Metadata> {
  const t = await currentDictionary();
  return { title: `${title(t)} · ${t.meta.title}` };
}
