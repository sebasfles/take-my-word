import type { Metadata } from "next";
import { NotFoundContent } from "@/components/not-found-content.tsx";
import { dictionary } from "@/lib/i18n.ts";

const t = dictionary("en");

export const metadata: Metadata = { title: `${t.notFound.title} · ${t.meta.title}` };

export default function AccountNotFound() {
  return <NotFoundContent />;
}
