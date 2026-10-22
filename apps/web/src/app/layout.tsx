import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { themeAttribute, themeColor } from "@/lib/theme.ts";
import { webConfig } from "@/lib/server/config.ts";
import { currentDictionary, currentLocale, currentTheme } from "@/lib/server/request.ts";
import { displayFace, textFace } from "./fonts.ts";
import "@take-my-word/brand/web.css";
import "../styles/base.css";
import "../styles/site.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await currentDictionary();
  const locale = await currentLocale();
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
      url: "/",
      siteName: t.meta.title,
      title: t.meta.title,
      description: t.meta.description,
      locale: locale === "es" ? "es_MX" : "en_US",
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

export async function generateViewport(): Promise<Viewport> {
  return { themeColor: themeColor(await currentTheme()) };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const t = await currentDictionary();
  return (
    <html
      lang={await currentLocale()}
      data-theme={themeAttribute(await currentTheme())}
      className={`${displayFace.variable} ${textFace.variable}`}
    >
      <body>
        <a className="skip-link" href="#main">
          {t.skip}
        </a>
        {children}
      </body>
    </html>
  );
}
