import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { SiteDocument } from "@/components/site-document.tsx";
import { siteMetadata, siteViewport } from "@/lib/server/metadata.ts";
import { currentDictionary, currentLocale, currentTheme } from "@/lib/server/request.ts";

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...siteMetadata(await currentDictionary(), await currentLocale(), "/"),
    robots: { index: false, follow: true },
  };
}

export async function generateViewport(): Promise<Viewport> {
  return siteViewport(await currentTheme());
}

export default async function AccountRootLayout({ children }: { children: ReactNode }) {
  return (
    <SiteDocument
      locale={await currentLocale()}
      theme={await currentTheme()}
      t={await currentDictionary()}
    >
      {children}
    </SiteDocument>
  );
}
