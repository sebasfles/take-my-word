import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { currentDictionary, currentLocale } from "@/lib/server/request.ts";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await currentDictionary();
  return {
    title: t.meta.title,
    description: t.meta.description,
    icons: { icon: "/static/icon.svg" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0a09" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={await currentLocale()}>
      <body>{children}</body>
    </html>
  );
}
