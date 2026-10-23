import type { Dictionary } from "./i18n.ts";
import type { ReleaseLinks } from "./links.ts";
import type { Locale } from "./locale.ts";
import { publicPath } from "./seo.ts";

export const author = "Sebastian Flores";

export interface StructuredDataInput {
  locale: Locale;
  t: Dictionary;
  origin: string;
  version: string | null;
  links: Pick<ReleaseLinks, "windowsInstaller" | "license" | "repository">;
}

export function structuredData({ locale, t, origin, version, links }: StructuredDataInput) {
  const page = `${origin}${publicPath(locale)}`;
  const authorId = `${origin}/#author`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        url: `${origin}/`,
        name: t.meta.title,
        description: t.meta.description,
        inLanguage: ["en", "es"],
        author: { "@id": authorId },
      },
      { "@type": "Person", "@id": authorId, name: author },
      {
        "@type": "SoftwareApplication",
        "@id": `${origin}/#app`,
        name: t.meta.title,
        description: t.meta.description,
        url: page,
        inLanguage: locale,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Windows 10, Windows 11",
        downloadUrl: links.windowsInstaller,
        ...(version === null ? {} : { softwareVersion: version }),
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        isAccessibleForFree: true,
        license: links.license,
        sameAs: links.repository,
        author: { "@id": authorId },
      },
      {
        "@type": "FAQPage",
        "@id": `${page}#faq`,
        url: page,
        inLanguage: locale,
        mainEntity: t.landing.faq.items.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
    ],
  };
}

export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
