import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Gallery } from "@/components/gallery.tsx";
import { SiteHeader } from "@/components/site-header.tsx";
import { galleryEnabled } from "@/lib/gallery.ts";
import { currentDictionary, currentLocale, currentTheme } from "@/lib/server/request.ts";
import "@/styles/gallery.css";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function GalleryPage() {
  await connection();
  if (!galleryEnabled(process.env)) notFound();
  const t = await currentDictionary();
  return (
    <>
      <SiteHeader locale={await currentLocale()} theme={await currentTheme()} t={t} brandHref="/" />
      <main id="main" className="container gallery">
        <Gallery />
      </main>
    </>
  );
}
