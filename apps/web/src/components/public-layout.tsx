import type { Viewport } from "next";
import type { ReactNode } from "react";
import { dictionary, type Locale } from "@/lib/i18n.ts";
import { siteViewport } from "@/lib/server/metadata.ts";
import { currentTheme } from "@/lib/server/request.ts";
import { SiteDocument } from "./site-document.tsx";

export async function publicViewport(): Promise<Viewport> {
  return siteViewport(await currentTheme());
}

export async function PublicLayout({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <SiteDocument locale={locale} theme={await currentTheme()} t={dictionary(locale)}>
      {children}
    </SiteDocument>
  );
}
