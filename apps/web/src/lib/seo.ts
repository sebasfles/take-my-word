import type { MetadataRoute } from "next";
import { locales, type Locale } from "./locale.ts";

const localHosts = new Set(["localhost", "127.0.0.1"]);

export function indexedOrigin(value: string | undefined): string | null {
  if (value === undefined || value === "") return null;
  const url = URL.canParse(value) ? new URL(value) : null;
  const secure =
    url?.protocol === "https:" || (url?.protocol === "http:" && localHosts.has(url.hostname));
  if (url === null || !secure || url.origin !== value) {
    throw new Error(
      `WEB_INDEXED_ORIGIN must be the origin search engines may index, as https://<host>, or empty; got ${JSON.stringify(value)}`,
    );
  }
  return value;
}

export function isIndexed(webOrigin: string, indexed: string | null): boolean {
  return indexed !== null && webOrigin === indexed;
}

export function publicPath(locale: Locale): string {
  return `/${locale}`;
}

export function isPublicPath(pathname: string): boolean {
  return locales.some((locale) => pathname === publicPath(locale));
}

export function robotsTag(pathname: string, indexed: boolean): string | null {
  return indexed && isPublicPath(pathname) ? null : "noindex";
}

export function languageAlternates(origin = ""): Record<Locale | "x-default", string> {
  return {
    en: `${origin}${publicPath("en")}`,
    es: `${origin}${publicPath("es")}`,
    "x-default": `${origin}/`,
  };
}

export function robotsFile(origin: string): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${origin}/sitemap.xml`,
  };
}

export function sitemapFile(origin: string, lastModified: string): MetadataRoute.Sitemap {
  return locales.map((locale) => ({
    url: `${origin}${publicPath(locale)}`,
    lastModified,
    alternates: { languages: languageAlternates(origin) },
  }));
}

export function builtAt(value: string | undefined): string {
  if (value === undefined || Number.isNaN(Date.parse(value))) {
    throw new Error(`WEB_BUILT_AT must be the build's ISO timestamp; got ${JSON.stringify(value)}`);
  }
  return value;
}
