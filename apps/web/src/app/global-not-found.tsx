import type { Metadata } from "next";
import { NotFoundContent } from "@/components/not-found-content.tsx";
import { SiteDocument } from "@/components/site-document.tsx";
import { dictionary } from "@/lib/i18n.ts";

const t = dictionary("en");

export const metadata: Metadata = {
  title: `${t.notFound.title} · ${t.meta.title}`,
  robots: { index: false, follow: true },
};

export default function GlobalNotFound() {
  return (
    <SiteDocument locale="en" theme="system" t={t}>
      <NotFoundContent />
    </SiteDocument>
  );
}
